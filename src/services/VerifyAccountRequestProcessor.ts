 
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
import { CopCheckResult, ExperianCheckResult, ISessionItem } from "../models/ISessionItem";
import { EnvironmentVariables, Constants } from "../utils/Constants";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { getFirstName, getLastName, getFullName } from "../utils/PersonIdentityUtils";
import { Response } from "../utils/Response";
import { buildCoreEventFields } from "../utils/TxmaEvent";
import { VerifyAccountPayload } from "../type/VerifyAccountPayload";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { APIGatewayProxyResult } from "aws-lambda";
import { ExperianService } from "./ExperianService";
import { ExperianCheckResults } from "../models/enums/Experian";
import { ExperianVerifyResponse } from "../models/IVeriCredential";
import { getClientConfig } from "../utils/ClientConfig";
import { mockCI } from "../tests/contract/mocks/VerifiableCredential";

export class VerifyAccountRequestProcessor {
  private static instance: VerifyAccountRequestProcessor;

  private readonly logger: Logger;

  private readonly txmaQueueUrl: string;

  private readonly issuer: string;

  private readonly personIdentityTableName: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  private readonly HmrcService: HmrcService;

  readonly credentialVendor: string;

  private readonly partialNameQueueUrl: string;

  private readonly ExperianService: ExperianService;
  
  private readonly clientConfig: string;

  constructor(logger: Logger, metrics: Metrics, CREDENTIAL_VENDOR: string) {
  	this.logger = logger;
  	this.metrics = metrics;
  	this.credentialVendor = CREDENTIAL_VENDOR;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);

