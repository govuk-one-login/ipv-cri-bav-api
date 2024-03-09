import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "./utils/Constants";
import {
	AthenaClient,
	GetQueryExecutionCommand,
	GetQueryExecutionCommandOutput,
	GetQueryExecutionInput,
	GetQueryResultsCommand,
	GetQueryResultsInput,
	QueryExecutionState, Row,
	StartQueryExecutionCommand,
	StartQueryExecutionInput
} from "@aws-sdk/client-athena";
import { setTimeout } from "timers/promises";

const POWERTOOLS_LOG_LEVEL = process.env.POWERTOOLS_LOG_LEVEL
	? process.env.POWERTOOLS_LOG_LEVEL
	: Constants.DEBUG;
const POWERTOOLS_SERVICE_NAME = process.env.POWERTOOLS_SERVICE_NAME
	? process.env.POWERTOOLS_SERVICE_NAME
	: Constants.DEQUEUE_LOGGER_SVC_NAME;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

const athenaClient = new AthenaClient({region: process.env.REGION});

function convertAthenaResultsToListOfMaps(data: Row[]) : Record<string,string>[] {
	if (data.length === 0) { return [] }
	const mappedData: Record<string,string>[] = [];
	const columns: string []  = data[0].Data!.map((column) => {
		return column.VarCharValue ?? "";
	});
	data.forEach((item, i) => {
		if (i === 0) { return; }
		if (columns[i] == undefined) { return; }
		const mappedObject:Record<string,string> = {};
		item.Data?.forEach((value, i) => {
			mappedObject[columns[i]] = value.VarCharValue ?? "";
		});
		mappedData.push(mappedObject);
	})
	return mappedData
}

class AthenaQueryHandler implements LambdaInterface {
	async handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
		logger.info("Starting AthenaQueryHandler");

		const sqlString = 'select * from "partialnamematch-backend-ddunford-bav"';
		const queryExecutionInput : StartQueryExecutionInput = {
			QueryString: sqlString,
			QueryExecutionContext: {
				Database: 'partialnamematch-backend-ddunford-bav',
				Catalog: 'AwsDataCatalog'
			},
			WorkGroup: 'PartialNameMatch-backend-ddunford-bav',
		}

		logger.debug("Sending query", {input: queryExecutionInput})
		const startQueryExecutionCommandOutput = await athenaClient.send(new StartQueryExecutionCommand(queryExecutionInput));
		logger.debug("Query start response", {output: startQueryExecutionCommandOutput})
		const getQueryExecutionInput : GetQueryExecutionInput = {
			QueryExecutionId: startQueryExecutionCommandOutput.QueryExecutionId,
		}

		let queryState: QueryExecutionState | undefined;
		let getQueryExecutionCommandOutput : GetQueryExecutionCommandOutput;
		do {
			await setTimeout(500); //wait for pollInterval before calling again.
			const getQueryExecutionCommand = new GetQueryExecutionCommand(getQueryExecutionInput);
			logger.debug("Get Query input", {input: getQueryExecutionInput});
			getQueryExecutionCommandOutput = await athenaClient.send(getQueryExecutionCommand);
			logger.debug("Get Query output", {output: getQueryExecutionCommandOutput});
			queryState = getQueryExecutionCommandOutput.QueryExecution?.Status?.State;
		} while (queryState === QueryExecutionState.QUEUED || queryState === QueryExecutionState.RUNNING)

		if(queryState === QueryExecutionState.SUCCEEDED) {
			logger.debug("Succeeded");
			const getQueryResultsInput : GetQueryResultsInput = {
				QueryExecutionId: startQueryExecutionCommandOutput.QueryExecutionId,
				MaxResults: 1000,
			};

			const getQueryResultsCommand = new GetQueryResultsCommand(getQueryResultsInput);

			const getQueryResultsCommandOutput = await athenaClient.send(getQueryResultsCommand);

			logger.info("GetQueryResultsCommandOutput : ", {output: getQueryResultsCommandOutput.ResultSet?.Rows});

			return {
				statusCode: 200,
				body: JSON.stringify(convertAthenaResultsToListOfMaps(getQueryResultsCommandOutput.ResultSet?.Rows ?? []))
			}

		} else if(queryState === QueryExecutionState.FAILED) {
			logger.error(`Query failed: ${getQueryExecutionCommandOutput.QueryExecution?.Status?.StateChangeReason}`);
			return {
				statusCode: 500,
				body: "ERROR",
			};

		} else if(queryState === QueryExecutionState.CANCELLED) {
			logger.error("Query was cancelled");
			return {
				statusCode: 500,
				body: "ERROR",
			};
		}

		return {
			statusCode: 200,
			body: "OK",
		};
	}
}

const handlerClass = new AthenaQueryHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
