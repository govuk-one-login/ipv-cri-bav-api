import bavStubPayload from "../data/exampleStubPayload.json";
import verifyAccountYesPayload from "../data/bankDetailsYes.json";
import {
	authorizationGet,
	sessionPost,
	personInfoGet,
	startStubServiceAndReturnSessionId,
	stubStartPost,
	userInfoPost,
	verifyAccountPost,
	tokenPost,
	getSessionAndVerifyKey,
} from "../utils/ApiTestSteps";
import { constants } from "../utils/ApiConstants";
import { BankDetailsPayload } from "../models/BankDetailsPayload";
import { randomUUID } from "crypto";


describe("BAV CRI: /session Endpoint Unhappy Path Tests", () => {
	let stubResponse: any;
	beforeEach(async () => {
		stubResponse = await stubStartPost(bavStubPayload);
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

describe("BAV CRI: /person-info Endpoint Unhappy Path Tests", () => {

	it("Invalid Session Id Test", async () => {
		const sessionId = randomUUID();

		// Person Info
		const personInfoResponse = await personInfoGet(sessionId);
		expect(personInfoResponse.status).toBe(401);
		expect(personInfoResponse.data).toBe("No person found with the session id: " + sessionId);

	});
});


describe("BAV CRI: /verify-account Endpoint Unhappy Path Tests", () => {
	let sessionId: string;

	it("HMRC Multiple Retries Test - Error Code 5XX", async () => {
		const newBavStubPayload = structuredClone(bavStubPayload);
		newBavStubPayload.shared_claims.name[0].nameParts[0].value = "Evan";
		newBavStubPayload.shared_claims.name[0].nameParts[1].value = "Erickson";

		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(newBavStubPayload);

		// Verify-account request
		const verifyAccountResponse = await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);
		expect(verifyAccountResponse.status).toBe(500);

		// Make sure authSession state is NOT BAV_DATA_RECEIVED
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");
	});

	it("HMRC Multiple Retries Test - Error Code 429", async () => {
		const newBavStubPayload = structuredClone(bavStubPayload);
		newBavStubPayload.shared_claims.name[0].nameParts[0].value = "Evan Tom Mark";
		newBavStubPayload.shared_claims.name[0].nameParts[1].value = "Erickson";

		// Session Request
		sessionId = await startStubServiceAndReturnSessionId(newBavStubPayload);

		// Verify-account request
		const verifyAccountResponse = await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);
		expect(verifyAccountResponse.status).toBe(500);

		// Make sure authSession state is NOT BAV_DATA_RECEIVED
		await getSessionAndVerifyKey(sessionId, constants.DEV_BAV_SESSION_TABLE_NAME, "authSessionState", "BAV_SESSION_CREATED");
	});

	it.each([
		["Ashley", "Allen"],
		["Deborah", "Dawson"],
		["Nigel", "Newton"],
		["Yasmine", "Dawson"],
		["Yasmine", "Newton"],
		["Yasmine", "Palmer"],
	])("Name Retry Tests - Too many retries rejection", async (firstName: string, lastName: any) => {
		const newBavStubPayload = structuredClone(bavStubPayload); 
		newBavStubPayload.shared_claims.name[0].nameParts[0].value = firstName;
		newBavStubPayload.shared_claims.name[0].nameParts[1].value = lastName;

		sessionId = await startStubServiceAndReturnSessionId(newBavStubPayload);

		// Verify-account first name mismatch
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		// Verify-account second name mismatch
		await verifyAccountPost(verifyAccountYesPayload, sessionId);

		// Verify-account third name mismatch
		const verifyAccountResponseSecondRetry = await verifyAccountPost(verifyAccountYesPayload, sessionId);
		expect(verifyAccountResponseSecondRetry.status).toBe(401);
		expect(verifyAccountResponseSecondRetry.data).toBe("Too many attempts");
	});
});

describe("BAV CRI: /authorization Endpoint Unhappy Path Tests", () => {
	let sessionId: string;
	beforeEach(async () => {
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it("Incorrect Session State Test", async () => {
		// Authorization
		const authResponse = await authorizationGet(sessionId);
		expect(authResponse.status).toBe(401);
	});

	it("Repeated Request Made Test", async () => {
		const origSessionId = sessionId;
		await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);
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
		//Session Request
		sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);
	});

	it("Invalid Session State Test", async () => {
		// Verify-account request
		await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);

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
		const sessionId = await startStubServiceAndReturnSessionId(bavStubPayload);

		// Verify-account request
		await verifyAccountPost(new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId);

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
