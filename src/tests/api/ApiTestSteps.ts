/* eslint-disable @typescript-eslint/unbound-method */
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import axios, { AxiosInstance } from "axios";
import { aws4Interceptor } from "aws4-axios";
import Ajv from "ajv";
import wellKnownGetSchema from "../data/wellKnownJwksResponseSchema.json";
import { constants } from "./ApiConstants";
import { ISessionItem } from "../../models/ISessionItem";
import { jwtUtils } from "../../utils/JwtUtils";
import { BankDetailsPayload } from "../models/BankDetailsPayload";
import NodeRSA = require("node-rsa");
import crypto from "node:crypto";

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

export async function startStubServiceAndReturnSessionId(bavStubPayload: any): Promise<string> {
	const stubResponse = await stubStartPost(bavStubPayload);
	const postRequest = await sessionPost(stubResponse.data.clientId, stubResponse.data.request);
	console.log("sessionId", postRequest.data.session_id);
	return postRequest.data.session_id;
}

export async function stubStartPost(bavStubPayload: any): Promise<any> {
	const path = constants.DEV_IPV_BAV_STUB_URL;
	try {
		const postRequest = await axios.post(`${path}`, bavStubPayload);
		expect(postRequest.status).toBe(201);
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}.`);
		return error.response;
	}
}

export async function sessionPost(clientId: any, request: any): Promise<any> {
	const path = "/session";
	try {
		const postRequest = await API_INSTANCE.post(path, { client_id: clientId, request });
		expect(postRequest.status).toBe(200);
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}.`);
		return error.response;
	}
}

export async function personInfoGet(sessionId: string): Promise<any> {
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

export async function personInfoKeyGet(): Promise<any> {
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

export async function verifyAccountPost(bankDetails: BankDetailsPayload, sessionId: any): Promise<any> {
	const path = "/verify-account";
	try {
		const postRequest = await API_INSTANCE.post(path, JSON.stringify(bankDetails), { headers: { "x-govuk-signin-session-id": sessionId } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	}
}


export async function authorizationGet(sessionId: any): Promise<any> {
	const path = "/authorization";
	try {
		const getRequest = await API_INSTANCE.get(path, { headers: { "session-id": sessionId } });
		return getRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}.`);
		return error.response;
	}
}

export async function tokenPost(authCode?: any, redirectUri?: any): Promise<any> {
	const path = "/token";
	try {

		const postRequest = await API_INSTANCE.post(path, `code=${authCode}&grant_type=authorization_code&redirect_uri=${redirectUri}`, { headers: { "Content-Type": "text/plain" } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint ${error}.`);
		return error.response;
	}
}

export async function userInfoPost(accessToken?: any): Promise<any> {
	const path = "/userinfo";
	try {
		const postRequest = await API_INSTANCE.post(path, null, { headers: { "Authorization": `${accessToken}` } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error rrsponse from ${path} endpoint ${error}.`);
		return error.response;
	}
}

export async function wellKnownGet(): Promise<any> {
	const path = "/.well-known/jwks.json";
	try {
		const getRequest = API_INSTANCE.get("/.well-known/jwks.json");
		return await getRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	}
}

export function validateWellKnownResponse(response: any): void {
	const validate = ajv.compile(wellKnownGetSchema);
	const valid: boolean = validate(response);
	if (!valid) {
		console.error("Error in Well Known Get Response: " + JSON.stringify(validate.errors));
	}
	expect(valid).toBeTruthy();
}

export async function getSessionById(sessionId: string, tableName: string): Promise<ISessionItem | undefined> {
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
	} catch (e: any) {
		console.error({ message: "getSessionById - failed getting session from Dynamo", e });
	}

	return session;
}

export async function getKeyFromSession(sessionId: string, tableName: string, key: string): Promise<any> {
	const sessionInfo = await getSessionById(sessionId, tableName);
	try {
		return sessionInfo![key as keyof ISessionItem];
	} catch (e: any) {
		throw new Error("getKeyFromSession - Failed to get " + key + " value: " + e);
	}
}

export async function getSessionAndVerifyKey(sessionId: string, tableName: string, key: string, expectedValue: string): Promise<void> {
	const sessionInfo = await getSessionById(sessionId, tableName);
	try {
		expect(sessionInfo![key as keyof ISessionItem]).toBe(expectedValue);
	} catch (e: any) {
		throw new Error("getSessionAndVerifyKey - Failed to verify " + key + " value: " + e);
	}
}

export async function getSessionAndVerifyKeyExists(sessionId: string, tableName: string, key: string): Promise<void> {
	const sessionInfo = await getSessionById(sessionId, tableName);
	try {
		// eslint-disable-next-line jest/valid-expect, no-unused-expressions, @typescript-eslint/no-unused-expressions
		expect(sessionInfo![key as keyof ISessionItem]).toBeTruthy;
	} catch (e: any) {
		throw new Error("getSessionAndVerifyKeyExists - Failed to verify " + key + " exists: " + e);
	}
}

export async function validateJwtToken(jwtToken: any): Promise<void> {
	const [rawHead, rawBody, signature] = jwtToken.split(".");

	await validateRawHead(rawHead);
	validateRawBody(rawBody);
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

function validateRawBody(rawBody: any): void {
	const decodedBody = decodeRawBody(rawBody);
	expect(decodedBody.jti).toBeTruthy();
	expect(decodedBody.vc.evidence[0].strengthScore).toBe(3);
	expect(decodedBody.vc.evidence[0].validityScore).toBe(2);
}

export function decodeRawBody(rawBody: any): any {
	return JSON.parse(jwtUtils.base64DecodeToString(rawBody.replace(/\W/g, "")));
}

export async function abortPost(sessionId: string): Promise<any> {
	const path = "/abort";
	try {
		const postRequest = await API_INSTANCE.post(path, null, { headers: { "x-govuk-signin-session-id": sessionId } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	}
}

export function validatePersonInfoResponse(personInfoKey: string, personInfoResponse: any, firstName: string, lastName: string): void {
	const privateKey = new NodeRSA(personInfoKey);
	const encryptedValue = personInfoResponse.data;
	const decryptedValue = privateKey.decrypt(encryptedValue, "utf8");
	expect(decryptedValue).toBe("{\"name\":\"" + firstName + " " + lastName + "\"}");
}
