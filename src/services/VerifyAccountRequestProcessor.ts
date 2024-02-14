/* eslint-disable max-lines-per-function */
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { randomUUID } from "crypto";
import { BavService } from "./BavService";
import { HmrcService } from "./HmrcService";
import { CopCheckResults } from "../models/enums/Hmrc";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { TxmaEventNames } from "../models/enums/TxmaEvents";
import { HmrcVerifyResponse, PartialNameSQSRecord } from "../models/IHmrcResponse";
import { PersonIdentityItem } from "../models/PersonIdentityItem";
import { CopCheckResult, ISessionItem } from "../models/ISessionItem";
import { EnvironmentVariables, Constants } from "../utils/Constants";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { getFullName } from "../utils/PersonIdentityUtils";
import { Response } from "../utils/Response";
import { buildCoreEventFields } from "../utils/TxmaEvent";
import { VerifyAccountPayload } from "../type/VerifyAccountPayload";
import { absoluteTimeNow } from "../utils/DateTimeUtils";

export class VerifyAccountRequestProcessor {
  private static instance: VerifyAccountRequestProcessor;

  private readonly logger: Logger;

  private readonly txmaQueueUrl: string;

  private readonly issuer: string;

  private readonly personIdentityTableName: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  private readonly HmrcService: HmrcService;

  private readonly hmrcToken: string;

	private readonly partialNameQueueUrl: string;

