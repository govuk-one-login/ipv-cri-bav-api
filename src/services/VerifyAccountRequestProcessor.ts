import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { BavService } from "./BavService";
import { HmrcService } from "./HmrcService";
import { CopCheckResults } from "../models/enums/Hmrc";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { HmrcVerifyResponse } from "../models/IHmrcResponse";
import { PersonIdentityItem } from "../models/PersonIdentityItem";
import { CopCheckResult, ISessionItem } from "../models/ISessionItem";
import { EnvironmentVariables, Constants } from "../utils/Constants";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { getFullName } from "../utils/PersonIdentityUtils";
import { Response } from "../utils/Response";
import { VerifyAccountPayload } from "../type/VerifyAccountPayload";

export class VerifyAccountRequestProcessor {
  private static instance: VerifyAccountRequestProcessor;

  private readonly logger: Logger;

	private readonly personIdentityTableName: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;
	
  private readonly HmrcService: HmrcService;

	private readonly hmrcToken: string;

	constructor(logger: Logger, metrics: Metrics, HMRC_TOKEN: string) {
  	this.logger = logger;
  	this.metrics = metrics;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);
  	this.personIdentityTableName = checkEnvironmentVariable(EnvironmentVariables.PERSON_IDENTITY_TABLE_NAME, this.logger);
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

	// TODO
	// eslint-disable-next-line max-lines-per-function
	async processRequest(sessionId: string, body: VerifyAccountPayload): Promise<Response> {
  	const { account_number: accountNumber, sort_code: sortCode } = body;
  	const paddedAccountNumber = accountNumber.padStart(8, "0");
  	const person: PersonIdentityItem | undefined = await this.BavService.getPersonIdentityById(sessionId, this.personIdentityTableName);
		const session: ISessionItem | undefined = await this.BavService.getSessionById(sessionId);

  	if (!person) {
  		this.logger.error("No person found for session id", {
  			messageCode: MessageCodes.PERSON_NOT_FOUND,
  		});
  		return new Response(HttpCodesEnum.UNAUTHORIZED, `No person found with the session id: ${sessionId}`);
  	}

  	if (!session) {
  		this.logger.error("No session found for session id", {
  			messageCode: MessageCodes.SESSION_NOT_FOUND,
  		});
  		return new Response(HttpCodesEnum.UNAUTHORIZED, `No session found with the session id: ${sessionId}`);
  	}

		if (session.retryCount && session.retryCount >= Constants.MAX_RETRIES) {
			this.logger.error(`Session retry count is ${session.retryCount}, cannot have another attempt`, { messageCode: MessageCodes.TOO_MANY_RETRIES });
			return new Response(HttpCodesEnum.UNAUTHORIZED, "Too many attempts");
		}

		this.logger.appendKeys({ govuk_signin_journey_id: session.clientSessionId });

  	await this.BavService.updateAccountDetails(sessionId, paddedAccountNumber, sortCode, this.personIdentityTableName);

  	const name = getFullName(person.name);
  	const verifyResponse = await this.HmrcService.verify({ accountNumber: paddedAccountNumber, sortCode, name }, this.hmrcToken);

		if (!verifyResponse) {
			this.logger.error("No verify reponse recieved", { messageCode: MessageCodes.NO_VERIFY_RESPONSE });
			return new Response(HttpCodesEnum.SERVER_ERROR, "Could not verify account");
		}

  	const copCheckResult = this.calculateCopCheckResult(verifyResponse);
  	this.logger.debug(`copCheckResult is ${copCheckResult}`);

		let retryCount;
		if (copCheckResult !== CopCheckResults.FULL_MATCH) {
			retryCount = session.retryCount || session.retryCount === 0 ? session.retryCount + 1 : 0;
		}
  	await this.BavService.saveCopCheckResult(sessionId, copCheckResult, retryCount);

		if (retryCount && retryCount === Constants.MAX_RETRIES) {
			this.logger.warn("User has failed second verification attempt");
			return new Response(HttpCodesEnum.SERVER_ERROR, "Fail");
		}

		const successResponse = {
			message: "Success",
			retryCount,
		};
  	return new Response(HttpCodesEnum.OK, JSON.stringify(successResponse));
	}

	calculateCopCheckResult(verifyResponse: HmrcVerifyResponse): CopCheckResult {
  	if (verifyResponse.nameMatches ===  "yes" && verifyResponse.accountExists === "yes") {
  		return CopCheckResults.FULL_MATCH;
  	} else if (verifyResponse.nameMatches ===  "partial" && verifyResponse.accountExists === "yes") {
  		return CopCheckResults.PARTIAL_MATCH;
  	} else {
  		return CopCheckResults.NO_MATCH;
  	}
	}
}