  	this.txmaQueueUrl = checkEnvironmentVariable(EnvironmentVariables.TXMA_QUEUE_URL, this.logger);
  	this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, this.logger);
  	this.personIdentityTableName = checkEnvironmentVariable(EnvironmentVariables.PERSON_IDENTITY_TABLE_NAME, this.logger);
  	this.partialNameQueueUrl = checkEnvironmentVariable(EnvironmentVariables.PARTIAL_MATCHES_QEUEUE_URL, logger);
  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, this.logger);
  	const hmrcBaseUrl = checkEnvironmentVariable(EnvironmentVariables.HMRC_BASE_URL, this.logger);
  	const maxRetries = +checkEnvironmentVariable(EnvironmentVariables.HMRC_MAX_RETRIES, logger);
  	const hmrcBackoffPeriodMs = +checkEnvironmentVariable(EnvironmentVariables.HMRC_TOKEN_BACKOFF_PERIOD_MS, logger);
  	const experianTokenTableName: string = checkEnvironmentVariable(EnvironmentVariables.EXPERIAN_TOKEN_TABLE, this.logger);
  	const experianMaxRetries = +checkEnvironmentVariable(EnvironmentVariables.EXPERIAN_MAX_RETRIES, logger);
  	this.clientConfig = checkEnvironmentVariable(EnvironmentVariables.CLIENT_CONFIG, logger);

  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
  	this.HmrcService = HmrcService.getInstance(this.logger, hmrcBaseUrl, hmrcBackoffPeriodMs, maxRetries);
  	this.ExperianService = ExperianService.getInstance(this.logger, this.metrics, experianMaxRetries, createDynamoDbClient(), experianTokenTableName);
  }

  static getInstance(logger: Logger, metrics: Metrics, CREDENTIAL_VENDOR: string): VerifyAccountRequestProcessor {
  	if (!VerifyAccountRequestProcessor.instance || (VerifyAccountRequestProcessor.instance && VerifyAccountRequestProcessor.instance.credentialVendor !== CREDENTIAL_VENDOR)) {
  		VerifyAccountRequestProcessor.instance = new VerifyAccountRequestProcessor(logger, metrics, CREDENTIAL_VENDOR);
  	}
  	return VerifyAccountRequestProcessor.instance;
  }

  async processExperianRequest(
  	sessionId: string, 
  	verifyAccountPayload: any, 
  	clientIpAddress: string, 
  	encodedHeader: string,
  	ssmParams: {
  	experianUsername: string;
  	experianPassword: string;
  	experianClientId: string;
  	experianClientSecret: string;
  	},
  ): Promise<APIGatewayProxyResult> {
  	const session: ISessionItem | undefined = await this.BavService.getSessionById(sessionId);	
  	if (!session) {
  		this.logger.error("No session found for session id", { messageCode: MessageCodes.SESSION_NOT_FOUND });
  		return Response(HttpCodesEnum.UNAUTHORIZED, `No session found with the session id: ${sessionId}`);
  	}

  	const person: PersonIdentityItem | undefined = await this.BavService.getPersonIdentityById(sessionId, this.personIdentityTableName);
  	if (!person) {
  		this.logger.error("No person found for session id", { messageCode: MessageCodes.PERSON_NOT_FOUND });
  		return Response(HttpCodesEnum.UNAUTHORIZED, `No person found with the session id: ${sessionId}`);
  	}

  	const userClientConfig = getClientConfig(this.clientConfig, session.clientId, this.logger);
  	if (!userClientConfig) {
  		this.logger.error("Unrecognised client in request", { messageCode: MessageCodes.UNRECOGNISED_CLIENT });
  		return Response(HttpCodesEnum.UNAUTHORIZED, `Unrecognised client in request: ${session.clientId}`);
  	}
	
		  if (session.attemptCount && session.attemptCount >= Constants.MAX_VERIFY_ATTEMPTS) {
			  this.logger.error(`Session attempt count is ${session.attemptCount}, cannot have another attempt`, { messageCode: MessageCodes.TOO_MANY_RETRIES });
			  return Response(HttpCodesEnum.UNAUTHORIZED, "Too many attempts");
		  }
	
		  const firstName = getFirstName(person.name);
		  const surname = getLastName(person.name);
		  const birthDate = person.birthDate[0].value;

		  this.logger.appendKeys({ govuk_signin_journey_id: session.clientSessionId });

		  const vendorUuid = await this.updateVendorUuid(session);
	
		  const coreEventFields = buildCoreEventFields(session, this.issuer, clientIpAddress);
		
		  const verifyResponse = await this.ExperianService.verify(
			  { verifyAccountPayload, firstName, surname, birthDate, uuid: vendorUuid },
			  ssmParams.experianUsername,
			  ssmParams.experianPassword,
			  ssmParams.experianClientId,
			  ssmParams.experianClientSecret,
			  userClientConfig.experianVerifyEndpoint,
			  userClientConfig.experianTokenEndpoint,
		  );

		  const verifyResponsePresent = verifyResponse?.expRequestId && (verifyResponse?.personalDetailsScore || verifyResponse?.warningsErrors);
		
		  if (!verifyResponsePresent) {
			  this.logger.error("No verify response received", { messageCode: MessageCodes.NO_VERIFY_RESPONSE });
			  return Response(HttpCodesEnum.SERVER_ERROR, "Could not verify account");
		  }

		  await this.BavService.sendToTXMA(this.txmaQueueUrl, {
  		event_name: TxmaEventNames.BAV_EXPERIAN_REQUEST_SENT,
  		...coreEventFields,
  		extensions: {
  			evidence: [
  				{
  					txn: verifyResponse?.expRequestId,
  					attemptNum: session.attemptCount ?? 1,
  				},
  			],
  		},
  		restricted: {
  			name:[
  				{
  					nameParts:[
  						{
  							type:"GivenName",
  							value: firstName,
  						},
  						{
  							type:"FamilyName",
  							value: surname,
  						},
  					],
  				},
  			],
  			birthDate: person.birthDate,
  			bankAccount: [{
  				sortCode: verifyAccountPayload?.sort_code,
  				accountNumber: verifyAccountPayload?.account_number,
  			}],
  		},
  	}, encodedHeader);

		
		  await this.BavService.sendToTXMA(this.txmaQueueUrl, {
			  event_name: TxmaEventNames.BAV_EXPERIAN_RESPONSE_RECEIVED,
			  ...coreEventFields,
			  extensions: {
				  evidence: [
					  {
						  txn: verifyResponse?.expRequestId,
					  },
				  ],
			  },
		  }, encodedHeader);
		
		  await this.BavService.updateAccountDetails(
			  { sessionId, accountNumber: verifyAccountPayload?.account_number?.padStart(8, "0"), sortCode: verifyAccountPayload?.sort_code },
			  this.personIdentityTableName,
		  );
		  
		  const experianCheckResult = this.calculateExperianCheckResult(verifyResponse, session.attemptCount);
		  const cis = this.calculateCIs(verifyResponse);

		  this.logger.info(`experianCheckResult is ${experianCheckResult}`);
		  this.logger.info(`CIs generated: ${cis}`);

		  this.logCis(cis, this.metrics); 

		  let attemptCount;
		  if (experianCheckResult !== ExperianCheckResults.FULL_MATCH || !experianCheckResult) {
  		if (session.attemptCount) {
  			attemptCount = session.attemptCount + 1;
  		} else {
  			attemptCount = 1;
  		}
  		this.metrics.addMetric("retry-attempt-" + attemptCount, MetricUnits.Count, 1);
		  }

		  await this.BavService.saveExperianCheckResult(sessionId, verifyResponse, experianCheckResult, attemptCount, cis);
		  return Response(HttpCodesEnum.OK, JSON.stringify({
			  message: "Success",
			  attemptCount,
		  }));
	  }

  private logCis(cis: string[] | undefined, metrics: Metrics): void {
  	if (cis) {
  		cis.forEach(function (ci): void {
  			metrics.addMetric("ci-" + ci, MetricUnits.Count, 1);
  		});
  	}
  }

   
  async processHmrcRequest(sessionId: string, body: VerifyAccountPayload, clientIpAddress: string, encodedHeader: string, HMRC_TOKEN: string): Promise<APIGatewayProxyResult> {
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

  	const vendorUuid = await this.updateVendorUuid(session);

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
  		HMRC_TOKEN,
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

  calculateExperianCheckResult(verifyResponse: ExperianVerifyResponse, attemptCount?: number): ExperianCheckResult {
  	const personalDetailsScore = verifyResponse?.personalDetailsScore;
  	if (verifyResponse?.outcome === "STOP" && attemptCount === undefined) {
  		return undefined;
  	}
  	if (personalDetailsScore !== 9 && attemptCount === undefined) {
  		return undefined;
  	}
  	if (personalDetailsScore === 9 && !this.isCriticalResponseCode(verifyResponse, this.metrics) && verifyResponse?.outcome !== "STOP") {
  		return ExperianCheckResults.FULL_MATCH;
  	}

  	return ExperianCheckResults.NO_MATCH;
  }

  calculateCIs(verifyResponse: ExperianVerifyResponse): string[] | undefined {
  	let cisRequired: string[] = [];
  	const ci = process.env.USE_MOCKED === "true" ? mockCI[0] : "D15";

  	const criticalErrors = ["6", "7", "11", "12"];
  	const warningError  = verifyResponse?.warningsErrors;
  	if (warningError) {
  		warningError.forEach(function (value): void {
  			if (value?.responseType === "error") {
  				if (criticalErrors.includes(value.responseCode)) {
  					cisRequired.push(ci);
  				}
  			}
  		}); 
  	}

  	if (verifyResponse.outcome === "STOP") {
  		cisRequired.push(ci);
  	}
	
  	cisRequired = [...new Set(cisRequired)];
  	return cisRequired.length === 0 ? undefined : cisRequired;
  }

  isCriticalResponseCode(verifyResponse: ExperianVerifyResponse, metrics: Metrics): boolean {
  	const criticalWarnings = ["2", "3"];
  	const criticalErrors = ["6", "7", "11", "12"];
  	const warningError  = verifyResponse?.warningsErrors;
  	let isCriticalResponse = false;
  	const logger = this.logger;
  	if (warningError) {
	  warningError.forEach(function (value): void {
		  if (value?.responseType === "warning") {
			  if (criticalWarnings.includes(value.responseCode)) {
				  metrics.addMetric("critical-experian-response-code" + value.responseCode, MetricUnits.Count, 1);
				  isCriticalResponse = true;
			  }
		  }
		  if (value?.responseType === "error") {
			  if (criticalErrors.includes(value.responseCode)) {
  					metrics.addMetric("critical-experian-response-code" + value.responseCode, MetricUnits.Count, 1);
  					isCriticalResponse = true;
  				}
		  }
		  if (value.responseType === undefined || value.responseType === "") {
  				logger.info("Captured empty response type in warning and errors array ");
		  }
  		}); 
  	}
  	return isCriticalResponse;
  }

  async updateVendorUuid(session: ISessionItem): Promise<string> {
  	let { vendorUuid } = session;
		  if (!vendorUuid) {
  		vendorUuid = randomUUID();
			  await this.BavService.saveVendorUuid(session.sessionId, vendorUuid);
		  }
  	return vendorUuid;
  }
}
