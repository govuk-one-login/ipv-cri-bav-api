import { Context, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Constants, EnvironmentVariables } from "./utils/Constants";
import { failEntireBatch, passEntireBatch } from "./utils/SqsBatchResponseHelper";
import { PutObjectCommand, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import { checkEnvironmentVariable } from "./utils/EnvironmentVariables";
import { absoluteTimeNow } from "./utils/DateTimeUtils";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.PARTIAL_NAME_MATCH_HANDLER } = process.env;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

export let s3Client: S3Client;

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

		const partialMatchesBucketName = checkEnvironmentVariable(EnvironmentVariables.PARTIAL_MATCHES_BUCKET, logger);
		const partialMatchesBucketKey = checkEnvironmentVariable(EnvironmentVariables.PARTIAL_MATCHES_BUCKET_KEY, logger);
		logger.debug("Starting to process records");

		let successfulRecords = 0;
		let failedRecords = 0;

		for (const record of event.Records) {
			try {
				const body = JSON.parse(record.body);
				logger.debug("Parsed SQS event body");

				const uploadParams = {
					Bucket: partialMatchesBucketName,
					Key: `${absoluteTimeNow()}-${record.messageId}.json`, // Using record.messageId to avoid overwriting files
					Body: JSON.stringify(body),
					ContentType: "application/json",
					ServerSideEncryption: "aws:kms",
					SSEKMSKeyId: partialMatchesBucketKey,
				};

				try {
					await s3Client.send(new PutObjectCommand(uploadParams));
					successfulRecords++;
				} catch (err) {
					logger.error({ message: "Error writing partialMatch to S3 bucket: " + err });
					failedRecords++;
				}
			} catch (error) {
				logger.error({ message: "Error processing record: " + error });
				failedRecords++;
			}
		}

		if (failedRecords > 0) {
			logger.warn(`Processed with errors. Successful: ${successfulRecords}, Failed: ${failedRecords}`);
			return failEntireBatch;
		} else {
			logger.info(`All records processed successfully. Count: ${successfulRecords}`);
			return passEntireBatch;
		}

	}

}

const handlerClass = new PartialNameMatchHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);

