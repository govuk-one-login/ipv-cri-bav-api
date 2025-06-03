/* eslint-disable @typescript-eslint/unbound-method */
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { aws4Interceptor } from "aws4-axios";
import Ajv from "ajv";
import wellKnownGetSchema from "../data/wellKnownJwksResponseSchema.json";
import { constants } from "./ApiConstants";
import { Constants } from "../../utils/Constants";
import { ISessionItem } from "../../models/ISessionItem";
import { jwtUtils } from "../../utils/JwtUtils";
import { BankDetailsPayload } from "../models/BankDetailsPayload";
import NodeRSA from "node-rsa";
import crypto from "node:crypto";
import {
	StubStartRequest,
	StubStartResponse,
	SessionResponse,
	VerifyAccountResponse,
	AuthorizationResponse,
	WellKnownReponse,
	TokenResponse,
	UserInfoResponse,
} from "./types";

const API_INSTANCE = axios.create({ baseURL: constants.DEV_CRI_BAV_API_URL });
const ajv = new Ajv({ strict: false });

export const HARNESS_API_INSTANCE: AxiosInstance = axios.create({ baseURL: constants.DEV_BAV_TEST_HARNESS_URL });

const customCredentialsProvider = {
	getCredentials: fromNodeProviderChain({
		timeout: 1000,
		maxRetries: 0,
	}),
};
const awsSigv4Interceptor = aws4Interceptor({
	options: {
		region: "eu-west-2",
		service: "execute-api",
	},
	credentials: customCredentialsProvider,
});

HARNESS_API_INSTANCE.interceptors.request.use(awsSigv4Interceptor);

export async function startStubServiceAndReturnSessionId(bavStubPayload?: StubStartRequest): Promise<string> {
	const stubResponse = await stubStartPost(bavStubPayload);
	const postRequest = await sessionPost(stubResponse.data.clientId, stubResponse.data.request);
	console.log("sessionId", postRequest.data.session_id);
	return postRequest.data.session_id;
}

interface KidOptions {
	journeyType: 'invalidKid' | 'missingKid';
}

export async function stubStartPost(bavStubPayload?: StubStartRequest, options?: KidOptions): Promise<AxiosResponse<StubStartResponse>> {
	const path = constants.DEV_IPV_BAV_STUB_URL! + "/start";

	let postRequest: AxiosResponse<StubStartResponse>;
  
	if (bavStubPayload || options) { 
	  const payload: StubStartRequest = {
		shared_claims: { name: [], birthDate: [] },
		...(bavStubPayload ?? {}),
	  };
  
	  if (options) {
		payload[options.journeyType] = true;
	  }
  
	  try {
		postRequest = await axios.post(path, payload);
	  } catch (error: any) {
		console.error(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	  }
	} else {
	  try {
		postRequest = await axios.post(path);
	  } catch (error: any) {
		console.error(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	  }
	}
  
	expect(postRequest.status).toBe(200);
	return postRequest;
}

export async function startTokenPost(options?: KidOptions): Promise<AxiosResponse<string>> {
	const path = constants.DEV_IPV_BAV_STUB_URL! + "/generate-token-request";
	let postRequest: AxiosResponse<string>;

	if (options) {
		const payload = { [options.journeyType]: true };

		try {
			postRequest = await axios.post(path, payload);
		} catch (error: any) {
			console.error(`Error response from ${path} endpoint: ${error}`);
			return error.response;
		}
	} else {
		try {
			postRequest = await axios.post(path);
		} catch (error: any) {
			console.error(`Error response from ${path} endpoint: ${error}`);
			return error.response;
		}
	}

	expect(postRequest.status).toBe(200);
	return postRequest;
}


export async function sessionPost(clientId: string, request: string): Promise<AxiosResponse<SessionResponse>> {
	const path = "/session";
	try {
		const postRequest = await API_INSTANCE.post(path, { client_id: clientId, request }, { headers: { "txma-audit-encoded": "encoded-header", "x-forwarded-for": "user ip address" } });
		expect(postRequest.status).toBe(200);
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}.`);
		return error.response;
	}
}

export async function personInfoGet(sessionId: string): Promise<AxiosResponse<string>> {
	const path = "/person-info";
	try {
		const getRequest = await API_INSTANCE.get(path, { headers: { "x-govuk-signin-session-id": sessionId } });
		expect(getRequest.status).toBe(200);
		return getRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}.`);
		return error.response;
	}
}

export async function personInfoKeyGet(): Promise<AxiosResponse<{ key: string }>> {
	const path = "/person-info-key";
	try {
		const getRequest = await API_INSTANCE.get(path);
		expect(getRequest.status).toBe(200);
		return getRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}.`);
		return error.response;
	}
}

export async function verifyAccountPost(bankDetails: BankDetailsPayload, sessionId: string): Promise<AxiosResponse<VerifyAccountResponse>> {
	const path = "/verify-account";
	try {
		const postRequest = await API_INSTANCE.post(path, JSON.stringify(bankDetails), { headers: { "x-govuk-signin-session-id": sessionId, "txma-audit-encoded": "encoded-header", "x-forwarded-for": "user ip address" } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	}
}


export async function authorizationGet(sessionId: string): Promise<AxiosResponse<AuthorizationResponse>> {
	const path = "/authorization";
	try {
		const getRequest = await API_INSTANCE.get(path, { headers: { "session-id": sessionId } });
		return getRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}.`);
		return error.response;
	}
}

