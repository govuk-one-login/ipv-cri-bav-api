/* eslint-disable max-lines-per-function */
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { randomUUID } from "crypto";
import { BavService } from "./BavService";
import { ExperianService } from "./ExperianService";
import { ExperianCheckResults } from "../models/enums/Experian";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { TxmaEventNames } from "../models/enums/TxmaEvents";
import { ExperianVerifyResponse, ExperianHCResponse } from "../models/IExperianResponse";
import { PersonIdentityItem } from "../models/PersonIdentityItem";
import { ISessionItem, ExperianCheckResult} from "../models/ISessionItem";
import { EnvironmentVariables, Constants } from "../utils/Constants";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { getFullName } from "../utils/PersonIdentityUtils";
import { Response } from "../utils/Response";
import { buildCoreEventFields } from "../utils/TxmaEvent";
import { VerifyAccountPayload } from "../type/VerifyAccountPayload";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { APIGatewayProxyResult } from "aws-lambda";

export class VerifyAccountRequestProcessor {
  private static instance: VerifyAccountRequestProcessor;

  private readonly logger: Logger;

  private readonly txmaQueueUrl: string;

  private readonly issuer: string;

  private readonly personIdentityTableName: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  private readonly ExperianService: ExperianService;

  private readonly experianToken: string;

	private readonly partialNameQueueUrl: string;

