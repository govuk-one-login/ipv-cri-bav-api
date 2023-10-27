import axios, { AxiosInstance } from "axios";
import { aws4Interceptor } from "aws4-axios";
import { XMLParser } from "fast-xml-parser";
import Ajv from "ajv";
import wellKnownGetSchema from "../data/wellKnownJwksResponseSchema.json";
import { constants } from "./ApiConstants";
import { ISessionItem } from "../../models/ISessionItem";

const API_INSTANCE = axios.create({ baseURL: constants.DEV_CRI_BAV_API_URL });
const ajv = new Ajv({ strict: false });

const HARNESS_API_INSTANCE: AxiosInstance = axios.create({ baseURL: constants.DEV_BAV_TEST_HARNESS_URL });
const awsSigv4Interceptor = aws4Interceptor({
	options: {
		region: "eu-west-2",
		service: "execute-api",
	},
});
HARNESS_API_INSTANCE.interceptors.request.use(awsSigv4Interceptor);
const xmlParser = new XMLParser();

export async function startStubServiceAndReturnSessionId(bavStubPayload: any): Promise<any> {
	const stubResponse = await stubStartPost(bavStubPayload);
	const postRequest = await sessionPost(stubResponse.data.clientId, stubResponse.data.request);
	console.log(postRequest.data.session_id);
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

export async function getSessionAndVerifyKey(sessionId: any, tableName: string, key: string, expectedValue: string) {
	const sessionInfo = await getSessionById(sessionId, tableName);
	try {
		expect(sessionInfo![key as keyof ISessionItem]).toBe(expectedValue);
	} catch (e: any) {
		throw new Error("getSessionAndVerifyKey - Failed to verify " + key + " value: " + e);
	}
}

/**
 * Retrieves an object from the bucket with the specified prefix, which is the latest message dequeued from the SQS
 * queue under test
 *
 * @param prefix
 * @returns {any} - returns either the body of the SQS message or undefined if no such message found
 */
export async function getSqsEventList(folder: string, prefix: string, txmaEventSize: number): Promise<any> {
	let keys: any[];
	let keyList: any[];
	let i: any;
	do {
		const listObjectsResponse = await HARNESS_API_INSTANCE.get("/bucket/", {
			params: {
				prefix: folder + prefix,
			},
		});
		const listObjectsParsedResponse = xmlParser.parse(listObjectsResponse.data);
		if (!listObjectsParsedResponse?.ListBucketResult?.Contents) {
			return undefined;
		}
		keys = listObjectsParsedResponse?.ListBucketResult?.Contents;
		keyList = [];

		if (txmaEventSize == 1) {
			keyList.push(listObjectsParsedResponse.ListBucketResult.Contents.Key);
		} else {
			for (i = 0; i < keys.length; i++) {
				keyList.push(listObjectsParsedResponse?.ListBucketResult?.Contents.at(i).Key);
			}
		}
	} while (keys.length < txmaEventSize);
	return keyList;
}
/**
 * Retrieves an object from the bucket with the specified prefix, which is the latest message dequeued from the SQS
 * queue under test
 *
 * @param prefix
 * @returns {any} - returns either the body of the SQS message or undefined if no such message found
 */
export async function getDequeuedSqsMessage(prefix: string): Promise<any> {
	const listObjectsResponse = await HARNESS_API_INSTANCE.get("/bucket/", {
		params: {
			prefix: "txma/" + prefix,
		},
	});
	const listObjectsParsedResponse = xmlParser.parse(listObjectsResponse.data);
	if (!listObjectsParsedResponse?.ListBucketResult?.Contents) {
		return undefined;
	}
	let key: string;
	if (Array.isArray(listObjectsParsedResponse?.ListBucketResult?.Contents)) {
		key = listObjectsParsedResponse.ListBucketResult.Contents.at(-1).Key;
	} else {
		key = listObjectsParsedResponse.ListBucketResult.Contents.Key;
	}

	const getObjectResponse = await HARNESS_API_INSTANCE.get("/object/" + key, {});
	return getObjectResponse.data;
}

export async function validateTxMAEventData(keyList: any): Promise<any> {
	let i: any;
	for (i = 0; i < keyList.length; i++) {
		const getObjectResponse = await HARNESS_API_INSTANCE.get("/object/" + keyList[i], {});
		console.log(JSON.stringify(getObjectResponse.data, null, 2));
		let valid = true;
		import("../data/" + getObjectResponse.data.event_name + "_SCHEMA.json")
			.then((jsonSchema) => {
				const validate = ajv.compile(jsonSchema);
				valid = validate(getObjectResponse.data);
				if (!valid) {
					console.error(getObjectResponse.data.event_name + " Event Errors: " + JSON.stringify(validate.errors));
				}
			})
			.catch((err) => {
				console.log(err.message);
			})
			.finally(() => {
				expect(valid).toBe(true);
			});
	}
}
