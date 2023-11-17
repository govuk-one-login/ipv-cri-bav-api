import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
	authorizationGet,
	getSessionAndVerifyKey,
	getSessionAndVerifyKeyExists,
	getSqsEventList,
	startStubServiceAndReturnSessionId,
	tokenPost,
	userInfoPost,
	validateJwtToken,
	validateTxMAEventData,
	validateWellKnownResponse,
	wellKnownGet,
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

// eslint-disable-next-line @typescript-eslint/tslint/config
describe.skip("BAV CRI: /authorization Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it("Successful Request Test", async () => {
		expect(sessionId).toBeTruthy();

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

// eslint-disable-next-line @typescript-eslint/tslint/config
describe.skip("BAV CRI: /token Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it("Successful Request Test", async () => {
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

// eslint-disable-next-line @typescript-eslint/tslint/config
describe.skip("BAV CRI: /userinfo Endpoint Happy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it("Successful Request Test", async () => {
		const authResponse = await authorizationGet(sessionId);
		const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
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

describe("E2E Happy Path Well Known Endpoint", () => {
	it("E2E Happy Path Journey - Well Known", async () => {
		// Well Known
		const wellKnownResponse = await wellKnownGet();
		validateWellKnownResponse(wellKnownResponse.data);
		expect(wellKnownResponse.status).toBe(200);
	});
});
