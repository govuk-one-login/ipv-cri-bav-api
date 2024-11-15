/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { ExperianCheckResults } from "../../../models/enums/Experian";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { ISessionItem } from "../../../models/ISessionItem";
import { PersonIdentityItem } from "../../../models/PersonIdentityItem";
import { BavService } from "../../../services/BavService";
import { VerifyAccountRequestProcessor } from "../../../services/VerifyAccountRequestProcessor";
import { ExperianService } from "../../../services/ExperianService";
import { Constants } from "../../../utils/Constants";
import { attempt } from "lodash";


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
const sessionId = "SESSIONID";
const encodedTxmaHeader = "ABCDEFG";
const verifyAccountPayload = {
	sort_code: "123456",
	account_number: "12345678",
};
const experianServiceVerifyResponseSuccess = { personalDetailsScore: 9, expRequestId: "1234568" };
const experianServiceVerifyResponseFail = { personalDetailsScore: 1, expRequestId: "1234568" };
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

const ssmParams = {
	experianUsername:"123456",
	experianPassword: "12345678",
	experianClientId:"clientId",
	experianClientSecret:"Test",
	experianVerifyUrl: "https://localhost/verify",
	experianTokenUrl: "https://localhost/token",
};
process.env.THIRDPARTY_DIRECT_SUBMISSION = "false";

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

	describe("getInstance", () => {
		it("should create a new instance if not already created", () => {
			const newInstance = VerifyAccountRequestProcessor.getInstance( logger, metrics, CREDENTIAL_VENDOR);
			expect(newInstance).toBeDefined();
		});

		it("should return the same instance of VerifiableCredentialService when called multiple times", () => {
			const firstInstance = VerifyAccountRequestProcessor.getInstance( logger, metrics, CREDENTIAL_VENDOR);
			const secondInstance = VerifyAccountRequestProcessor.getInstance( logger, metrics, CREDENTIAL_VENDOR);
			expect(firstInstance).toBe(secondInstance);
		});

		it("should return a new instance of VerifiableCredentialService when called with a new CREDENTIAL_VENDOR", () => {
			const firstInstance = VerifyAccountRequestProcessor.getInstance( logger, metrics, CREDENTIAL_VENDOR);
			const secondInstance = VerifyAccountRequestProcessor.getInstance( logger, metrics, "HMRC");
			expect(firstInstance).not.toBe(secondInstance);
			expect(firstInstance.credentialVendor).toBe(CREDENTIAL_VENDOR); // Assuming a property exists
   			expect(secondInstance.credentialVendor).toBe("HMRC");
		});
	});

	describe("#processExperianRequest", () => {
		it("returns error response if person identity cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(undefined);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
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
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
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
			mockExperianService.verify.mockResolvedValueOnce(experianServiceVerifyResponseSuccess);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(mockBavService.saveVendorUuid).toHaveBeenCalledWith(sessionId, vendorUuid);
		  });
      
		it("returns error response if session has exceeded attemptCount", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: Constants.MAX_VERIFY_ATTEMPTS });

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe("Too many attempts");
			expect(logger.error).toHaveBeenCalledWith(`Session attempt count is ${Constants.MAX_VERIFY_ATTEMPTS}, cannot have another attempt`, {
				messageCode: MessageCodes.TOO_MANY_RETRIES,
			});
		});

		it("saves account details to person identity table", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockExperianService.verify.mockResolvedValueOnce(experianServiceVerifyResponseSuccess);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(logger.appendKeys).toHaveBeenCalledWith({ govuk_signin_journey_id: session.clientSessionId });
			expect(mockBavService.updateAccountDetails).toHaveBeenCalledWith(
				{	sessionId, accountNumber: verifyAccountPayload.account_number, sortCode: verifyAccountPayload.sort_code },
				process.env.PERSON_IDENTITY_TABLE_NAME,
			);
		});

		it("verifies the account details given", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockExperianService.verify.mockResolvedValueOnce(experianServiceVerifyResponseSuccess);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(mockExperianService.verify).toHaveBeenCalledWith({ verifyAccountPayload, birthDate: "12-01-1986", givenName: "Frederick Joseph", surname: "Flintstone", uuid: vendorUuid },
				"123456",
    			"12345678",
    			"clientId",
    			"Test",
				"https://localhost/verify",
    			"https://localhost/token",
			 );
			expect(mockBavService.sendToTXMA).toHaveBeenNthCalledWith(1, "MYQUEUE", {
				event_name: "BAV_EXPERIAN_REQUEST_SENT",
				component_id: "https://XXX-c.env.account.gov.uk",
				extensions: {
					evidence: [
				 		{
					 		txn: "1234568",
						},
					],
				},
				restricted:{
  				"Experian_request_details": [
					 {
  						name: "Frederick Joseph Flintstone",
  						sortCode: verifyAccountPayload.sort_code,
  						accountNumber: verifyAccountPayload.account_number,
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
					 		txn: "1234568",
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
			mockExperianService.verify.mockResolvedValueOnce(experianServiceVerifyResponseSuccess);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				{ ...verifyAccountPayload, account_number: "12345678" }, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams);
			expect(mockBavService.updateAccountDetails).toHaveBeenCalledWith(
				{ sessionId, accountNumber: "12345678", sortCode: verifyAccountPayload.sort_code },
				process.env.PERSON_IDENTITY_TABLE_NAME,
			);
			expect(mockExperianService.verify).toHaveBeenCalledWith({ verifyAccountPayload, birthDate: "12-01-1986", givenName: "Frederick Joseph", surname: "Flintstone", uuid: vendorUuid },
				"123456",
    			"12345678",
    			"clientId",
    			"Test",
				"https://localhost/verify",
    			"https://localhost/token",
			 );
		});

		it("saves saveExperianCheckResult and returns success where there has been a match", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockExperianService.verify.mockResolvedValueOnce(experianServiceVerifyResponseSuccess);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenCalledWith(sessionId, { expRequestId: "1234568", personalDetailsScore: 9 }, ExperianCheckResults.FULL_MATCH, undefined);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});

		it("saves saveExperianCheckResult with increased attemptCount and empty experianCheckResult if there was no match on the first attempt and returns success", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: undefined });
			mockExperianService.verify.mockResolvedValueOnce(experianServiceVerifyResponseFail);

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenCalledWith(sessionId, { expRequestId: "1234568", personalDetailsScore: 1 }, undefined, 1);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 1 }));
		});

		it("saves saveExperianCheckResult with increased attemptCount and experianCheckResult set to NO_MATCH on the second attempt and returns success", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValue(person);
			mockBavService.getSessionById.mockResolvedValue({ ...session, attemptCount: 1 });
			mockExperianService.verify.mockResolvedValue(experianServiceVerifyResponseFail);

			await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);
			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenNthCalledWith(2, sessionId, { expRequestId: "1234568", personalDetailsScore: 1 }, "NO_MATCH", 2);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 2 }));
		});

		it("returns success without attemptCount when there has been a FULL_MATCH", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: undefined });
			mockExperianService.verify.mockResolvedValueOnce({ expRequestId: "1234568", personalDetailsScore: 9, warningsErrors: undefined });

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});

		it.each([
			["NO_MATCH", "2", "warning"],
			["NO_MATCH", "3", "warning"],
			["FULL_MATCH", "6", "warning"],
			["NO_MATCH", "6", "error"],
			["FULL_MATCH", "7", "warning"],
			["NO_MATCH", "7", "error"],
			["FULL_MATCH", "11", "warning"],
			["NO_MATCH", "11", "error"],
			["NO_MATCH", "12", "error"],

		  ])("returns success with a %i provided a response code of %i and type %i is returned", async (matchResult, responseCode, responseType) => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: undefined });
			mockExperianService.verify.mockResolvedValueOnce({ expRequestId: "1234568",
				personalDetailsScore: 9,
				warningsErrors: [{
					responseCode,
					responseType,
					responseMessage: "Should not proceed",
				}] });

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			const attemptCount = matchResult === "FULL_MATCH" ? undefined : 1;

			expect(mockBavService.saveExperianCheckResult).toHaveBeenCalledWith("SESSIONID", { "expRequestId": "1234568", "personalDetailsScore": 9, "warningsErrors": [{ responseCode, "responseMessage": "Should not proceed", responseType }] }, matchResult, attemptCount);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			if (attemptCount === 1) {
				expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 1 }));
			} else {
				expect(response.body).toBe(JSON.stringify({ message:"Success" }));
			}
		});

		it("returns success without attemptCount and FULL_MATCH when personalDetails score is 9 and code is not on excluded list", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: undefined });
			mockExperianService.verify.mockResolvedValueOnce({ expRequestId: "1234568",
				personalDetailsScore: 9,
				warningsErrors: [{
					responseCode: "1",
					responseType: "error",
					responseMessage: "Should proceed",
				}] });

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenCalledWith("SESSIONID", { "expRequestId": "1234568", "personalDetailsScore": 9, "warningsErrors": [{ "responseCode": "1", "responseMessage": "Should proceed", "responseType": "error" }] }, "FULL_MATCH", undefined);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});

		it("returns success with attemptCount and NO_MATCH when personalDetails score is less than 9 and code is not on excluded list and user is on second attempt", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, attemptCount: 1 });
			mockExperianService.verify.mockResolvedValueOnce({ expRequestId: "1234568",
				personalDetailsScore: 7,
				warningsErrors: [{
					responseCode: "1",
					responseType: "error",
					responseMessage: "Should proceed",
				}] });

			const response = await verifyAccountRequestProcessorTest.processExperianRequest(
				sessionId, 
				verifyAccountPayload, 
				clientIpAddress, 
				encodedTxmaHeader,
				ssmParams,
			);

			expect(mockBavService.saveExperianCheckResult).toHaveBeenCalledWith("SESSIONID", { "expRequestId": "1234568", "personalDetailsScore": 7, "warningsErrors": [{ "responseCode": "1", "responseMessage": "Should proceed", "responseType": "error" }] }, "NO_MATCH", 2);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", attemptCount: 2 }));
		});
	 });
});
