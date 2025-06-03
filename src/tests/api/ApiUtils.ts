import Ajv from "ajv";
import { XMLParser } from "fast-xml-parser";
import { HARNESS_API_INSTANCE } from "./ApiTestSteps";
import { TxmaEvent, TxmaEventName } from "../../utils/TxmaEvent";
import { CloudWatchClient, DescribeAlarmsCommand, DescribeAlarmsCommandInput } from "@aws-sdk/client-cloudwatch";
const client = new CloudWatchClient({ region: "eu-west-2" });
import jp from "jsonpath";
import * as BAV_COP_REQUEST_SENT_SCHEMA from "../data/BAV_COP_REQUEST_SENT_SCHEMA.json";
import * as BAV_EXPERIAN_REQUEST_SENT_SCHEMA from "../data/BAV_EXPERIAN_REQUEST_SENT.json";
import * as BAV_COP_RESPONSE_RECEIVED_SCHEMA from "../data/BAV_COP_RESPONSE_RECEIVED_SCHEMA.json";
import * as BAV_EXPERIAN_RESPONSE_RECEIVED_SCHEMA from "../data/BAV_EXPERIAN_RESPONSE_RECEIVED.json";
import * as BAV_CRI_END_SCHEMA from "../data/BAV_CRI_END_SCHEMA.json";
import * as BAV_CRI_SESSION_ABORTED_SCHEMA from "../data/BAV_CRI_SESSION_ABORTED_SCHEMA.json";
import * as BAV_CRI_START_SCHEMA from "../data/BAV_CRI_START_SCHEMA.json";
import * as BAV_CRI_VC_ISSUED_SCHEMA_FAILURE from "../data/BAV_CRI_VC_ISSUED_SCHEMA_FAILURE.json";
import * as BAV_CRI_VC_ISSUED_SCHEMA_SUCCESS from "../data/BAV_CRI_VC_ISSUED_SCHEMA_SUCCESS.json";
import * as BAV_CRI_VC_ISSUED_WITH_CI_SCHEMA from "../data/BAV_CRI_VC_ISSUED_WITH_CI_SCHEMA.json";

const ajv = new Ajv({ strictTuples: false });
ajv.addSchema(BAV_COP_REQUEST_SENT_SCHEMA, "BAV_COP_REQUEST_SENT_SCHEMA");
ajv.addSchema(BAV_EXPERIAN_REQUEST_SENT_SCHEMA, "BAV_EXPERIAN_REQUEST_SENT_SCHEMA");
ajv.addSchema(BAV_EXPERIAN_RESPONSE_RECEIVED_SCHEMA, "BAV_EXPERIAN_RESPONSE_RECEIVED_SCHEMA");
ajv.addSchema(BAV_COP_RESPONSE_RECEIVED_SCHEMA, "BAV_COP_RESPONSE_RECEIVED_SCHEMA");
ajv.addSchema(BAV_CRI_END_SCHEMA, "BAV_CRI_END_SCHEMA");
ajv.addSchema(BAV_CRI_START_SCHEMA, "BAV_CRI_START_SCHEMA");
ajv.addSchema(BAV_CRI_SESSION_ABORTED_SCHEMA, "BAV_CRI_SESSION_ABORTED_SCHEMA");
ajv.addSchema(BAV_CRI_VC_ISSUED_SCHEMA_FAILURE, "BAV_CRI_VC_ISSUED_SCHEMA_FAILURE");
ajv.addSchema(BAV_CRI_VC_ISSUED_SCHEMA_SUCCESS, "BAV_CRI_VC_ISSUED_SCHEMA_SUCCESS");
ajv.addSchema(BAV_CRI_VC_ISSUED_WITH_CI_SCHEMA, "BAV_CRI_VC_ISSUED_WITH_CI_SCHEMA");

const xmlParser = new XMLParser();

interface TestHarnessReponse {
	data: TxmaEvent;
}

interface AllTxmaEvents {
	"BAV_CRI_START"?: TxmaEvent;
	"BAV_COP_REQUEST_SENT"?: TxmaEvent;
	"BAV_COP_RESPONSE_RECEIVED"?: TxmaEvent;
	"BAV_CRI_VC_ISSUED"?: TxmaEvent;
	"BAV_CRI_END"?: TxmaEvent;
	"BAV_CRI_SESSION_ABORTED"?: TxmaEvent;
	"BAV_EXPERIAN_REQUEST_SENT"?: TxmaEvent;
	"BAV_EXPERIAN_RESPONSE_RECEIVED"?: TxmaEvent;
}

