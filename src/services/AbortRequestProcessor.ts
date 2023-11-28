import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { BavService } from "./BavService";
import { AuthSessionState } from "../models/enums/AuthSessionState";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { TxmaEventNames } from "../models/enums/TxmaEvents";
import { EnvironmentVariables } from "../utils/Constants";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { Response } from "../utils/Response";
import { buildCoreEventFields } from "../utils/TxmaEvent";

export class AbortRequestProcessor {
  private static instance: AbortRequestProcessor;

  private readonly logger: Logger;

	private readonly issuer: string;

	private readonly txmaQueueUrl: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  constructor(logger: Logger, metrics: Metrics) {
  	this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, logger);
  	this.txmaQueueUrl = checkEnvironmentVariable(EnvironmentVariables.TXMA_QUEUE_URL, logger);
  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, logger);

  	this.logger = logger;
  	this.metrics = metrics;
  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
  }

  static getInstance(logger: Logger, metrics: Metrics): AbortRequestProcessor {
  	if (!AbortRequestProcessor.instance) {
  		AbortRequestProcessor.instance = new AbortRequestProcessor(logger, metrics);
  	}
  	return AbortRequestProcessor.instance;
  }

  async processRequest(sessionId: string): Promise<Response> {
  	const session = await this.BavService.getSessionById(sessionId);

  	if (!session) {
  		this.logger.error("No session found for session id", {
  			messageCode: MessageCodes.SESSION_NOT_FOUND,
  		});
  		return new Response(HttpCodesEnum.UNAUTHORIZED, `No session found with the session id: ${sessionId}`);
  	}

  	this.logger.appendKeys({
  		govuk_signin_journey_id: session?.clientSessionId,
  	});

  	const decodedRedirectUri = decodeURIComponent(session.redirectUri);
  	const hasQuestionMark = decodedRedirectUri.includes("?");
  	const redirectUri = `${decodedRedirectUri}${hasQuestionMark ? "&" : "?"}error=access_denied&state=${session.state}`;

  	if (session.authSessionState === AuthSessionState.BAV_SESSION_ABORTED) {
  		this.logger.info("Session has already been aborted");
  		return new Response(HttpCodesEnum.OK, "Session has already been aborted", { Location: encodeURIComponent(redirectUri) });
  	}

  	await this.BavService.updateSessionAuthState(session.sessionId, AuthSessionState.BAV_SESSION_ABORTED);

  	await this.BavService.sendToTXMA(
  		this.txmaQueueUrl, {
  			event_name: TxmaEventNames.BAV_CRI_SESSION_ABORTED,
  			...buildCoreEventFields(session, this.issuer, session.clientIpAddress, absoluteTimeNow),
  		});

  	return new Response(HttpCodesEnum.OK, "Session has been aborted", { Location: encodeURIComponent(redirectUri) });
  }
}
