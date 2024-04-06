/* eslint-disable max-lines-per-function */
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
	getAthenaRecordByFirstNameAndTime,
} from "./ApiTestSteps";
import { constants } from "./ApiConstants";
import { BankDetailsPayload } from "../models/BankDetailsPayload";
import { randomUUID } from "crypto";
import exampleStubPayload from "../data/exampleStubPayload.json";
import { absoluteTimeNow, sleep } from "./ApiUtils";

describe("BAV CRI unhappy path tests", () => {
	describe("/session Endpoint Unhappy Path Tests", () => {
		let stubResponse: any;
		beforeEach(async () => {
			stubResponse = await stubStartPost();
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

			sessionId = await startStubServiceAndReturnSessionId();

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

			sessionId = await startStubServiceAndReturnSessionId();

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
			["00111115"],
			["22222222"],
			["33333333"],
			["44444444"],
		])("Name Retry Tests - Too many retries rejection for Account Number: $accountNumber", async (accountNumber: string) => {
			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = accountNumber;

			sessionId = await startStubServiceAndReturnSessionId();

			await verifyAccountPost(newVerifyAccountYesPayload, sessionId);
			await verifyAccountPost(newVerifyAccountYesPayload, sessionId);
			const verifyAccountResponseSecondRetry = await verifyAccountPost(newVerifyAccountYesPayload, sessionId);

			expect(verifyAccountResponseSecondRetry.status).toBe(401);
			expect(verifyAccountResponseSecondRetry.data).toBe("Too many attempts");
		});
	});

	describe("BAV CRI: /verify-account Endpoint Partial Match Athena Output Test", () => {
		it("Triggers Partial Match and checks for object in Athena", async () => {
			// ARRANGE
			const firstName = randomUUID().slice(-8);
			const newStubPayload = structuredClone(exampleStubPayload);
			newStubPayload.shared_claims.name[0].nameParts[0].value = firstName;

			const sessionId = await startStubServiceAndReturnSessionId(newStubPayload);

			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = "00111114";
			const startTime = absoluteTimeNow();

			// ACT
			await sleep(500);
			const verifyAccountResponse = await verifyAccountPost(newVerifyAccountYesPayload, sessionId);

			// ASSERT
			expect(verifyAccountResponse.status).toBe(200);
			const athenaRecords = await getAthenaRecordByFirstNameAndTime(startTime, firstName);
			expect(athenaRecords.length).toBeGreaterThan(0);
		});
	});

	describe("BAV CRI: /authorization Endpoint Unhappy Path Tests", () => {
		let sessionId: string;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId();
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
			sessionId = await startStubServiceAndReturnSessionId();
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
			const sessionId = await startStubServiceAndReturnSessionId();

			await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);

			const authResponse = await authorizationGet(sessionId);

			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

			const userInfoResponse = await userInfoPost("Basic " + tokenResponse.data.access_token);
			expect(userInfoResponse.status).toBe(401);
		});
	});
});
