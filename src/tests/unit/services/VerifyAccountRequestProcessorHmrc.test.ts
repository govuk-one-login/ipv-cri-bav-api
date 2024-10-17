/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { hmrcVerifyResponse } from "../data/hmrcEvents";
import { CopCheckResults } from "../../../models/enums/Hmrc";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { ISessionItem } from "../../../models/ISessionItem";
import { PersonIdentityItem } from "../../../models/PersonIdentityItem";
import { BavService } from "../../../services/BavService";
import { VerifyAccountRequestProcessor } from "../../../services/VerifyAccountRequestProcessor";
import { HmrcService } from "../../../services/HmrcService";
import { Constants } from "../../../utils/Constants";

const vendorUuid = "new vendorUuid";
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => vendorUuid,
}));
const mockBavService = mock<BavService>();
const mockHmrcService = mock<HmrcService>();
const logger = mock<Logger>();
const metrics = new Metrics({ namespace: "BAV" });
const TOKEN_SSM_PARAM = "dfsgadfgadg";
const hmrcToken = "token"
const sessionId = "sessionId";
const encodedTxmaHeader = "ABCDEFG";
const body = {
	sort_code: "123456",
	account_number: "12345678",
};
const clientIpAddress = "127.0.0.1";
const person: PersonIdentityItem = {
	sessionId,
	name: [{
		nameParts: [{
			value: "Frederick",
			type: "GivenName",
		},
		{
			value: "Joseph",
			type: "GivenName",
		},
		{
			value: "Flintstone",
			type: "FamilyName",
		}],
	}],
	birthDate: [{
		value: "12-01-1986",
	}],
	expiryDate: 123456789,
	createdDate: 123456789,
};
const session = require("../data/db_record.json") as ISessionItem;
let verifyAccountRequestProcessorTest: VerifyAccountRequestProcessor;

