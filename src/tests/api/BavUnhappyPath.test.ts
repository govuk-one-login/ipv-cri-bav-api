import verifyAccountYesPayload from "../data/bankDetailsYes.json";
import {
	authorizationGet,
	sessionPost,
	startStubServiceAndReturnSessionId,
	stubStartPost,
	userInfoPost,
	verifyAccountPost,
	tokenPost,
} from "../utils/ApiTestSteps";
import { BankDetailsPayload } from "../models/BankDetailsPayload";


describe("BAV CRI: /session Endpoint Unhappy Path Tests", () => {
	let stubResponse: any;
	beforeEach(async () => {
		stubResponse = await stubStartPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));
	});

	it("Invalid Request Test", async () => {
		// Purposefully empty request
		const sessionResponse = await sessionPost(stubResponse.data.clientId, "");

		expect(sessionResponse.status).toBe(401);
		expect(sessionResponse.data).toBe("Unauthorized");
	});

	it("Invalid ClientID Test", async () => {
		// Purposefully empty client ID
		const sessionResponse = await sessionPost("", stubResponse.data.request);

		expect(sessionResponse.status).toBe(400);
		expect(sessionResponse.data).toBe("Bad Request");
	});
});

describe("BAV CRI: /authorization Endpoint Unhappy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));
	});


	it("Incorrect Session State Test", async () => {
		// Authorization
		const authResponse = await authorizationGet(sessionId);
		expect(authResponse.status).toBe(401);
	});

	it("Repeated Request Made Test", async () => {
		const origSessionId = sessionId;
		await verifyAccountPost(verifyAccountYesPayload, sessionId);
		const authResponse = await authorizationGet(sessionId);
		const authCode = authResponse.data.authorizationCode;
		const authRepeatResponse = await authorizationGet(origSessionId);
		const authRepeatResponseCode = authRepeatResponse.data.authorizationCode;
		expect(authCode).not.toEqual(authRepeatResponseCode);
	});
});

describe("BAV CRI: /token Endpoint Unhappy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));
	});

	it("Invalid Session State Test", async () => {
		// Verify-account request
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		// Authorization request
		const authResponse = await authorizationGet(sessionId);

		// Token request
		await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

		// Request to /token endpoint again (which now has an incorrect session state)
		const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);
		expect(tokenResponse.status).toBe(401);
	});
});

// eslint-disable-next-line @typescript-eslint/tslint/config
describe("BAV CRI: /userinfo Endpoint Unhappy Path Tests", () => {
	it("Non-bearer Type Authentication Test", async () => {
		//Session Request
		const sessionId = await startStubServiceAndReturnSessionId(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number));

		// Verify-account request
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		// Authorization
		const authResponse = await authorizationGet(sessionId);

		// Token
		const tokenResponse = await tokenPost(authResponse.data.authorizationCode.value, authResponse.data.redirect_uri);

		// Make the request using a 'basic' token type
		const userInfoResponse = await userInfoPost("Basic " + tokenResponse.data.access_token);
		expect(userInfoResponse.status).toBe(401);
	});

	// it.skip("E2E Unhappy Path Journey - Expired bearer token", async () => {
	//     // Hardcoded expired Bearer Token
	//     const userInfoResponse = await userInfoPost("Bearer " + constants.DEV_IPV_BAV_EXPIRED_TOKEN);
	//     expect(userInfoResponse.status).toBe(401);
	// });

	// it.skip("E2E Unhappy Path Journey - Missing subject field", async () => {
	//     const userInfoResponse = await userInfoPost("Bearer " + constants.DEV_IPV_BAV_MISSING_SUBJECT_TOKEN);
	//     expect(userInfoResponse.status).toBe(400);
	// });

	// it.skip("E2E Unhappy Path Journey - Missing client session id field", async () => {
	//     const userInfoResponse = await userInfoPost("Bearer " + constants.DEV_IPV_BAV_MISSING_CLIENT_ID_TOKEN);
	//     expect(userInfoResponse.status).toBe(400);
	// });
});
