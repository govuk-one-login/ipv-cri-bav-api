import bavStubPayload from "../data/exampleStubPayload.json";
import { constants } from "../utils/ApiConstants";
import {
    authorizationGet,
    getSessionAndVerifyKey,
    getSessionAndVerifyKeyExists,
    sessionPost,
    startStubServiceAndReturnSessionId,
    stubStartPost,
    tokenPost
} from "../utils/ApiTestSteps";


describe.skip("/token Unhappy Path - invalid session state", () => {
    let sessionId: any;

    beforeEach(async () => {
        //Session Request
        //sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
        sessionId = "d2eb1636-e1e2-4c92-9834-7e21dbafca86";
    });
    it("Request to /token with invalid session state", async () => {
        // Make sure authSession state is as expected - BAV_SESSION_CREATED
        await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");

        // // Make sure txma event is present & valid
        // const sqsMessage = await getSqsEventList("txma/", sessionId, 1);
        // await validateTxMAEventData(sqsMessage);

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