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
import { APIGatewayProxyResult } from "aws-lambda";

export class VerifyAccountRequestProcessorHmrc {
  private static instance: VerifyAccountRequestProcessorHmrc;

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

	static getInstance(logger: Logger, metrics: Metrics, HMRC_TOKEN: string): VerifyAccountRequestProcessorHmrc {
  	if (!VerifyAccountRequestProcessorHmrc.instance) {
  		VerifyAccountRequestProcessorHmrc.instance = new VerifyAccountRequestProcessorHmrc(logger, metrics, HMRC_TOKEN);
  	}
  	return VerifyAccountRequestProcessorHmrc.instance;
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

  	const name = getFullName(person.name);
  	this.logger.appendKeys({ govuk_signin_journey_id: session.clientSessionId });
		const timeOfRequest = absoluteTimeNow();

  	let { vendorUuid } = session;
  	if (!vendorUuid) {
  		vendorUuid = randomUUID();
  		await this.BavService.saveVendorUuid(sessionId, vendorUuid);
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
  						txn: vendorUuid,
  					},
  				],
			 },
			 restricted:{
  				"CoP_request_details": [
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

  	const verifyResponse = await this.HmrcService.verify(
  		{ accountNumber: paddedAccountNumber, sortCode, name, uuid: vendorUuid },
  		this.hmrcToken,
  	);

  	if (!verifyResponse) {
  		this.logger.error("No verify reponse recieved", { messageCode: MessageCodes.NO_VERIFY_RESPONSE });
  		return Response(HttpCodesEnum.SERVER_ERROR, "Could not verify account");
  	}

  	await this.BavService.sendToTXMA(
  		this.txmaQueueUrl,
  		{
  			event_name: TxmaEventNames.BAV_COP_RESPONSE_RECEIVED,
  			...coreEventFields,
  			extensions:{
  				evidence:[
						 {
  						txn: vendorUuid,
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

  	const copCheckResult = this.calculateCopCheckResult(verifyResponse);
  	this.logger.debug(`copCheckResult is ${copCheckResult}`);

  	if (copCheckResult === CopCheckResults.MATCH_ERROR) {
  		this.logger.warn("Error received in COP verify response");
  		return Response(HttpCodesEnum.SERVER_ERROR, "Error received in COP verify response");
  	}

  	let attemptCount;
  	// If there is a full match attemptCount will be undefined because it doesn't matter
  	if (copCheckResult !== CopCheckResults.FULL_MATCH) {
  		attemptCount = session.attemptCount ? session.attemptCount + 1 : 1;
  	}
  	await this.BavService.saveCopCheckResult(sessionId, copCheckResult, attemptCount);

		if (copCheckResult === CopCheckResults.PARTIAL_MATCH) {
			const partialNameRecord: PartialNameSQSRecord = {
				itemNumber: vendorUuid,
				timeStamp: timeOfRequest,
				cicName: name,
				accountName: verifyResponse.accountName,
				accountExists: verifyResponse.accountExists,
				nameMatches: verifyResponse.nameMatches,
				sortCodeBankName: verifyResponse.sortCodeBankName,
			};
			
			await this.BavService.savePartialNameInfo(this.partialNameQueueUrl, partialNameRecord);
		}

  	return Response(HttpCodesEnum.OK, JSON.stringify({
  		message: "Success",
  		attemptCount,
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
