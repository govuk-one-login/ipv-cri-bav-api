import { APIGatewayProxyEvent } from "aws-lambda";
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { BavService } from "./BavService";
import { EnvironmentVariables } from "../utils/Constants";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";

export class VerifyAccountRequestProcessor {
  private static instance: VerifyAccountRequestProcessor;

  private readonly logger: Logger;

	private readonly issuer: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  private readonly kmsDecryptor: KmsJwtAdapter;

  constructor(logger: Logger, metrics: Metrics) {
  	this.logger = logger;
  	this.metrics = metrics;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);

  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, this.logger);
  	const encryptionKeyIds: string = checkEnvironmentVariable(EnvironmentVariables.ENCRYPTION_KEY_IDS, this.logger);
  	this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, this.logger);

  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
  	this.kmsDecryptor = new KmsJwtAdapter(encryptionKeyIds);
  }

  static getInstance(logger: Logger, metrics: Metrics): VerifyAccountRequestProcessor {
  	if (!VerifyAccountRequestProcessor.instance) {
  		VerifyAccountRequestProcessor.instance = new VerifyAccountRequestProcessor(logger, metrics);
  	}
  	return VerifyAccountRequestProcessor.instance;
  }

	processRequest(event: APIGatewayProxyEvent): void {
	console.log("processing request")
  }
}
