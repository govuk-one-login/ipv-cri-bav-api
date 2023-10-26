import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
    getSessionById,
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

        // AC2
        const sessionInfo = await getSessionById(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME);
        expect(sessionInfo?.authSessionState).toBe("BAV_SESSION_CREATED");

        // AC4
		const sqsMessage = await getSqsEventList("txma/", sessionId, 1);
        console.log(sqsMessage);
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