describe("VerifyAccountRequestProcessor", () => {
	beforeAll(() => {
		verifyAccountRequestProcessorTest = new VerifyAccountRequestProcessor(logger, metrics, TOKEN_SSM_PARAM);
		// @ts-ignore
		verifyAccountRequestProcessorTest.BavService = mockBavService;
		// @ts-ignore
		verifyAccountRequestProcessorTest.HmrcService = mockHmrcService;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(new Date(1585695600000));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("#processHmrcRequest", () => {
		it("returns error response if person identity cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(undefined);

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No person found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No person found for session id", {
				messageCode: MessageCodes.PERSON_NOT_FOUND,
			});
		});

		it("returns error response if session cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(undefined);

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No session found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No session found for session id", {
				messageCode: MessageCodes.SESSION_NOT_FOUND,
			});
		});

		it("generates and saves vendorUuid if one doesn't exist", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, vendorUuid: undefined });
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(mockBavService.saveVendorUuid).toHaveBeenCalledWith(sessionId, vendorUuid);
	  });
      
		it("returns error response if session has exceeded attemptCount", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: Constants.MAX_VERIFY_ATTEMPTS });

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe("Too many attempts");
			expect(logger.error).toHaveBeenCalledWith(`Session attempt count is ${Constants.MAX_VERIFY_ATTEMPTS}, cannot have another attempt`, {
				messageCode: MessageCodes.TOO_MANY_RETRIES,
			});
		});

		it("saves account details to person identity table", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, vendorUuid: "HMRC_UUID" });
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(logger.appendKeys).toHaveBeenCalledWith({ govuk_signin_journey_id: session.clientSessionId });
			expect(mockBavService.saveVendorUuid).not.toHaveBeenCalled();
			expect(mockBavService.updateAccountDetails).toHaveBeenCalledWith(
				{	sessionId, accountNumber: body.account_number, sortCode: body.sort_code },
				process.env.PERSON_IDENTITY_TABLE_NAME,
			);
		});

		it("verifies the account details given", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(mockHmrcService.verify).toHaveBeenCalledWith({ accountNumber: body.account_number, sortCode: body.sort_code, name: "Frederick Joseph Flintstone", uuid: vendorUuid }, hmrcToken );
			expect(mockBavService.sendToTXMA).toHaveBeenNthCalledWith(1, "MYQUEUE", {
				event_name: "BAV_COP_REQUEST_SENT",
				component_id: "https://XXX-c.env.account.gov.uk",
				extensions: {
					evidence: [
				 		{
					 		txn: "new vendorUuid",
						},
					],
				},
				restricted:{
  				"CoP_request_details": [
					 {
  						name: "Frederick Joseph Flintstone",
  						sortCode: body.sort_code,
  						accountNumber: body.account_number,
  						attemptNum: 1,
					 },
  				],
		 		},
				timestamp: 1585695600,
				event_timestamp_ms: 1585695600000,
				user:  {
					govuk_signin_journey_id: session.clientSessionId,
					ip_address: clientIpAddress,
					session_id: session.sessionId,
					user_id: session.subject,
				},
			},
			"ABCDEFG",
			);
			expect(mockBavService.sendToTXMA).toHaveBeenNthCalledWith(2, "MYQUEUE", {
				event_name: "BAV_COP_RESPONSE_RECEIVED",
				component_id: "https://XXX-c.env.account.gov.uk",
				extensions: {
					evidence: [
				 		{
					 		txn: "new vendorUuid",
						},
					],
				},
				user:  {
					govuk_signin_journey_id: session.clientSessionId,
					ip_address: clientIpAddress,
					session_id: session.sessionId,
					user_id: session.subject,
				},
				timestamp: 1585695600,
				event_timestamp_ms: 1585695600000,
			},
			"ABCDEFG",
			);
		});

		it("pads account number if it's too short", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, { ...body, account_number: "123456" }, clientIpAddress, encodedTxmaHeader, hmrcToken);
			expect(mockBavService.updateAccountDetails).toHaveBeenCalledWith(
				{ sessionId, accountNumber: "00123456", sortCode: body.sort_code },
				process.env.PERSON_IDENTITY_TABLE_NAME,
			);
			expect(mockHmrcService.verify).toHaveBeenCalledWith({ accountNumber: "00123456", sortCode: body.sort_code, name: "Frederick Joseph Flintstone", uuid: vendorUuid }, hmrcToken );
		});

		it("saves saveCopCheckResult and returns success where there has been a match", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(mockBavService.saveCopCheckResult).toHaveBeenCalledWith(sessionId, CopCheckResults.FULL_MATCH, undefined);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});

		it("saves saveCopCheckResult with increased attemptCount if there was no match and returns success", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: 0 });
			mockHmrcService.verify.mockResolvedValueOnce({ ...hmrcVerifyResponse, nameMatches: "partial" });

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(mockBavService.saveCopCheckResult).toHaveBeenCalledWith(sessionId, CopCheckResults.PARTIAL_MATCH, 1);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 1 }));
		});

		it("returns success without attemptCount when there has been a FULL_MATCH", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: 1 });
			mockHmrcService.verify.mockResolvedValueOnce({ ...hmrcVerifyResponse, nameMatches: "yes" });

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});

		it("returns error response if cop check result is MATCH_ERROR", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce({ ...hmrcVerifyResponse, nameMatches: "error" });

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(response.statusCode).toBe(HttpCodesEnum.SERVER_ERROR);
			expect(response.body).toBe("Error received in COP verify response");
			expect(logger.warn).toHaveBeenCalledWith("Error received in COP verify response");
		});
	});

	describe("#calculateCopCheckResult", () => {
		it.each([
			{ nameMatches: "yes", accountExists: "yes", result: CopCheckResults.FULL_MATCH },
			{ nameMatches: "partial", accountExists: "yes", result: CopCheckResults.PARTIAL_MATCH },
			{ nameMatches: "no", accountExists: "yes", result: CopCheckResults.NO_MATCH },
			{ nameMatches: "indeterminate", accountExists: "yes", result: CopCheckResults.NO_MATCH },
			{ nameMatches: "inapplicable", accountExists: "yes", result: CopCheckResults.NO_MATCH },
			{ nameMatches: "error", accountExists: "yes", result: CopCheckResults.MATCH_ERROR },
			{ nameMatches: "yes", accountExists: "no", result: CopCheckResults.NO_MATCH },
			{ nameMatches: "yes", accountExists: "indeterminate", result: CopCheckResults.NO_MATCH },
			{ nameMatches: "yes", accountExists: "inapplicable", result: CopCheckResults.NO_MATCH },
			{ nameMatches: "yes", accountExists: "error", result: CopCheckResults.MATCH_ERROR },
		])("returns $result where nameMatches is $nameMatches and accountExists is $accountExists", ({ nameMatches, accountExists, result }) => {
			expect(
				verifyAccountRequestProcessorTest.calculateCopCheckResult({ ...hmrcVerifyResponse, nameMatches, accountExists }),
			).toBe(result);
		});

		it("calls savePartialNameInfo if CopCheckResults is PARTIAL_MATCH with a sortCodeBankName value", async () => {
			jest.useFakeTimers();
			jest.setSystemTime(new Date(1585695600000)); // == 2020-03-31T23:00:00.000Z
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: 0 });
			mockHmrcService.verify.mockResolvedValueOnce({ ...hmrcVerifyResponse, nameMatches: "partial" });

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(mockBavService.savePartialNameInfo).toHaveBeenCalledWith("PARTIALMATCH_QUEUE", { "accountExists": "yes", "accountName": "Mr Peter Smith", "cicName": "Frederick Joseph Flintstone", "itemNumber": "new vendorUuid", "nameMatches": "partial", "sortCodeBankName": "THE ROYAL BANK OF SCOTLAND PLC", "timeStamp": 1585695600 });
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 1 }));
			jest.useRealTimers();
		});

		it("calls savePartialNameInfo if CopCheckResults is PARTIAL_MATCH without sortCodeBankName value", async () => {
			jest.useFakeTimers();
			jest.setSystemTime(new Date(1585695600000)); // == 2020-03-31T23:00:00.000Z
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: 0 });
			mockHmrcService.verify.mockResolvedValueOnce({ ...hmrcVerifyResponse, nameMatches: "partial", sortCodeBankName: undefined });

			const response = await verifyAccountRequestProcessorTest.processHmrcRequest(sessionId, body, clientIpAddress, encodedTxmaHeader, hmrcToken);

			expect(mockBavService.savePartialNameInfo).toHaveBeenCalledWith("PARTIALMATCH_QUEUE", { "accountExists": "yes", "accountName": "Mr Peter Smith", "cicName": "Frederick Joseph Flintstone", "itemNumber": "new vendorUuid", "nameMatches": "partial", "sortCodeBankName": undefined, "timeStamp": 1585695600 });
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 1 }));
			jest.useRealTimers();
		});
	});
});
