import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {LambdaInterface} from "@aws-lambda-powertools/commons";
import {Metrics} from "@aws-lambda-powertools/metrics";
import {Logger} from "@aws-lambda-powertools/logger";
import {Constants} from "./utils/Constants";
import {
	AthenaClient,
	GetQueryExecutionCommand,
	GetQueryExecutionCommandOutput,
	GetQueryExecutionInput,
	GetQueryResultsCommand,
	GetQueryResultsInput,
	QueryExecutionState,
	StartQueryExecutionCommand,
	StartQueryExecutionInput
} from "@aws-sdk/client-athena";
import {setTimeout} from "timers/promises";
import {convertAthenaResultsToListOfRecords} from "./utils/ConvertAthenaResultToListOfRecords";

const POWERTOOLS_METRICS_NAMESPACE = process.env.POWERTOOLS_METRICS_NAMESPACE ?? Constants.BAV_METRICS_NAMESPACE;
const POWERTOOLS_LOG_LEVEL = process.env.POWERTOOLS_LOG_LEVEL ?? Constants.DEBUG;
const POWERTOOLS_SERVICE_NAME = process.env.POWERTOOLS_SERVICE_NAME ?? Constants.DEQUEUE_LOGGER_SVC_NAME;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

export const athenaClient = new AthenaClient({region: process.env.REGION});

class AthenaQueryHandler implements LambdaInterface {

	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })
	async handler(event: APIGatewayProxyEvent, context: any): Promise<APIGatewayProxyResult> {

		logger.setPersistentLogAttributes({});
		logger.addContext(context);
		logger.info("Starting AthenaQueryHandler");

		if (!event.queryStringParameters) {
			logger.error("Missing Query String Parameters");
			return {
				statusCode: 500,
				body: "ERROR",
			};
		}

		const sqlString = "SELECT itemnumber FROM \"" + (process.env["GLUE_TABLE"] ?? "") + "\" WHERE timestamp >= ? AND cicname LIKE ? ORDER BY timestamp DESC";
		const queryExecutionInput : StartQueryExecutionInput = {
			QueryString: sqlString,
			QueryExecutionContext: {
				Database: process.env["GLUE_DATABASE"],
				Catalog: 'AwsDataCatalog',
			},
			ExecutionParameters: [
				event.queryStringParameters['min-timestamp'] ?? "1",
				event.queryStringParameters['name-prefix'] + "%" ?? "%",
			],
			WorkGroup: process.env["ATHENA_WORKGROUP"],
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
			const getQueryResultsInput : GetQueryResultsInput = {
				QueryExecutionId: startQueryExecutionCommandOutput.QueryExecutionId,
				MaxResults: 1000,
			};

			const getQueryResultsCommand = new GetQueryResultsCommand(getQueryResultsInput);
			const getQueryResultsCommandOutput = await athenaClient.send(getQueryResultsCommand);
			logger.info("GetQueryResultsCommandOutput : ", {output: getQueryResultsCommandOutput.ResultSet?.Rows});
			const rowsReturned = getQueryResultsCommandOutput.ResultSet?.Rows ?? [];

			return {
				statusCode: 200,
				body: JSON.stringify(convertAthenaResultsToListOfRecords(rowsReturned)),
			};

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

		logger.error("Unknown query state - exiting", { queryState });
		return {
			statusCode: 500,
			body: "ERROR",
		};
	}
}

const handlerClass = new AthenaQueryHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