export async function tokenPost(authCode: string, redirectUri: string, clientAssertionJwt: string, clientAssertionType?: string): Promise<AxiosResponse<TokenResponse>> {
	const path = "/token";
  
	const assertionType = clientAssertionType || Constants.CLIENT_ASSERTION_TYPE_JWT_BEARER;
  
	try {
		const postRequest = await API_INSTANCE.post(path, `code=${authCode}&grant_type=authorization_code&redirect_uri=${redirectUri}&client_assertion_type=${assertionType}&client_assertion=${clientAssertionJwt}`, { headers: { "Content-Type": "text/plain" } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint ${error}.`);
		return error.response;
	}
}

export async function userInfoPost(accessToken: string): Promise<AxiosResponse<UserInfoResponse>> {
	const path = "/userinfo";
	try {
		const postRequest = await API_INSTANCE.post(path, null, { headers: { "Authorization": `${accessToken}` } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error rrsponse from ${path} endpoint ${error}.`);
		return error.response;
	}
}

export async function wellKnownGet(): Promise<AxiosResponse<WellKnownReponse>> {
	const path = "/.well-known/jwks.json";
	try {
		const getRequest = API_INSTANCE.get("/.well-known/jwks.json");
		return await getRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	}
}

export function validateWellKnownResponse(response: WellKnownReponse): void {
	const validate = ajv.compile(wellKnownGetSchema);
	const valid: boolean = validate(response);
	if (!valid) {
		console.error("Error in Well Known Get Response: " + JSON.stringify(validate.errors));
	}
	expect(valid).toBeTruthy();
}

export async function getSessionById(sessionId: string, tableName: string | undefined): Promise<ISessionItem | undefined> {
	interface OriginalValue {
		N?: string;
		S?: string;
	}

	interface OriginalSessionItem {
		[key: string]: OriginalValue;
	}

	let session: ISessionItem | undefined;
	try {
		const response = await HARNESS_API_INSTANCE.get<{ Item: OriginalSessionItem }>(`getRecordBySessionId/${tableName}/${sessionId}`, {});
		const originalSession = response.data.Item;
		session = Object.fromEntries(
			Object.entries(originalSession).map(([key, value]) => [key, value.N ?? value.S]),
		) as unknown as ISessionItem;
	} catch (error: any) {
		console.error({ message: "getSessionById - failed getting session from Dynamo", error });
	}

	return session;
}

export async function getAthenaRecordByFirstNameAndTime(startTime: number, firstName: string): Promise<Array<Record<string, string>>> {
	try {
		const athenaResult = await HARNESS_API_INSTANCE.get("/athena/query", {
			params: {
				"min-timestamp": startTime,
				"name-prefix": firstName,
			},
		});
		return athenaResult.data as Array<Record<string, string>>;
	} catch (error: any) {
		console.error({ message: "getAthenaRecordByFirstNameAndTime - failed getting Athena records", error });
	}
	return [];
}

export async function getKeyFromSession(sessionId: string, tableName: string | undefined, key: string): Promise<any> {
	const sessionInfo = await getSessionById(sessionId, tableName);
	try {
		return sessionInfo![key as keyof ISessionItem];
	} catch (error: any) {
		throw new Error("getKeyFromSession - Failed to get " + key + " value: " + error);
	}
}

export async function getSessionAndVerifyKey(sessionId: string, tableName: string | undefined, key: string, expectedValue: string): Promise<void> {
	const sessionInfo = await getSessionById(sessionId, tableName);
	try {
		expect(sessionInfo![key as keyof ISessionItem]).toBe(expectedValue);
	} catch (error: any) {
		throw new Error("getSessionAndVerifyKey - Failed to verify " + key + " value: " + error);
	}
}

export async function getSessionAndVerifyKeyExists(sessionId: string, tableName: string | undefined, key: string): Promise<void> {
	const sessionInfo = await getSessionById(sessionId, tableName);
	try {
		expect(sessionInfo![key as keyof ISessionItem]).toBeTruthy();
	} catch (error: any) {
		throw new Error("getSessionAndVerifyKeyExists - Failed to verify " + key + " exists: " + error);
	}
}

export async function validateJwtToken(jwtToken: string, validityScore: number): Promise<void> {
	const [rawHead, rawBody] = jwtToken.split(".");

	await validateRawHead(rawHead);
	validateRawBody(rawBody, validityScore);
}

async function validateRawHead(rawHead: any): Promise<void> {
	const decodeRawHead = JSON.parse(jwtUtils.base64DecodeToString(rawHead.replace(/\W/g, "")));
	expect(decodeRawHead.alg).toBe("ES256");
	expect(decodeRawHead.typ).toBe("JWT");
	const msgBuffer = new TextEncoder().encode(constants.VC_SIGNING_KEY_ID);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
	expect(decodeRawHead.kid).toBe("did:web:" + constants.DNS_SUFFIX + "#" + hashHex);
}

function validateRawBody(rawBody: any, validityScore: number): void {
	const decodedBody = decodeRawBody(rawBody);
	expect(decodedBody.jti).toBeTruthy();
	expect(decodedBody.vc.evidence[0].strengthScore).toBe(3);
	expect(decodedBody.vc.evidence[0].validityScore).toBe(validityScore);
}

export function decodeRawBody(rawBody: any): any {
	return JSON.parse(jwtUtils.base64DecodeToString(rawBody.replace(/\W/g, "")));
}

export async function abortPost(sessionId: string): Promise<AxiosResponse<string>> {
	const path = "/abort";
	try {
		const postRequest = await API_INSTANCE.post(path, null, { headers: { "x-govuk-signin-session-id": sessionId, "txma-audit-encoded": "encoded-header" } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	}
}

export function validatePersonInfoResponse(personInfoKey: string, personInfoResponse: string, firstName: string, lastName: string): void {
	const privateKey = new NodeRSA(personInfoKey);
	const encryptedValue = personInfoResponse;
	const decryptedValue = privateKey.decrypt(encryptedValue, "utf8");
	expect(decryptedValue).toBe("{\"name\":\"" + firstName + " " + lastName + "\"}");
}
