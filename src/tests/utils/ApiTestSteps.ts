import axios, { AxiosInstance } from "axios";
import Ajv from "ajv";
import wellKnownGetSchema from "../data/wellKnownJwksResponseSchema.json";
import { constants } from "./ApiConstants";

const API_INSTANCE = axios.create({ baseURL:constants.DEV_CRI_BAV_API_URL });
const ajv = new Ajv({ strict: false });


export async function startStubServiceAndReturnSessionId(bavStubPayload: any): Promise<any> {
	const stubResponse = await stubStartPost(bavStubPayload);
	const postRequest = await sessionPost(stubResponse.data.clientId, stubResponse.request);
	return postRequest;
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
	const path = "/userInfo";
	try {
		const postRequest = await API_INSTANCE.post(path, null, { headers: { "Authorization": `${accessToken}` } });
		return postRequest;
	} catch (error: any) {
		console.log(`Error rrsponse from ${path} endpoint ${error}.`);
		return error.response;
	}
    
}

export async function wellKnownGet():Promise<any> {
	const path = "/.well-known/jwks.json";
	try {
		const getRequest = API_INSTANCE.get( "/.well-known/jwks.json");	
		return await getRequest;
	} catch (error: any) {
		console.log(`Error response from ${path} endpoint: ${error}`);
		return error.response;
	} 
}

export function validateWellKnownResponse(response:any):void {
	const validate = ajv.compile(wellKnownGetSchema);
	const valid: boolean = validate(response);
	if (!valid) {
		console.error("Error in Well Known Get Response: " + JSON.stringify(validate.errors));
	}
	expect(valid).toBeTruthy();
}
