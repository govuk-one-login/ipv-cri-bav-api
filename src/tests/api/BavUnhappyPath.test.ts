/* eslint-disable max-lines-per-function */
import bavStubPayload from "../data/exampleStubPayload.json";
import verifyAccountYesPayload from "../data/bankDetailsYes.json";
import {
	authorizationGet,
	sessionPost,
	personInfoGet,
	startStubServiceAndReturnSessionId,
	stubStartPost,
	userInfoPost,
	verifyAccountPost,
	tokenPost,
	getSessionAndVerifyKey,
} from "./ApiTestSteps";
import { constants } from "./ApiConstants";
import { BankDetailsPayload } from "../models/BankDetailsPayload";
import { randomUUID } from "crypto";

describe("BAV CRI unhappy path tests", () => {
	describe("/session Endpoint Unhappy Path Tests", () => {
		let stubResponse: any;
		beforeEach(async () => {
			stubResponse = await stubStartPost(bavStubPayload);
		});

		it("Empty Request Test", async () => {
			const sessionResponse = await sessionPost(stubResponse.data.clientId, "");

			expect(sessionResponse.status).toBe(401);
			expect(sessionResponse.data).toBe("Unauthorized");
		});

		it("Empty ClientID Test", async () => {
			const sessionResponse = await sessionPost("", stubResponse.data.request);

			expect(sessionResponse.status).toBe(400);
			expect(sessionResponse.data).toBe("Bad Request");
		});
	});

	describe("/person-info Endpoint Unhappy Path Tests", () => {
		it("Invalid Session Id Test", async () => {
			const sessionId = randomUUID();

			const personInfoResponse = await personInfoGet(sessionId);
			expect(personInfoResponse.status).toBe(401);
			expect(personInfoResponse.data).toBe("No session found with the session id: " + sessionId);
		});
	});


	describe("/verify-account Endpoint Unhappy Path Tests", () => {
		let sessionId: string;

		it("HMRC Multiple Retries Test - Error Code 5XX", async () => {
			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = "55555555";

			sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);

			const verifyAccountResponse = await verifyAccountPost(
				new BankDetailsPayload(newVerifyAccountYesPayload.sort_code, newVerifyAccountYesPayload.account_number),
				sessionId,
			);
			expect(verifyAccountResponse.status).toBe(500);

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");
		});

		it("HMRC Multiple Retries Test - Error Code 429", async () => {
			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = "66666666";

			sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);

			const verifyAccountResponse = await verifyAccountPost(
				new BankDetailsPayload(newVerifyAccountYesPayload.sort_code, newVerifyAccountYesPayload.account_number),
				sessionId,
			);
			expect(verifyAccountResponse.status).toBe(500);

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");
		});

		it.each([
			["00111112"],
			["00111113"],
			["00111114"],
			["22222222"],
			["33333333"],
			["44444444"],
		])("Name Retry Tests - Too many retries rejection for Account Number: $accountNumber", async (accountNumber: string) => {
			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = accountNumber;

			const sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);

			await verifyAccountPost(newVerifyAccountYesPayload, sessionId);
			await verifyAccountPost(newVerifyAccountYesPayload, sessionId);
			const verifyAccountResponseSecondRetry = await verifyAccountPost(newVerifyAccountYesPayload, sessionId);

			expect(verifyAccountResponseSecondRetry.status).toBe(401);
			expect(verifyAccountResponseSecondRetry.data).toBe("Too many attempts");
		});
	});

	describe("/authorization Endpoint Unhappy Path Tests", () => {
		let sessionId: string;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
		});

		it("Incorrect Session State Test", async () => {
			const authResponse = await authorizationGet(sessionId);
			expect(authResponse.status).toBe(401);
		});

		it("Repeated Request Made Test", async () => {
			const origSessionId = sessionId;
			await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);
			const authResponse = await authorizationGet(sessionId);
			const authCode = authResponse.data.authorizationCode;
			const authRepeatResponse = await authorizationGet(origSessionId);
			const authRepeatResponseCode = authRepeatResponse.data.authorizationCode;
			expect(authCode).not.toEqual(authRepeatResponseCode);
		});
	});

	describe("/token Endpoint Unhappy Path Tests", () => {
		let sessionId: string;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
		});

		it("Invalid Session State Test", async () => {
			await verifyAccountPost(
				new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number),
				sessionId,
			);

			const authResponse = await authorizationGet(sessionId);

			await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

			// Request to /token endpoint again (which now has an incorrect session state)
			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
			expect(tokenResponse.status).toBe(401);
		});
	});

	describe("/userinfo Endpoint Unhappy Path Tests", () => {
		it("Non-bearer Type Authentication Test", async () => {
			const sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);

			await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);

			const authResponse = await authorizationGet(sessionId);

			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

			const userInfoResponse = await userInfoPost("Basic " + tokenResponse.data.access_token);
			expect(userInfoResponse.status).toBe(401);
		});
	});
});
