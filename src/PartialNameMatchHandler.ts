import { Context, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Constants, EnvironmentVariables } from "./utils/Constants";
import { failEntireBatch, passEntireBatch } from "./utils/SqsBatchResponseHelper";
import { PartialNameProcessor } from "./services/PartialNameProcessor";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import { checkEnvironmentVariable } from "./utils/EnvironmentVariables";
import { absoluteTimeNow } from "./utils/DateTimeUtils";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.PARTIAL_NAME_MATCH_HANDLER } = process.env;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

let s3Client: S3Client;

class PartialNameMatchHandler implements LambdaInterface {
	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })
	async handler(event: SQSEvent, context: Context): Promise<SQSBatchResponse> {

		if (!s3Client) {
			s3Client = new S3Client({
				region: process.env.REGION,
				maxAttempts: 2,
				requestHandler: new NodeHttpHandler({
					connectionTimeout: 29000,
					socketTimeout: 29000,
				}),
			});
		}

		// clear PersistentLogAttributes set by any previous invocation, and add lambda context for this invocation
		logger.setPersistentLogAttributes({});
		logger.addContext(context);

		if (event.Records.length === 1) {
			const partialMatchesBucketName = checkEnvironmentVariable(EnvironmentVariables.PARTIAL_MATCHES_BUCKET, logger);
			const record: SQSRecord = event.Records[0];
			logger.debug("Starting to process record");

			try {
				const body = JSON.parse(record.body);
				logger.debug("Parsed SQS event body");
				
				const uploadParams = {
					Bucket: partialMatchesBucketName,
					Key: `${absoluteTimeNow()}.json`,
					Body: JSON.stringify(body),
					ContentType: "application/json",
				};
		
				try {
					await s3Client.send(new PutObjectCommand(uploadParams));
				} catch (err) {
					logger.error({ message: "Error writing partialMatch to S3 bucket" + err });
					throw new Error("Error writing partialMatch to S3 bucket");
				}
				
				await PartialNameProcessor.getInstance(logger, metrics).processRequest(body);
				return passEntireBatch;

			} catch (error) {
				return failEntireBatch;
			}
		} else {
			logger.warn("Unexpected no of records received");
			return failEntireBatch;
		}
	}

}

const handlerClass = new PartialNameMatchHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);