	constructor(logger: Logger, metrics: Metrics, HMRC_TOKEN: string) {
  	this.logger = logger;
  	this.metrics = metrics;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);
	  this.txmaQueueUrl = checkEnvironmentVariable(EnvironmentVariables.TXMA_QUEUE_URL, this.logger);
	  this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, this.logger);
  	this.personIdentityTableName = checkEnvironmentVariable(EnvironmentVariables.PERSON_IDENTITY_TABLE_NAME, this.logger);
		this.partialNameQueueUrl = checkEnvironmentVariable(EnvironmentVariables.PARTIAL_MATCHES_QEUEUE_URL, logger);
  	this.hmrcToken = HMRC_TOKEN;

  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, this.logger);
  	const hmrcBaseUrl = checkEnvironmentVariable(EnvironmentVariables.HMRC_BASE_URL, this.logger);
  	const maxRetries = +checkEnvironmentVariable(EnvironmentVariables.HMRC_MAX_RETRIES, logger);
  	const hmrcBackoffPeriodMs = +checkEnvironmentVariable(EnvironmentVariables.HMRC_TOKEN_BACKOFF_PERIOD_MS, logger);

  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
  	this.HmrcService = HmrcService.getInstance(this.logger, hmrcBaseUrl, hmrcBackoffPeriodMs, maxRetries);
	}

	static getInstance(logger: Logger, metrics: Metrics, HMRC_TOKEN: string): VerifyAccountRequestProcessor {
  	if (!VerifyAccountRequestProcessor.instance) {
  		VerifyAccountRequestProcessor.instance = new VerifyAccountRequestProcessor(logger, metrics, HMRC_TOKEN);
  	}
  	return VerifyAccountRequestProcessor.instance;
	}

	// eslint-disable-next-line max-lines-per-function, complexity
	async processRequest(sessionId: string, body: VerifyAccountPayload, clientIpAddress: string): Promise<Response> {
  	const { account_number: accountNumber, sort_code: sortCode } = body;
  	const paddedAccountNumber = accountNumber.padStart(8, "0");
  	const person: PersonIdentityItem | undefined = await this.BavService.getPersonIdentityById(sessionId, this.personIdentityTableName);
  	const session: ISessionItem | undefined = await this.BavService.getSessionById(sessionId);

  	if (!person) {
  		this.logger.error("No person found for session id", { messageCode: MessageCodes.PERSON_NOT_FOUND });
  		return new Response(HttpCodesEnum.UNAUTHORIZED, `No person found with the session id: ${sessionId}`);
  	}

  	if (!session) {
  		this.logger.error("No session found for session id", { messageCode: MessageCodes.SESSION_NOT_FOUND });
  		return new Response(HttpCodesEnum.UNAUTHORIZED, `No session found with the session id: ${sessionId}`);
  	}

  	if (session.retryCount && session.retryCount >= Constants.MAX_RETRIES) {
  		this.logger.error(`Session retry count is ${session.retryCount}, cannot have another attempt`, { messageCode: MessageCodes.TOO_MANY_RETRIES });
  		return new Response(HttpCodesEnum.UNAUTHORIZED, "Too many attempts");
  	}

  	const name = getFullName(person.name);
  	this.logger.appendKeys({ govuk_signin_journey_id: session.clientSessionId });
		const timeOfRequest = absoluteTimeNow();

  	let { hmrcUuid } = session;
  	if (!hmrcUuid) {
  		hmrcUuid = randomUUID();
  		await this.BavService.saveHmrcUuid(sessionId, hmrcUuid);
  	}

  	const coreEventFields = buildCoreEventFields(session, this.issuer, clientIpAddress);
  	await this.BavService.sendToTXMA(
  		this.txmaQueueUrl,
  		{
  			event_name: TxmaEventNames.BAV_COP_REQUEST_SENT,
  			...coreEventFields,
  			extensions:{
  				evidence:[
						 {
  						txn: hmrcUuid,
  					},
  				],
			 },
			 restricted:{
  				"CoP_request_details": [
					 {
  						name,
  						sortCode,
  						accountNumber: paddedAccountNumber,
  						attemptNum: session.retryCount || 1,
					 },
  				],
		 		},
  		},
  	);

  	const verifyResponse = await this.HmrcService.verify(
  		{ accountNumber: paddedAccountNumber, sortCode, name, uuid: hmrcUuid },
  		this.hmrcToken,
  	);

  	if (!verifyResponse) {
  		this.logger.error("No verify reponse recieved", { messageCode: MessageCodes.NO_VERIFY_RESPONSE });
  		return new Response(HttpCodesEnum.SERVER_ERROR, "Could not verify account");
  	}

  	await this.BavService.sendToTXMA(
  		this.txmaQueueUrl,
  		{
  			event_name: TxmaEventNames.BAV_COP_RESPONSE_RECEIVED,
  			...coreEventFields,
  			extensions:{
  				evidence:[
						 {
  						txn: hmrcUuid,
  					},
  				],
			  },
  		},
  	);

  	await this.BavService.updateAccountDetails(
  		{ sessionId, accountNumber: paddedAccountNumber, sortCode },
  		this.personIdentityTableName,
  	);

  	const copCheckResult = this.calculateCopCheckResult(verifyResponse);
  	this.logger.debug(`copCheckResult is ${copCheckResult}`);

  	if (copCheckResult === CopCheckResults.MATCH_ERROR) {
  		this.logger.warn("Error received in COP verify response");
  		return new Response(HttpCodesEnum.SERVER_ERROR, "Error received in COP verify response");
  	}

  	let retryCount;
  	if (copCheckResult !== CopCheckResults.FULL_MATCH) {
  		retryCount = session.retryCount ? session.retryCount + 1 : 1;
  	}
  	await this.BavService.saveCopCheckResult(sessionId, copCheckResult, retryCount);

		if (copCheckResult === CopCheckResults.PARTIAL_MATCH) {
			const partialNameRecord: PartialNameSQSRecord = {
				itemNumber: hmrcUuid,
				timeStamp: timeOfRequest,
				cicName: name,
				accountName: verifyResponse.accountName,
				accountExists: verifyResponse.accountExists,
				nameMatches: verifyResponse.nameMatches,
			};
			
			await this.BavService.savePartialNameInfo(this.partialNameQueueUrl, partialNameRecord);
		}

  	return new Response(HttpCodesEnum.OK, JSON.stringify({
  		message: "Success",
  		retryCount,
  	}));
	}

	calculateCopCheckResult(verifyResponse: HmrcVerifyResponse): CopCheckResult {
  	if (verifyResponse.nameMatches ===  "yes" && verifyResponse.accountExists === "yes") {
  		return CopCheckResults.FULL_MATCH;
  	} else if (verifyResponse.nameMatches ===  "partial" && verifyResponse.accountExists === "yes") {
  		return CopCheckResults.PARTIAL_MATCH;
  	} else if (verifyResponse.nameMatches ===  "error" || verifyResponse.accountExists === "error") {
  		return CopCheckResults.MATCH_ERROR;
  	} else {
  		return CopCheckResults.NO_MATCH;
  	}
	}
}
