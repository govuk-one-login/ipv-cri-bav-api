import bavStubPayload from "../data/exampleStubPayload.json";
import {
    authorizationGet,
    sessionPost,
    startStubServiceAndReturnSessionId,
    stubStartPost
} from "../utils/ApiTestSteps";

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