const getTxMAS3FileNames = async (prefix: string): Promise<any> => {
	const listObjectsResponse = await HARNESS_API_INSTANCE.get("/bucket/", {
		params: {
			prefix: "txma/" + prefix,
		},
	});
	const listObjectsParsedResponse = xmlParser.parse(listObjectsResponse.data);
	return listObjectsParsedResponse?.ListBucketResult?.Contents;
};

const getAllTxMAS3FileContents = async (fileNames: any[]): Promise<AllTxmaEvents> => {
	const allContents = await fileNames.reduce(
		async (accumulator: Promise<AllTxmaEvents>, fileName: any) => {
			const resolvedAccumulator = await accumulator;

			const eventContents: TestHarnessReponse = await HARNESS_API_INSTANCE.get("/object/" + fileName.Key, {});
			resolvedAccumulator[eventContents?.data?.event_name] = eventContents.data;

			return resolvedAccumulator;
		}, Promise.resolve({}),
	);

	return allContents;
};

export async function getTxmaEventsFromTestHarness(sessionId: string, numberOfTxMAEvents: number): Promise<any> {
	let objectList: AllTxmaEvents = {};
	let fileNames: any = [];

	await new Promise(res => setTimeout(res, 3000));
	fileNames = await getTxMAS3FileNames(sessionId);

	// AWS returns an array for multiple but an object for single
	if (numberOfTxMAEvents === 1) {
		if (!fileNames || !fileNames.Key) {
			console.log(`No TxMA events found for session ID ${sessionId}`);
			return undefined;
		}

		const eventContents: TestHarnessReponse = await HARNESS_API_INSTANCE.get("/object/" + fileNames.Key, {});
		objectList[eventContents?.data?.event_name] = eventContents.data;
	} else {
		if (!fileNames || !fileNames.length) {
			console.log(`No TxMA events found for session ID ${sessionId}`);
			return undefined;
		}

		const additionalObjectList = await getAllTxMAS3FileContents(fileNames);
		objectList = { ...objectList, ...additionalObjectList };
	}
	return objectList;
}

export function validateTxMAEventData(
	{ eventName, schemaName }: { eventName: TxmaEventName; schemaName: string }, allTxmaEventBodies: AllTxmaEvents = {},
): void {
	const currentEventBody: TxmaEvent | undefined = allTxmaEventBodies[eventName];

	if (currentEventBody?.event_name) {
		try {
			const validate = ajv.getSchema(schemaName);
			if (validate) {
				expect(validate(currentEventBody)).toBe(true);
			} else {
				throw new Error(`Could not find schema ${schemaName}`);
			}
		} catch (error) {
			console.error(`Error validating event ${eventName}`, error);
			throw error;
		}
	} else {
		throw new Error(`No event found in the test harness for ${eventName} event`);
	}
}

function deepEqual(a: any, b: any): boolean {
	if (a === b) return true;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, index) => deepEqual(item, b[index]));
	}

	if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) return false;
		return keysA.every(key => deepEqual(a[key], b[key]));
	}
	return false;
}

export function validateTxMAEventField(
	{ eventName, jsonPath, expectedValue }: { eventName: TxmaEventName; jsonPath: string; expectedValue: any },
	allTxmaEventBodies: AllTxmaEvents = {},
): void {
	const currentEventBody: TxmaEvent | undefined = allTxmaEventBodies[eventName];

	if (currentEventBody?.event_name) {
		try {
			const actualValue = jp.query(currentEventBody, jsonPath);
			if (actualValue.length === 0) {
				throw new Error(`No value found for JSONPath ${jsonPath} in event ${eventName}`);
			}

			if (!deepEqual(expectedValue, actualValue[0])) {
				throw new Error(`Validation failed: Expected ${JSON.stringify(expectedValue)} but found ${JSON.stringify(actualValue)} for key path "${jsonPath}" in event ${eventName}`);
			}
		} catch (error) {
			console.error(`Error validating key path "${jsonPath}" in event ${eventName}`, error);
			throw error;
		}
	} else {
		throw new Error(`No event found in the test harness for ${eventName} event`);
	}
}

export async function describeAlarm(alarmName: string): Promise<any> {
	try {
		const params: DescribeAlarmsCommandInput = {
			AlarmNames: [alarmName],
		};

		const command = new DescribeAlarmsCommand(params);
		const response = await client.send(command);

		if (response.MetricAlarms && response.MetricAlarms.length > 0) {
			return response.MetricAlarms[0];
		} else {
			console.error("Alarm not found");
			return undefined;
		}
	} catch (error) {
		console.error("Error describing alarm:", error);
		throw error;
	}
}


export function absoluteTimeNow(): number {
	return Math.floor(Date.now() / 1000);
}

export function sleep(ms = 0): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
