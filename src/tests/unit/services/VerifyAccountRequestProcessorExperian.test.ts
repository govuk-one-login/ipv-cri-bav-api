/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { experianVerifyResponse } from "../data/experianEvents";
import { CopCheckResults } from "../../../models/enums/Hmrc";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { ISessionItem } from "../../../models/ISessionItem";
import { PersonIdentityItem } from "../../../models/PersonIdentityItem";
import { BavService } from "../../../services/BavService";
import { VerifyAccountRequestProcessor } from "../../../services/VerifyAccountRequestProcessor";
import { ExperianService } from "../../../services/ExperianService";
import { Constants } from "../../../utils/Constants";

const vendorUuid = "new vendorUuid";
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => vendorUuid,
}));
const mockBavService = mock<BavService>();
const mockExperianService = mock<ExperianService>();
const logger = mock<Logger>();
const metrics = new Metrics({ namespace: "BAV" });
const CREDENTIAL_VENDOR = "EXPERIAN";
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

const clientUsername = "123456";
const clientPassword = "12345678";
const clientId = "clientId";
const clientSecret = "Test";

const session = require("../data/db_record.json") as ISessionItem;
let verifyAccountRequestProcessorTest: VerifyAccountRequestProcessor;

describe("VerifyAccountRequestProcessor", () => {
	beforeAll(() => {
		verifyAccountRequestProcessorTest = new VerifyAccountRequestProcessor(logger, metrics, CREDENTIAL_VENDOR);
		// @ts-ignore
		verifyAccountRequestProcessorTest.BavService = mockBavService;
		// @ts-ignore
		verifyAccountRequestProcessorTest.ExperianService = mockExperianService;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(new Date(1585695600000));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("#processExperianRequest", () => {
		it("returns error response if person identity cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(undefined);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No person found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No person found for session id", {
				messageCode: MessageCodes.PERSON_NOT_FOUND,
			});
		});

		it("returns error response if session cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(undefined);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No session found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No session found for session id", {
				messageCode: MessageCodes.SESSION_NOT_FOUND,
			});
		});

		it("generates and saves vendorUuid if one doesn't exist", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, vendorUuid: undefined });
			mockExperianService.verify.mockResolvedValueOnce(9);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(mockBavService.saveVendorUuid).toHaveBeenCalledWith(sessionId, vendorUuid);
	  });
      
		it("returns error response if session has exceeded attemptCount", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: Constants.MAX_VERIFY_ATTEMPTS });

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe("Too many attempts");
			expect(logger.error).toHaveBeenCalledWith(`Session attempt count is ${Constants.MAX_VERIFY_ATTEMPTS}, cannot have another attempt`, {
				messageCode: MessageCodes.TOO_MANY_RETRIES,
			});
		});

		it("saves account details to person identity table", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, vendorUuid: "EXPERIAN_UUID" });
			mockExperianService.verify.mockResolvedValueOnce(9);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

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
			mockExperianService.verify.mockResolvedValueOnce(9);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(mockExperianService.verify).toHaveBeenCalledWith({ accountNumber: body.account_number, sortCode: body.sort_code, name: "Frederick Joseph Flintstone", uuid: vendorUuid },
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			 );
			expect(mockBavService.sendToTXMA).toHaveBeenNthCalledWith(1, "MYQUEUE", {
				event_name: "BAV_EXPERIAN_REQUEST_SENT",
				component_id: "https://XXX-c.env.account.gov.uk",
				extensions: {
					evidence: [
				 		{
					 		txn: "new vendorUuid",
						},
					],
				},
				restricted:{
  				"Experian_request_details": [
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
				event_name: "BAV_EXPERIAN_RESPONSE_RECEIVED",
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
			mockExperianService.verify.mockResolvedValueOnce(9);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				{ ...body, account_number: "123456" }, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret);
			expect(mockBavService.updateAccountDetails).toHaveBeenCalledWith(
				{ sessionId, accountNumber: "00123456", sortCode: body.sort_code },
				process.env.PERSON_IDENTITY_TABLE_NAME,
			);
			expect(mockExperianService.verify).toHaveBeenCalledWith({ accountNumber: "00123456", sortCode: body.sort_code, name: "Frederick Joseph Flintstone", uuid: vendorUuid },
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			 );
		});

		it("saves saveExperianCheckResult and returns success where there has been a match", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockExperianService.verify.mockResolvedValueOnce(9);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenCalledWith(sessionId, CopCheckResults.FULL_MATCH, undefined);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});

		it("saves saveExperianCheckResult with increased attemptCount and empty experianCheckResult if there was no match on the first attempt and returns success", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: undefined });
			mockExperianService.verify.mockResolvedValueOnce(1);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenCalledWith(sessionId, undefined, 1);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 1 }));
		});

		it("saves saveExperianCheckResult with increased attemptCount and experianCheckResult set to NO_MATCH on the second attempt and returns success", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValue(person);
			mockBavService.getSessionById.mockResolvedValue({ ...session, attemptCount: 1 });
			mockExperianService.verify.mockResolvedValue(1);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);
			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenNthCalledWith(2, sessionId, "NO_MATCH", 2);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 2 }));
		});

		it("returns success without attemptCount when there has been a FULL_MATCH", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: undefined });
			mockExperianService.verify.mockResolvedValueOnce(9);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				body, 
				clientIpAddress, 
				encodedTxmaHeader,
				clientUsername,
				clientPassword,
				clientId,
				clientSecret
			);

			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});
	});
});
