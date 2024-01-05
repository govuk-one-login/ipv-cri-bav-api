import bavStubPayload from "../data/exampleStubPayload.json";
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
	abortPost,
}
	from "../utils/ApiTestSteps";

describe("BAV CRI: /session Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
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
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
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
	
		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 3);
		await validateTxMAEventData(sqsMessage);
	});
});

describe("BAV CRI: /verify-account Retry Happy Path Tests", () => {
	it.each([
		["Ashley", "Allen"],
		["Deborah", "Dawson"],
		["Nigel", "Newton"],
		["Yasmine", "Dawson"],
		["Yasmine", "Newton"],
		["Yasmine", "Palmer"],
	])("Name Retry Tests", async (firstName: string, lastName: any) => {
		const newBavStubPayload = structuredClone(bavStubPayload);
		newBavStubPayload.shared_claims.name[0].nameParts[0].value = firstName;
		newBavStubPayload.shared_claims.name[0].nameParts[1].value = lastName;

		const sessionId = await startStubServiceAndReturnSessionId(newBavStubPayload);

		// Verify-account first name mismatch
		const verifyAccountResponse = await verifyAccountPost(verifyAccountYesPayload, sessionId);
		expect(verifyAccountResponse.status).toBe(200);
		expect(verifyAccountResponse.data.message).toBe("Success");
		expect(verifyAccountResponse.data.retryCount).toBe(1);

		// Verify-account second name mismatch
		const verifyAccountResponseRetry = await verifyAccountPost(verifyAccountYesPayload, sessionId);
		expect(verifyAccountResponseRetry.status).toBe(200);
		expect(verifyAccountResponseRetry.data.message).toBe("Success");
		expect(verifyAccountResponseRetry.data.retryCount).toBe(2);

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 3);
		await validateTxMAEventData(sqsMessage);
	});
});


describe("BAV CRI: /authorization Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
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
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
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
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
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
		validateJwtToken(userInfoResponse.data["https://vocab.account.gov.uk/v1/credentialJWT"][0]);

		// Verify authSessionState
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_CRI_VC_ISSUED");

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 3);
		await validateTxMAEventData(sqsMessage);
	});
});

describe("BAV CRI: /abort Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it("Successful Request Test - Abort After Session Request", async () => {
		const response = await abortPost(sessionId);
		expect(response.status).toBe(200);
		expect(response.data).toBe("Session has been aborted");

		// Make sure authSession state is as expected
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_ABORTED");

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 2);
		await validateTxMAEventData(sqsMessage);

		// Ensure the URI header is present & valid
		expect(response.headers).toBeTruthy();
		expect(response.headers.location).toBeTruthy();

		const responseURI = decodeURIComponent(response.headers.location);
		const responseURIParameters = new URLSearchParams(responseURI);
		expect(responseURIParameters.has("error")).toBe(true);
		expect(responseURIParameters.has("state")).toBe(true);
		expect(responseURIParameters.get("error")).toBe("access_denied");

		// Make sure the provided 'state' value is equal to the one in the database
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "state", "" + responseURIParameters.get("state"));
	});

	it("Successful Request Test - Abort After Verify Account Request", async () => {
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		const response = await abortPost(sessionId);
		expect(response.status).toBe(200);
		expect(response.data).toBe("Session has been aborted");

		// Make sure authSession state is as expected
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_ABORTED");

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 2);
		await validateTxMAEventData(sqsMessage);

		// Ensure the URI header is present & valid
		expect(response.headers).toBeTruthy();
		expect(response.headers.location).toBeTruthy();

		const responseURI = decodeURIComponent(response.headers.location);
		const responseURIParameters = new URLSearchParams(responseURI);
		expect(responseURIParameters.has("error")).toBe(true);
		expect(responseURIParameters.has("state")).toBe(true);
		expect(responseURIParameters.get("error")).toBe("access_denied");

		// Make sure the provided 'state' value is equal to the one in the database
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "state", "" + responseURIParameters.get("state"));
	});

	it("Repeated Request Test", async () => {
		// First request
		await abortPost(sessionId);

		// Repeated resquest
		const response = await abortPost(sessionId);

		expect(response.status).toBe(200);
		expect(response.data).toBe("Session has already been aborted");

		// Make sure authSession state is still as expected, after the repeated request
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_ABORTED");

		// Ensure the URI header is present & valid
		expect(response.headers).toBeTruthy();
		expect(response.headers.location).toBeTruthy();

		const responseURI = decodeURIComponent(response.headers.location);
		const responseURIParameters = new URLSearchParams(responseURI);
		expect(responseURIParameters.has("error")).toBe(true);
		expect(responseURIParameters.has("state")).toBe(true);
		expect(responseURIParameters.get("error")).toBe("access_denied");

		// Make sure the provided 'state' value is equal to the one in the database
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "state", "" + responseURIParameters.get("state"));

	});
});

describe("E2E Happy Path Well Known Endpoint", () => {
	it("E2E Happy Path Journey - Well Known", async () => {
		// Well Known
		const wellKnownResponse = await wellKnownGet();
		validateWellKnownResponse(wellKnownResponse.data);
		expect(wellKnownResponse.status).toBe(200);
	});
});
