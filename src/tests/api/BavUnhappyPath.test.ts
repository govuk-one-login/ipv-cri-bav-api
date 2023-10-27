import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
    getSessionAndVerifyKey,
    getSqsEventList,
    sessionPost,
    startStubServiceAndReturnSessionId,
    stubStartPost,
    validateTxMAEventData,
    validateWellKnownResponse,
    wellKnownGet
}
    from "../utils/ApiTestSteps";

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