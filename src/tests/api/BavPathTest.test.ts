import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
    getSessionAndVerifyById,
    getSessionById,
    getSqsEventList,
    sessionPost,
    startStubServiceAndReturnSessionId,


    stubStartPost,


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

        // Make sure authSession state is as expected - BAV_SESSION_CREATED
        const expectedValue = "BAV_SESSION_CREATED";
        await getSessionAndVerifyById(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, expectedValue);

        // Make sure txma event is present & valid
        const sqsMessage = await getSqsEventList("txma/", sessionId, 1);
        await validateTxMAEventData(sqsMessage);

        // Commented out until /authorisation (KIWI-1259), /token (KIWI-1260) and /userInfo (KIWI-1258) endpoints are available
        // // Authorization
        // const authResponse = await authorizationGet(sessionId);
        // expect(authResponse.status).toBe(200);
        // // Token
        // const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
        // expect(tokenResponse).toBe(200);
        // // User Info
        // const userInfoResponse = await userInfoPost("Bearer " + tokenResponse.data.access_token);
        // expect(userInfoResponse).toBe(202);
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

describe("/session Unhappy Path", () => {
    let stubResponse: any;
    beforeEach(async () => {
        stubResponse = await stubStartPost(bavStubPayload);
    });

    it("E2E Unhappy Path Journey - Invalid Request", async () => {
        const sessionResp = await sessionPost(stubResponse.data.clientId, "");

        expect(sessionResp.status).toBe(401);
		expect(sessionResp.data).toBe("Unauthorized");
    });

    it("E2E Unhappy Path Journey - Invalid ClientID", async () => {
        const sessionResp = await sessionPost("", stubResponse.data.request);

        expect(sessionResp.status).toBe(400);
		expect(sessionResp.data).toBe("Bad Request");
    });
});