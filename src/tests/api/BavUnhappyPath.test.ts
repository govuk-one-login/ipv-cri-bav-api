import bavStubPayload from "../data/exampleStubPayload.json";
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

describe("/userinfo Unhappy Path - ", () => {
    it.skip("E2E Unhappy Path Journey - Non-bearer type authentication", async () => {
        // const userInfoResponse = await userInfoPost("Basic " + tokenResponse.data.access_token);
        const userInfoResponse = await userInfoPost("Basic eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImYzODA1Y2UyLWQzNjYtNDY3ZC1iYzhkLWMzMTc4MGFmNTQyYyJ9.eyJzdWIiOiJhNzhjYTE2Yi1mNTQyLTQzNzgtOWNkMC1kMGFhMTc1OTYxY2QiLCJhdWQiOiJodHRwczovL3Jldmlldy1iYXYuZGV2LmFjY291bnQuZ292LnVrIiwiaXNzIjoiaHR0cHM6Ly9yZXZpZXctYmF2LmRldi5hY2NvdW50Lmdvdi51ayIsImV4cCI6MTY5OTM3MjIwN30.aD-ANk6ITSjD4wQ8t9a9Qq8TgW5zXg2pxRYF5qPGK3kCqfWrHo9g_sU35rX8XFeST2BenBHoYkMZ-C7t4k1oiw");
        expect(userInfoResponse.status).toBe(401);
    });

    it.skip("E2E Unhappy Path Journey - Expired bearer token", async () => {
        // Hardcoded expired Bearer Token
        const userInfoResponse = await userInfoPost("Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImYzODA1Y2UyLWQzNjYtNDY3ZC1iYzhkLWMzMTc4MGFmNTQyYyJ9.eyJzdWIiOiJhNzhjYTE2Yi1mNTQyLTQzNzgtOWNkMC1kMGFhMTc1OTYxY2QiLCJhdWQiOiJodHRwczovL3Jldmlldy1iYXYuZGV2LmFjY291bnQuZ292LnVrIiwiaXNzIjoiaHR0cHM6Ly9yZXZpZXctYmF2LmRldi5hY2NvdW50Lmdvdi51ayIsImV4cCI6MTY5OTM3MjIwN30.aD-ANk6ITSjD4wQ8t9a9Qq8TgW5zXg2pxRYF5qPGK3kCqfWrHo9g_sU35rX8XFeST2BenBHoYkMZ-C7t4k1oiw");
        expect(userInfoResponse.status).toBe(401);

    });

    it.skip("E2E Unhappy Path Journey - Missing subject field", async () => {
        const userInfoResponse = await userInfoPost("Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImYzODA1Y2UyLWQzNjYtNDY3ZC1iYzhkLWMzMTc4MGFmNTQyYyJ9.eyJzdWIiOiIwNmZmN2QxOS1iN2Y1LTRiZjctYmJhNi00NjRjY2FlZTdiMWQiLCJhdWQiOiJodHRwczovL3Jldmlldy1iYXYuZGV2LmFjY291bnQuZ292LnVrIiwiaXNzIjoiaHR0cHM6Ly9yZXZpZXctYmF2LmRldi5hY2NvdW50Lmdvdi51ayIsImV4cCI6MTY5OTQ2MDk3N30.-DgJu1RIgFgDMvTq5m2ICvzXBEvm_ICMkiWg8C7daqee9wCYZ9oRIgELoRIphxTkTQxsggVuIIvP2lCbJumGJA");
        expect(userInfoResponse.status).toBe(400);
    });

    it.skip("E2E Unhappy Path Journey - Missing client session id field", async () => {
        const userInfoResponse = await userInfoPost("Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImYzODA1Y2UyLWQzNjYtNDY3ZC1iYzhkLWMzMTc4MGFmNTQyYyJ9.eyJzdWIiOiI0OTgyNGNlYS0yNzk0LTQyMTUtYjMwYy1hMTNiMThmM2JlN2QiLCJhdWQiOiJodHRwczovL3Jldmlldy1iYXYuZGV2LmFjY291bnQuZ292LnVrIiwiaXNzIjoiaHR0cHM6Ly9yZXZpZXctYmF2LmRldi5hY2NvdW50Lmdvdi51ayIsImV4cCI6MTY5OTUzNDQ1NH0.UXhKNSAEGkWuFKRaF_3ZFn5RtPnkv3XftW5Cn6Xci1HtjhALPpXDzSPgdouYNm8ExSNMouBOKJ3PjbgPVsFxpw");
        expect(userInfoResponse.status).toBe(400);
    });
});

describe("E2E Unhappy Path /authorisation Endpoint", () => {
	let sessionId: any;
	beforeEach(async () => {
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it.skip("Incorrect session state", async () => {
		const authResponse = await authorizationGet(sessionId);
		expect(authResponse.status).toBe(401);
	});

});
