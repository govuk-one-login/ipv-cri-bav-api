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
    wellKnownGet
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
        await getSessionAndVerifyKeyExists(sessionId, "session-infra-l2-dynamo-bhavana", "accessTokenExpiryDate");

        // Check session state
        await getSessionAndVerifyKey(sessionId, "session-infra-l2-dynamo-bhavana", "authSessionState", "BAV_ACCESS_TOKEN_ISSUED");

        // TODO: Verify TXMA event is returned
        // const sqsMessage = await getSqsEventList("txma/", sessionId, 2);
        // await validateTxMAEventData(sqsMessage);
    });


    // // User Info
    // const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
    // expect(userInfoResponse).toBe(202);
});

describe("E2E Happy Path Well Known Endpoint", () => {
    it("E2E Happy Path Journey - Well Known", async () => {
        // Well Known
        const wellKnownResponse = await wellKnownGet();
        validateWellKnownResponse(wellKnownResponse.data);
        expect(wellKnownResponse.status).toBe(200);
    });
});