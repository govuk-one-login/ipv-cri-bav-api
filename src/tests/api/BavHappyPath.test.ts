import verifyAccountYesPayload from "../data/bankDetailsYes.json";
import { constants } from "../utils/ApiConstants";
import {
	authorizationGet,
	getSessionAndVerifyKey,
	getSessionAndVerifyKeyExists,
	getSqsEventList,
	startStubServiceAndReturnSessionId,
	verifyAccountPost,
	tokenPost,
	userInfoPost,
	validateJwtToken,
	validateTxMAEventData,
	validateWellKnownResponse,
	wellKnownGet,
}
	from "../utils/ApiTestSteps";
import { BankDetailsPayload } from "../models/BankDetailsPayload";

describe("BAV CRI: /session Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));
	});

	it("Successful Request Test", async () => {
		expect(sessionId).toBeTruthy();

		// Make sure authSession state is as expected
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 1);
		await validateTxMAEventData(sqsMessage);
	});
});

describe("BAV CRI: /verify-account Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));
	});


	it.each([
		"86473611",
		"8647361",
		"864736",
	])("Successful Request Tests", async (accountNumber: string) => {
		expect(sessionId).toBeTruthy();

		// Assign a new valid account number to the payload
		verifyAccountYesPayload.account_number = accountNumber;

		// Verify-account request
		const verifyAccountResponse = await verifyAccountPost(verifyAccountYesPayload, sessionId);
		expect(verifyAccountResponse.status).toBe(200);

		// Make sure authSession state is as expected
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_DATA_RECEIVED");

		// Verify that the accountNumber and sortCode exist and have the correct value
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_PERSONAL_IDENTITY_TABLE_NAME, "accountNumber", verifyAccountYesPayload.account_number.padStart(8, "0"));
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_PERSONAL_IDENTITY_TABLE_NAME, "sortCode", verifyAccountYesPayload.sort_code);
	});
});

describe("BAV CRI: /authorization Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));
	});


	it("Successful Request Test", async () => {
		expect(sessionId).toBeTruthy();

		// Verify-account request
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		// Authorization request
		const authResponse = await authorizationGet(sessionId);
		expect(authResponse.status).toBe(200);
		expect(authResponse.data.authorizationCode).toBeTruthy();
		expect(authResponse.data.redirect_uri).toBeTruthy();
		expect(authResponse.data.state).toBeTruthy();

		// Make sure authSession state is as expected
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_AUTH_CODE_ISSUED");

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 2);
		await validateTxMAEventData(sqsMessage);
	});
});

describe("BAV CRI: /token Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));
	});


	it("Successful Request Test", async () => {
		expect(sessionId).toBeTruthy();

		// Verify Account request
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		// Authorization request
		const authResponse = await authorizationGet(sessionId);

		// Token request
		const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
		expect(tokenResponse.status).toBe(200);

		// Verify access token expiry date exists
		await getSessionAndVerifyKeyExists(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "accessTokenExpiryDate");

		// Make sure authSession state is as expected
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_ACCESS_TOKEN_ISSUED");
	});
});

describe("BAV CRI: /userinfo Endpoint Happy Path Tests", () => {
	let sessionId: string;
	let bankDetails: BankDetailsPayload;
	beforeEach(async () => {
		// Session Request
		bankDetails = new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number);
		sessionId = await startStubServiceAndReturnSessionId(bankDetails);
	});

	it("Successful Request Test", async () => {
		expect(sessionId).toBeTruthy();

		// Verify Account request
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		// Authorization request
		const authResponse = await authorizationGet(sessionId);

		// Token request
		const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

		// User Info request
		const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
		expect(userInfoResponse.status).toBe(200);

		// Check to make sure VC JWT is present in the response and validate its contentss
		validateJwtToken(userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0], bankDetails);

		// Verify authSessionState
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_CRI_VC_ISSUED");

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 3);
		await validateTxMAEventData(sqsMessage);
	});
});

