/* eslint-disable max-lines-per-function */
import verifyAccountYesPayload from "../../data/bankDetailsYes.json";
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
	validateJwtToken,
	decodeRawBody,
	getKeyFromSession,
	startTokenPost, 
} from "../ApiTestSteps";
import { getTxmaEventsFromTestHarness, validateTxMAEventData, validateTxMAEventField } from "../ApiUtils";
import { constants } from "../ApiConstants";
import { BankDetailsPayload } from "../../models/BankDetailsPayload";
import { randomUUID } from "crypto";

describe("BAV CRI unhappy path tests", () => {
	describe("/session Endpoint Unhappy Path Tests", () => {

		it("Empty Request Test", async () => {
			const stubResponse = await stubStartPost();
			const sessionResponse = await sessionPost(stubResponse.data.clientId, "");

			expect(sessionResponse.status).toBe(401);
			expect(sessionResponse.data).toBe("Unauthorized");
		});

		it("Empty ClientID Test", async () => {
			const stubResponse = await stubStartPost();
			const sessionResponse = await sessionPost("", stubResponse.data.request);

			expect(sessionResponse.status).toBe(400);
			expect(sessionResponse.data).toBe("Bad Request");
		});

		it("Invalid Kid Test", async () => {
			const stubResponse = await stubStartPost(undefined, { journeyType: 'invalidKid' });
			const sessionResponse = await sessionPost(stubResponse.data.clientId, stubResponse.data.request);
			expect(sessionResponse.status).toBe(401);
			expect(sessionResponse.data).toBe("Unauthorized");
		});

		it("Missing Kid Test", async () => {
			const stubResponse = await stubStartPost(undefined, { journeyType: 'missingKid' });
			const sessionResponse = await sessionPost(stubResponse.data.clientId, stubResponse.data.request);
			expect(sessionResponse.status).toBe(401);
			expect(sessionResponse.data).toBe("Unauthorized");
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
			newVerifyAccountYesPayload.account_number = "11111115";

			sessionId = await startStubServiceAndReturnSessionId();

			const verifyAccountResponse = await verifyAccountPost(
				new BankDetailsPayload(newVerifyAccountYesPayload.sort_code, newVerifyAccountYesPayload.account_number),
				sessionId,
			);
			expect(verifyAccountResponse.status).toBe(500);

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");
		});

		it("HMRC Multiple Retries Test - Error Code 4XX", async () => {
			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = "11111114";

			sessionId = await startStubServiceAndReturnSessionId();

			const verifyAccountResponse = await verifyAccountPost(
				new BankDetailsPayload(newVerifyAccountYesPayload.sort_code, newVerifyAccountYesPayload.account_number),
				sessionId,
			);
			expect(verifyAccountResponse.status).toBe(500);

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");
		});

		it.each([
			["11111116"],
			["11111117"],
			// ["00111114"],
			// ["00111115"],
			// ["22222222"],
			// ["33333333"],
			// ["44444444"],
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

			const startTokenResponse = await startTokenPost();
			
			await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data);

			// Request to /token endpoint again (which now has an incorrect session state)
			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data);
			expect(tokenResponse.status).toBe(401);
		});

		it("Invalid Kid in Token JWT Test", async () => {
			await verifyAccountPost(
				new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number),
				sessionId,
			);

			const authResponse = await authorizationGet(sessionId);

			const startTokenResponse = await startTokenPost({ journeyType: 'invalidKid' });
			
			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data);

			expect(tokenResponse.status).toBe(401);
			expect(tokenResponse.data).toBe("Unauthorized");
		});

		it("Missing Kid in Token JWT Test", async () => {
			await verifyAccountPost(
				new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number),
				sessionId,
			);

			const authResponse = await authorizationGet(sessionId);

			const startTokenResponse = await startTokenPost({ journeyType: 'missingKid' });
			
			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data);

			expect(tokenResponse.status).toBe(401);
			expect(tokenResponse.data).toBe("Unauthorized");
		});

		it("Request does not include client_assertion", async () => {
			await verifyAccountPost(
				new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number),
				sessionId,
			);

			const authResponse = await authorizationGet(sessionId);
			
			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, "");

			expect(tokenResponse.status).toBe(401);
			expect(tokenResponse.data).toBe("Invalid request: Missing client_assertion parameter");
		});

		it("Request does not include client_assertion_type", async () => {
			await verifyAccountPost(
				new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number),
				sessionId,
			);

			const authResponse = await authorizationGet(sessionId);

			const startTokenResponse = await startTokenPost();
			
			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data, " ");

			expect(tokenResponse.status).toBe(401);
			expect(tokenResponse.data).toBe("Invalid client_assertion_type parameter");		
		});
	});

	describe("/userinfo Endpoint Unhappy Path Tests", () => {
		it("Non-bearer Type Authentication Test", async () => {
			const sessionId = await startStubServiceAndReturnSessionId();

			await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);

			const authResponse = await authorizationGet(sessionId);

			const startTokenResponse = await startTokenPost();

			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data);

			const userInfoResponse = await userInfoPost("Basic " + tokenResponse.data.access_token);
			expect(userInfoResponse.status).toBe(401);
		});
	});

	describe("Fraud and Data checks VC Validation", () => {
		let sessionId: string;
		let bankDetails: BankDetailsPayload;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId();
		});

		it.each([
			{ accountNumber: "11111116" },
			{ accountNumber: "11111118" },
		])("Contra Indicator Generated - $accountNumber", async ({ accountNumber }: { accountNumber: string }) => {
			expect(sessionId).toBeTruthy();

			bankDetails = new BankDetailsPayload(verifyAccountYesPayload.sort_code, accountNumber);
			await verifyAccountPost(bankDetails, sessionId);
			await verifyAccountPost(bankDetails, sessionId);

			const authResponse = await authorizationGet(sessionId);

			const startTokenResponse = await startTokenPost();

			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data);

			const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
			expect(userInfoResponse.status).toBe(200);

			await validateJwtToken(userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0], 0);

			const rawBody = userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0].split(".")[1];
			const decodedBody = decodeRawBody(rawBody);

			const vendorUuid = await getKeyFromSession(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "vendorUuid");
			expect(decodedBody.vc.evidence[0].txn).toBe(vendorUuid);

			expect(decodedBody.vc.credentialSubject.bankAccount[0].sortCode).toBe(bankDetails.sort_code);
			expect(decodedBody.vc.credentialSubject.bankAccount[0].accountNumber).toBe(bankDetails.account_number.padStart(8, "0"));

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_CRI_VC_ISSUED");

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 3);
			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_VC_ISSUED", schemaName: "BAV_CRI_VC_ISSUED_WITH_CI_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventField({ eventName: "BAV_CRI_VC_ISSUED", jsonPath: "extensions.evidence[0].validityScore", expectedValue: 0 }, allTxmaEventBodies);
			validateTxMAEventField({ eventName: "BAV_CRI_VC_ISSUED", jsonPath: "extensions.evidence[0].ci", expectedValue: ["D15"] }, allTxmaEventBodies);
			validateTxMAEventField({ eventName: "BAV_CRI_VC_ISSUED", jsonPath: "extensions.evidence[0].ciReasons[0].ci", expectedValue: "D15" }, allTxmaEventBodies);
			validateTxMAEventField({ eventName: "BAV_CRI_VC_ISSUED", jsonPath: "extensions.evidence[0].ciReasons[0].reason", expectedValue: "NO_MATCH" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_END", schemaName: "BAV_CRI_END_SCHEMA" }, allTxmaEventBodies);
		});


		it.each([
			{ accountNumber: "11111117" },
			{ accountNumber: "11111119" },

		])("Contra Indicator Not Generated - $accountNumber", async ({ accountNumber }: { accountNumber: string }) => {
			expect(sessionId).toBeTruthy();

			bankDetails = new BankDetailsPayload(verifyAccountYesPayload.sort_code, accountNumber);
			await verifyAccountPost(bankDetails, sessionId);

			const authResponse = await authorizationGet(sessionId);

			const startTokenResponse = await startTokenPost();

			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri, startTokenResponse.data);

			const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
			expect(userInfoResponse.status).toBe(200);

			await validateJwtToken(userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0], 0);

			const rawBody = userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0].split(".")[1];
			const decodedBody = decodeRawBody(rawBody);

			const vendorUuid = await getKeyFromSession(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "vendorUuid");
			expect(decodedBody.vc.evidence[0].txn).toBe(vendorUuid);

			expect(decodedBody.vc.credentialSubject.bankAccount[0].sortCode).toBe(bankDetails.sort_code);
			expect(decodedBody.vc.credentialSubject.bankAccount[0].accountNumber).toBe(bankDetails.account_number.padStart(8, "0"));

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_CRI_VC_ISSUED");

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 3);
			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_VC_ISSUED", schemaName: "BAV_CRI_VC_ISSUED_SCHEMA_FAILURE" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_END", schemaName: "BAV_CRI_END_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventField({ eventName: "BAV_CRI_VC_ISSUED", jsonPath: "extensions.evidence[0].validityScore", expectedValue: 0 }, allTxmaEventBodies);
		});
	});
});
