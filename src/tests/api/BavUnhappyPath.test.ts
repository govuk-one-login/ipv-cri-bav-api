import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
    authorizationGet,
    sessionPost,
    startStubServiceAndReturnSessionId,
    stubStartPost,
    userInfoPost,
    tokenPost,
} from "../utils/ApiTestSteps";

// eslint-disable-next-line @typescript-eslint/tslint/config
describe.skip("/token Unhappy Path - invalid session state", () => {
    let sessionId: any;

    beforeEach(async () => {
        //Session Request
        sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
    });

    it("Request to /token with invalid session state", async () => {
        // Authorization
        const authResponse = await authorizationGet(sessionId);

        // Token
        await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

        // Request to /token endpoing again (which now has an invalid session state)
        const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
        expect(tokenResponse.status).toBe(401);
    });
});

describe("/session Unhappy Path", () => {
    let stubResponse: any;
    beforeEach(async () => {
        stubResponse = await stubStartPost(bavStubPayload);
    });

    it("E2E Unhappy Path Journey - Invalid Request", async () => {
        const sessionResponse = await sessionPost(stubResponse.data.clientId, "");

        expect(sessionResponse.status).toBe(401);
        expect(sessionResponse.data).toBe("Unauthorized");
    });

    it("E2E Unhappy Path Journey - Invalid ClientID", async () => {
        const sessionResponse = await sessionPost("", stubResponse.data.request);

        expect(sessionResponse.status).toBe(400);
        expect(sessionResponse.data).toBe("Bad Request");
    });
});

describe("E2E Journey - /userinfo Unhappy Path", () => {
    let sessionId: any;
    let tokenResponse: any;

    beforeEach(async () => {
        //Session Request
        sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);

        const authResponse = await authorizationGet(sessionId);
        tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

        // TODO: Verify account here
    });

    it.skip("E2E Unhappy Path Journey - Non-bearer type authentication", async () => {
        const userInfoResponse = await userInfoPost("Basic " + tokenResponse.data.access_token);
        expect(userInfoResponse.status).toBe(401);
    });

    it.skip("E2E Unhappy Path Journey - Expired bearer token", async () => {
        // Hardcoded expired Bearer Token
        const userInfoResponse = await userInfoPost("Bearer " + constants.DEV_IPV_BAV_EXPIRED_TOKEN);
        expect(userInfoResponse.status).toBe(401);
    });

    it.skip("E2E Unhappy Path Journey - Missing subject field", async () => {
        const userInfoResponse = await userInfoPost("Bearer " + constants.DEV_IPV_BAV_MISSING_SUBJECT_TOKEN);
        expect(userInfoResponse.status).toBe(400);
    });

    it.skip("E2E Unhappy Path Journey - Missing client session id field", async () => {
        const userInfoResponse = await userInfoPost("Bearer " + constants.DEV_IPV_BAV_MISSING_CLIENT_ID_TOKEN);
        expect(userInfoResponse.status).toBe(400);
    });
});

describe("E2E Unhappy Path /authorisation Endpoint", () => {
    let sessionId: any;
    beforeEach(async () => {
        sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
    });

    it("Incorrect session state", async () => {
        const authResponse = await authorizationGet(sessionId);
        expect(authResponse.status).toBe(401);
    });

});
