import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
    authorizationGet,
    getSessionAndVerifyKey,
    getSqsEventList,
    startStubServiceAndReturnSessionId,
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
    it("E2E BAV End Points Happy Path Journey", async () => {
        expect(sessionId).toBeTruthy();

        // Make sure authSession state is as expected
        await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");

        // Make sure txma event is present & valid
        const sqsMessage = await getSqsEventList("txma/", sessionId, 1);
        await validateTxMAEventData(sqsMessage);
        
        // // Commented out until /token (KIWI-1260) and /userInfo (KIWI-1258) endpoints are available
        // // Token
        // const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
        // expect(tokenResponse).toBe(200);
        // // User Info
        // const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
        // expect(userInfoResponse).toBe(202);
    });
});

describe("Test BAV End Points", () => {
    let sessionId: any;

    beforeEach(async () => {
        //Session Request
       sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
    });
    it.skip("E2E BAV End Points Happy Path Journey", async () => {
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
        
        // // Commented out until /token (KIWI-1260) and /userInfo (KIWI-1258) endpoints are available
        // // Token
        // const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
        // expect(tokenResponse).toBe(200);
        // // User Info
        // const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
        // expect(userInfoResponse).toBe(202);
    });
});


describe("Happy Path Test for Repeat Authorisation", () => {
    let sessionId: any;

    beforeEach(async () => {
        //Session Request
        sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);   
    });

    it.skip("Happy Path /authorisation endpoint - Repeated request made", async () => {
        // verifyAccount endpoint
        const origSessionId = sessionId;
        const authResponse = await authorizationGet(sessionId);
        const authCode = authResponse.data.authorizationCode;
        const authRepeatResponse = await authorizationGet(origSessionId);
        const authRepeatResponseCode = authRepeatResponse.data.authorizationCode;
        expect(authCode).not.toEqual(authRepeatResponseCode); 
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