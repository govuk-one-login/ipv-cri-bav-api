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

const hmrcUuid = "new hmrcUuid";
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => hmrcUuid,
}));
const mockBavService = mock<BavService>();
const mockHmrcService = mock<HmrcService>();
const logger = mock<Logger>();
const metrics = new Metrics({ namespace: "BAV" });
const TOKEN_SSM_PARAM = "dfsgadfgadg";
const sessionId = "sessionId";
const body = {
	sort_code: "123456",
	account_number: "12345678",
};
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

	describe("#processRequest", () => {
		it("returns error response if person identity cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(undefined);

			const response = await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No person found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No person found for session id", {
				messageCode: MessageCodes.PERSON_NOT_FOUND,
			});
		});

		it("returns error response if session cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(undefined);

			const response = await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No session found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No session found for session id", {
				messageCode: MessageCodes.SESSION_NOT_FOUND,
			});
		});

		it("generates and saves hmrcUuid if one doesn't exist", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, hmrcUuid: undefined });
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(mockBavService.saveHmrcUuid).toHaveBeenCalledWith(sessionId, hmrcUuid);
	  });
      
		it("returns error response if session has exceeded retryCount", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, retryCount: Constants.MAX_RETRIES });

			const response = await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe("Too many attempts");
			expect(logger.error).toHaveBeenCalledWith(`Session retry count is ${Constants.MAX_RETRIES}, cannot have another attempt`, {
				messageCode: MessageCodes.TOO_MANY_RETRIES,
			});
		});

		it("saves account details to person identity table", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, hmrcUuid: "HMRC_UUID" });
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(logger.appendKeys).toHaveBeenCalledWith({ govuk_signin_journey_id: session.clientSessionId });
			expect(mockBavService.saveHmrcUuid).not.toHaveBeenCalled();
			expect(mockBavService.updateAccountDetails).toHaveBeenCalledWith(
				{	sessionId, accountNumber: body.account_number, sortCode: body.sort_code },
				process.env.PERSON_IDENTITY_TABLE_NAME,
			);
		});

		it("verifies the account details given", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(mockHmrcService.verify).toHaveBeenCalledWith({ accountNumber: body.account_number, sortCode: body.sort_code, name: "Frederick Joseph Flintstone", uuid: hmrcUuid }, TOKEN_SSM_PARAM );
		});

		it("pads account number if it's too short", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			await verifyAccountRequestProcessorTest.processRequest(sessionId, { ...body, account_number: "123456" });
			expect(mockBavService.updateAccountDetails).toHaveBeenCalledWith(
				{ sessionId, accountNumber: "00123456", sortCode: body.sort_code },
				process.env.PERSON_IDENTITY_TABLE_NAME,
			);
			expect(mockHmrcService.verify).toHaveBeenCalledWith({ accountNumber: "00123456", sortCode: body.sort_code, name: "Frederick Joseph Flintstone", uuid: hmrcUuid }, TOKEN_SSM_PARAM );
		});

		it("saves saveCopCheckResult and returns success where there has been a match", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce(hmrcVerifyResponse);

			const response = await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(mockBavService.saveCopCheckResult).toHaveBeenCalledWith(sessionId, CopCheckResults.FULL_MATCH, undefined);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success" }));
		});

		it("saves saveCopCheckResult with increased retryCount if there was no match", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce({ ...session, retryCount: 1 });
			mockHmrcService.verify.mockResolvedValueOnce({ ...hmrcVerifyResponse, nameMatches: "partial" });

			const response = await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

			expect(mockBavService.saveCopCheckResult).toHaveBeenCalledWith(sessionId, CopCheckResults.PARTIAL_MATCH, 2);
			expect(response.statusCode).toEqual(HttpCodesEnum.OK);
			expect(response.body).toBe(JSON.stringify({ message:"Success", retryCount: 2 }));
		});

		it("returns error response if cop check result is MATCH_ERROR", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockHmrcService.verify.mockResolvedValueOnce({ ...hmrcVerifyResponse, nameMatches: "error" });

			const response = await verifyAccountRequestProcessorTest.processRequest(sessionId, body);

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
	});
});