	constructor(logger: Logger, metrics: Metrics, EXPERIAN_TOKEN: string) {
  	this.logger = logger;
  	this.metrics = metrics;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);
	console.log("pig")
	  this.txmaQueueUrl = checkEnvironmentVariable(EnvironmentVariables.TXMA_QUEUE_URL, this.logger);
	  console.log("dog")
	  this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, this.logger);
	  console.log("cat")
  	this.personIdentityTableName = checkEnvironmentVariable(EnvironmentVariables.PERSON_IDENTITY_TABLE_NAME, this.logger);
	  console.log("hamster")
		this.partialNameQueueUrl = checkEnvironmentVariable(EnvironmentVariables.PARTIAL_MATCHES_QEUEUE_URL, logger);
		console.log("horse")
  	this.experianToken = EXPERIAN_TOKEN;
	  console.log("pisheepg")
  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, this.logger);
	  console.log("sheep")
  	const experianBaseUrl = checkEnvironmentVariable(EnvironmentVariables.EXPERIAN_BASE_URL, this.logger);
	  console.log("lion")
  	const maxRetries = +checkEnvironmentVariable(EnvironmentVariables.EXPERIAN_MAX_RETRIES, logger);
	  console.log("tiger")
  	const experianBackoffPeriodMs = +checkEnvironmentVariable(EnvironmentVariables.EXPERIAN_TOKEN_BACKOFF_PERIOD_MS, logger);
	  console.log("pigooseg")

  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
  	this.ExperianService = ExperianService.getInstance(this.logger, experianBaseUrl, experianBackoffPeriodMs, maxRetries);
	}

	static getInstance(logger: Logger, metrics: Metrics, EXPERIAN_TOKEN: string): VerifyAccountRequestProcessor {
  	if (!VerifyAccountRequestProcessor.instance) {
  		VerifyAccountRequestProcessor.instance = new VerifyAccountRequestProcessor(logger, metrics, EXPERIAN_TOKEN);
  	}
  	return VerifyAccountRequestProcessor.instance;
	}

	// eslint-disable-next-line max-lines-per-function, complexity
	async processRequest(sessionId: string, body: VerifyAccountPayload, clientIpAddress: string, encodedHeader: string): Promise<APIGatewayProxyResult> {
  	const { account_number: accountNumber, sort_code: sortCode } = body;
  	const paddedAccountNumber = accountNumber.padStart(8, "0");
  	const person: PersonIdentityItem | undefined = await this.BavService.getPersonIdentityById(sessionId, this.personIdentityTableName);
  	const session: ISessionItem | undefined = await this.BavService.getSessionById(sessionId);
	
  	if (!person) {
  		this.logger.error("No person found for session id", { messageCode: MessageCodes.PERSON_NOT_FOUND });
  		return Response(HttpCodesEnum.UNAUTHORIZED, `No person found with the session id: ${sessionId}`);
  	}

  	if (!session) {
  		this.logger.error("No session found for session id", { messageCode: MessageCodes.SESSION_NOT_FOUND });
  		return Response(HttpCodesEnum.UNAUTHORIZED, `No session found with the session id: ${sessionId}`);
  	}

  	if (session.attemptCount && session.attemptCount >= Constants.MAX_VERIFY_ATTEMPTS) {
  		this.logger.error(`Session attempt count is ${session.attemptCount}, cannot have another attempt`, { messageCode: MessageCodes.TOO_MANY_RETRIES });
  		return Response(HttpCodesEnum.UNAUTHORIZED, "Too many attempts");
  	}
	  console.log("mach")

  	const name = getFullName(person.name);
  	this.logger.appendKeys({ govuk_signin_journey_id: session.clientSessionId });
		const timeOfRequest = absoluteTimeNow();
		console.log("poch")

  	let { experianUuid } = session;
	  console.log("floc")

  	if (!experianUuid) {
  		experianUuid = randomUUID();
  		await this.BavService.saveExperianUuid(sessionId, experianUuid);
  	}
	  console.log("twoch")

  	const coreEventFields = buildCoreEventFields(session, this.issuer, clientIpAddress);
	  console.log("frick")

  	await this.BavService.sendToTXMA(
  		this.txmaQueueUrl,
  		{
  			event_name: TxmaEventNames.BAV_EXPERIAN_REQUEST_SENT,
  			...coreEventFields,
  			extensions:{
  				evidence:[
						 {
  						txn: experianUuid,
  					},
  				],
			 },
			 restricted:{
  				"Experian_request_details": [
					 {
  						name,
  						sortCode,
  						accountNumber: paddedAccountNumber,
  						attemptNum: session.attemptCount || 1,
					 },
  				],
		 		},
  		},
			encodedHeader,
  	);
	  console.log("boing")

  	const verifyResponse = await this.ExperianService.verify(
  		{ accountNumber: paddedAccountNumber, sortCode, name, uuid: experianUuid },
  		this.experianToken,
  	);
	  console.log("flring")

  	if (!verifyResponse) {
  		this.logger.error("No verify response received", { messageCode: MessageCodes.NO_VERIFY_RESPONSE });
  		return Response(HttpCodesEnum.SERVER_ERROR, "Could not verify account");
  	}

  	await this.BavService.sendToTXMA(
  		this.txmaQueueUrl,
  		{
  			event_name: TxmaEventNames.BAV_EXPERIAN_RESPONSE_RECEIVED,
  			...coreEventFields,
  			extensions:{
  				evidence:[
						 {
  						txn: experianUuid,
  					},
  				],
			  },
  		},
			encodedHeader,
  	);

  	await this.BavService.updateAccountDetails(
  		{ sessionId, accountNumber: paddedAccountNumber, sortCode },
  		this.personIdentityTableName,
  	);

	  
  	const experianCheckResult = this.calculateExperianCheckResult(verifyResponse);
  	this.logger.debug(`experianCheckResult is ${experianCheckResult}`);
	  
  	let attemptCount
  	// If there is a full match attemptCount will be undefined because it doesn't matter
  	if (experianCheckResult !== ExperianCheckResults.FULL_MATCH) {
  		attemptCount = session.attemptCount ? session.attemptCount + 1 : 1;
  	}
  	await this.BavService.saveExperianCheckResult(sessionId, experianCheckResult, attemptCount);

  	return Response(HttpCodesEnum.OK, JSON.stringify({
  		message: "Success",
  		attemptCount,
  	}));
	}

	calculateExperianCheckResult(verifyResponse: number): ExperianCheckResult {
		if (verifyResponse === 9) {
			return ExperianCheckResults.FULL_MATCH;
		} else {
			return ExperianCheckResults.NO_MATCH;
		}
	}
}
