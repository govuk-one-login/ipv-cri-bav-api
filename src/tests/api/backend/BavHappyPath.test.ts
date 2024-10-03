/* eslint-disable max-lines-per-function */
import bavStubPayload from "../../data/exampleStubPayload.json";
import verifyAccountYesPayload from "../../data/bankDetailsYes.json";
import { constants } from "../ApiConstants";
import { absoluteTimeNow, getTxmaEventsFromTestHarness, validateTxMAEventData } from "../ApiUtils";
import {
	authorizationGet,
	getSessionAndVerifyKey,
	getSessionAndVerifyKeyExists,
	personInfoGet,
	personInfoKeyGet,
	startStubServiceAndReturnSessionId,
	verifyAccountPost,
	tokenPost,
	userInfoPost,
	validateJwtToken,
	validateWellKnownResponse,
	wellKnownGet,
	abortPost,
	validatePersonInfoResponse,
	decodeRawBody,
	getKeyFromSession,
	getAthenaRecordByFirstNameAndTime,
} from "../ApiTestSteps";
import { BankDetailsPayload } from "../../models/BankDetailsPayload";
import { randomUUID } from "crypto";

describe("BAV CRI happy path tests", () => {
	describe("/session Endpoint", () => {
		let sessionId: string;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId();
		});

		it("Successful Request Test", async () => {
			expect(sessionId).toBeTruthy();

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 1);
			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
		});
	});

	describe("/person-info Endpoint", () => {
		it.each([
			{ firstName: "Yasmine", lastName: "Dawson" },
			{ firstName: "Yasmine", lastName: "Palmer" },
			{ firstName: "Nigel", lastName: "Newton" },
		])("Successful Request Test for $firstName $lastName", async ({ firstName, lastName }: { firstName: string; lastName: string }) => {
			const newBavStubPayload = structuredClone(bavStubPayload);
			newBavStubPayload.shared_claims.name[0].nameParts[0].value = firstName;
			newBavStubPayload.shared_claims.name[0].nameParts[1].value = lastName;

			const sessionId = await startStubServiceAndReturnSessionId(newBavStubPayload);
			expect(sessionId).toBeTruthy();

			const personInfoResponse = await personInfoGet(sessionId);
			expect(personInfoResponse.status).toBe(200);

			const personInfoKey = await personInfoKeyGet();
			validatePersonInfoResponse(personInfoKey.data.key, personInfoResponse.data, firstName, lastName);
		});
	});

	describe("/verify-account Endpoint", () => {
		it.each([
			"00111111",
			"0111111",
			"111111",
		])("Successful Request Test for $accountNumber", async (accountNumber: string) => {
			const sessionId = await startStubServiceAndReturnSessionId();
			expect(sessionId).toBeTruthy();

			const bankDetails = new BankDetailsPayload(verifyAccountYesPayload.sort_code, accountNumber);

			const verifyAccountResponse = await verifyAccountPost(bankDetails, sessionId);
			expect(verifyAccountResponse.status).toBe(200);

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_DATA_RECEIVED");
			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_PERSONAL_IDENTITY_TABLE_NAME, "accountNumber", bankDetails.account_number.padStart(8, "0"));
			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_PERSONAL_IDENTITY_TABLE_NAME, "sortCode", bankDetails.sort_code);

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 3);

			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_REQUEST_SENT", schemaName: "BAV_EXPERIAN_REQUEST_SENT_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_RESPONSE_RECEIVED", schemaName: "BAV_EXPERIAN_RESPONSE_RECEIVED_SCHEMA" }, allTxmaEventBodies);
		});
		it.each([
			["00111112"],
			["00111113"],
			["00111114"],
			["00111115"],
			["22222222"],
			["33333333"],
			["44444444"],
		])("Name Retry Test for Account Number: $accountNumber", async (accountNumber: string) => {
			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = accountNumber;

			const sessionId = await startStubServiceAndReturnSessionId();

			const verifyAccountResponse = await verifyAccountPost(newVerifyAccountYesPayload, sessionId);

			expect(verifyAccountResponse.status).toBe(200);
			expect(verifyAccountResponse.data.message).toBe("Success");
			expect(verifyAccountResponse.data.attemptCount).toBe(1);

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 3);

			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_REQUEST_SENT", schemaName: "BAV_EXPERIAN_REQUEST_SENT_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_RESPONSE_RECEIVED", schemaName: "BAV_EXPERIAN_RESPONSE_RECEIVED_SCHEMA" }, allTxmaEventBodies);
		});

		it.each([
			["00111114"],
			["00111115"],
		])("Partial Name Match Test for Account Number: $accountNumber", async (accountNumber: string) => {
			const firstName = randomUUID().slice(-8);
			const newStubPayload = structuredClone(bavStubPayload);
			newStubPayload.shared_claims.name[0].nameParts[0].value = firstName;

			const sessionId = await startStubServiceAndReturnSessionId(newStubPayload);

			const newVerifyAccountYesPayload = structuredClone(verifyAccountYesPayload);
			newVerifyAccountYesPayload.account_number = accountNumber;
			const startTime = absoluteTimeNow();

			const verifyAccountResponse = await verifyAccountPost(newVerifyAccountYesPayload, sessionId);
			expect(verifyAccountResponse.status).toBe(200);

			const athenaRecords = await getAthenaRecordByFirstNameAndTime(startTime, firstName);
			expect(athenaRecords.length).toBeGreaterThan(0);

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 3);

			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_REQUEST_SENT", schemaName: "BAV_EXPERIAN_REQUEST_SENT_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_RESPONSE_RECEIVED", schemaName: "BAV_EXPERIAN_RESPONSE_RECEIVED_SCHEMA" }, allTxmaEventBodies);
		});
	});


	describe("/authorization Endpoint", () => {
		let sessionId: string;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId();
		});

		it("Successful Request Test", async () => {
			expect(sessionId).toBeTruthy();

			await verifyAccountPost(
				new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number),
				sessionId,
			);

			const authResponse = await authorizationGet(sessionId);
			expect(authResponse.status).toBe(200);
			expect(authResponse.data.authorizationCode).toBeTruthy();
			expect(authResponse.data.redirect_uri).toBeTruthy();
			expect(authResponse.data.state).toBeTruthy();

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_AUTH_CODE_ISSUED");
		});
	});

	describe("/token Endpoint", () => {
		let sessionId: string;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId();
		});

		it("Successful Request Test", async () => {
			await verifyAccountPost(new BankDetailsPayload(
				verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId,
			);

			const authResponse = await authorizationGet(sessionId);

			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
			expect(tokenResponse.status).toBe(200);

			await getSessionAndVerifyKeyExists(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "accessTokenExpiryDate");
			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_ACCESS_TOKEN_ISSUED");
		});
	});

	describe("/userinfo Endpoint", () => {
		let sessionId: string;
		let bankDetails: BankDetailsPayload;

		beforeEach(async () => {
			bankDetails = new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number);
			sessionId = await startStubServiceAndReturnSessionId();
		});

		it("Successful Request Test", async () => {
			expect(sessionId).toBeTruthy();

			await verifyAccountPost(bankDetails, sessionId);

			const authResponse = await authorizationGet(sessionId);

			const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

			const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
			expect(userInfoResponse.status).toBe(200);

			await validateJwtToken(userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0]);

			const rawBody = userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0].split(".")[1];
			const decodedBody = decodeRawBody(rawBody);

			const vendorUuid = await getKeyFromSession(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "vendorUuid");
			expect(decodedBody.vc.evidence[0].txn).toBe(vendorUuid);

			expect(decodedBody.vc.credentialSubject.bankAccount[0].sortCode).toBe(bankDetails.sort_code);
			expect(decodedBody.vc.credentialSubject.bankAccount[0].accountNumber).toBe(bankDetails.account_number.padStart(8, "0"));

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_CRI_VC_ISSUED");

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 3);
			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_VC_ISSUED", schemaName: "BAV_CRI_VC_ISSUED_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_END", schemaName: "BAV_CRI_END_SCHEMA" }, allTxmaEventBodies);
		});
	});

	describe("/abort Endpoint", () => {
		let sessionId: string;

		beforeEach(async () => {
			sessionId = await startStubServiceAndReturnSessionId();
		});

		it("Successful Request Test - Abort After Session Request", async () => {
			const response = await abortPost(sessionId);
			expect(response.status).toBe(200);
			expect(response.data).toBe("Session has been aborted");

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_ABORTED");

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 2);
			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_SESSION_ABORTED", schemaName: "BAV_CRI_SESSION_ABORTED_SCHEMA" }, allTxmaEventBodies);

			expect(response.headers).toBeTruthy();
			expect(response.headers.location).toBeTruthy();

			const responseURI = decodeURIComponent(response.headers.location);
			const responseURIParameters = new URLSearchParams(responseURI);
			expect(responseURIParameters.has("error")).toBe(true);
			expect(responseURIParameters.has("state")).toBe(true);
			expect(responseURIParameters.get("error")).toBe("access_denied");

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "state", "" + responseURIParameters.get("state"));
		});

		it("Successful Request Test - Abort After Verify Account Request", async () => {
			await verifyAccountPost(
				new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number),
				sessionId,
			);

			const response = await abortPost(sessionId);
			expect(response.status).toBe(200);
			expect(response.data).toBe("Session has been aborted");

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_ABORTED");

			const allTxmaEventBodies = await getTxmaEventsFromTestHarness(sessionId, 4);

			validateTxMAEventData({ eventName: "BAV_CRI_START", schemaName: "BAV_CRI_START_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_REQUEST_SENT", schemaName: "BAV_EXPERIAN_REQUEST_SENT_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_EXPERIAN_RESPONSE_RECEIVED", schemaName: "BAV_EXPERIAN_RESPONSE_RECEIVED_SCHEMA" }, allTxmaEventBodies);
			validateTxMAEventData({ eventName: "BAV_CRI_SESSION_ABORTED", schemaName: "BAV_CRI_SESSION_ABORTED_SCHEMA" }, allTxmaEventBodies);

			expect(response.headers).toBeTruthy();
			expect(response.headers.location).toBeTruthy();

			const responseURI = decodeURIComponent(response.headers.location);
			const responseURIParameters = new URLSearchParams(responseURI);
			expect(responseURIParameters.has("error")).toBe(true);
			expect(responseURIParameters.has("state")).toBe(true);
			expect(responseURIParameters.get("error")).toBe("access_denied");

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "state", "" + responseURIParameters.get("state"));
		});

		it("Repeated Request Test", async () => {
			await abortPost(sessionId);
			const response = await abortPost(sessionId);

			expect(response.status).toBe(200);
			expect(response.data).toBe("Session has already been aborted");

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_ABORTED");

			expect(response.headers).toBeTruthy();
			expect(response.headers.location).toBeTruthy();

			const responseURI = decodeURIComponent(response.headers.location);
			const responseURIParameters = new URLSearchParams(responseURI);
			expect(responseURIParameters.has("error")).toBe(true);
			expect(responseURIParameters.has("state")).toBe(true);
			expect(responseURIParameters.get("error")).toBe("access_denied");

			await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "state", "" + responseURIParameters.get("state"));

		});
	});
});

describe("/.well-known/jwks.json Endpoint", () => {
	it("Successful Request Test", async () => {
		const wellKnownResponse = await wellKnownGet();
		validateWellKnownResponse(wellKnownResponse.data);
		expect(wellKnownResponse.status).toBe(200);
	});
});
