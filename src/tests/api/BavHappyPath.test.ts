import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
	authorizationGet,
	getSessionAndVerifyKey,
	getSessionAndVerifyKeyExists,
	getSqsEventList,
	startStubServiceAndReturnSessionId,
	tokenPost,
	validateTxMAEventData,
	validateWellKnownResponse,
	wellKnownGet,
}
	from "../utils/ApiTestSteps";

describe("Test BAV End Points", () => {
	let sessionId: any;

	beforeEach(async () => {
		//Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it("BAV CRI /session Happy Path", async () => {
		expect(sessionId).toBeTruthy();

		// Make sure authSession state is as expected
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");

		// Make sure txma event is present & valid
		const sqsMessage = await getSqsEventList("txma/", sessionId, 1);
		await validateTxMAEventData(sqsMessage);
	});


	it.skip("BAV CRI /authorization Happy Path", async () => {
		expect(sessionId).toBeTruthy();

		// Authorization
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

	it.skip("BAV CRI /authorization - Repeated request made", async () => {
		const origSessionId = sessionId;
		const authResponse = await authorizationGet(sessionId);
		const authCode = authResponse.data.authorizationCode;
		const authRepeatResponse = await authorizationGet(origSessionId);
		const authRepeatResponseCode = authRepeatResponse.data.authorizationCode;
		expect(authCode).not.toEqual(authRepeatResponseCode);
	});

	it.skip("BAV CRI /token Happy Path", async () => {
		const authResponse = await authorizationGet(sessionId);

		// Token
		const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
		expect(tokenResponse.status).toBe(200);

		// Verify access token expiry date exists
		await getSessionAndVerifyKeyExists(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "accessTokenExpiryDate");

		// Check session state
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_ACCESS_TOKEN_ISSUED");
	});
    it.only("BAV CRI /userinfo Happy Path", async () => {
        // const documentSelectionResponse = await postDocumentSelection(docSelectionData, sessionId);

        // const authResponse = await authorizationGet(sessionId);

        // const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri );

        // const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
        // const userInfoResponse = await userInfoPost("Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImYzODA1Y2UyLWQzNjYtNDY3ZC1iYzhkLWMzMTc4MGFmNTQyYyJ9.eyJzdWIiOiI0OTgyNGNlYS0yNzk0LTQyMTUtYjMwYy1hMTNiMThmM2JlN2QiLCJhdWQiOiJodHRwczovL3Jldmlldy1iYXYuZGV2LmFjY291bnQuZ292LnVrIiwiaXNzIjoiaHR0cHM6Ly9yZXZpZXctYmF2LmRldi5hY2NvdW50Lmdvdi51ayIsImV4cCI6MTY5OTUzNDQ1NH0.UXhKNSAEGkWuFKRaF_3ZFn5RtPnkv3XftW5Cn6Xci1HtjhALPpXDzSPgdouYNm8ExSNMouBOKJ3PjbgPVsFxpw");
        const userInfoResponse = await userInfoPost("Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImYzODA1Y2UyLWQzNjYtNDY3ZC1iYzhkLWMzMTc4MGFmNTQyYyJ9.eyJzdWIiOiJhZjgzZDUxOC04NjVkLTQ5ZDEtODM0Yy04M2E1YmE5YmRmZjMiLCJhdWQiOiJodHRwczovL3Jldmlldy1iYXYuZGV2LmFjY291bnQuZ292LnVrIiwiaXNzIjoiaHR0cHM6Ly9yZXZpZXctYmF2LmRldi5hY2NvdW50Lmdvdi51ayIsImV4cCI6MTY5OTYyMDMzOH0.3EqpR71HCS1c1ByGdhO889QHW5w51LNJA4BXpFMeh8Dwq0w85IqyYLO64QMEJpiOlhDDHiuJxNWsWbXe3w9fyw");
        expect(userInfoResponse.status).toBe(200);

        // Check to make sure VC JWT is present in the response
        const jwtToken = userInfoResponse.data['https://vocab.account.gov.uk/v1/credentialJWT'][0];
        await validateJwtToken(jwtToken);

        // Verify authSessionState
        // await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_CRI_VC_ISSUED");

        // Verify TxMA
        // Make sure txma event is present & valid
        const sqsMessage = await getSqsEventList("txma/", sessionId, 3);
        //await validateTxMAEventData(sqsMessage);
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
