import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { randomUUID } from "crypto";
import { BavService } from "./BavService";
import { AuthSessionState } from "../models/enums/AuthSessionState";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { EnvironmentVariables } from "../utils/Constants";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { Response } from "../utils/Response";
import { APIGatewayProxyResult } from "aws-lambda";

export class AuthorizationRequestProcessor {
	private static instance: AuthorizationRequestProcessor;

	readonly logger: Logger;

	private readonly metrics: Metrics;

	private readonly BavService: BavService;

	constructor(logger: Logger, metrics: Metrics) {
  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, logger);

		this.logger = logger;
		this.metrics = metrics;
		this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
	}

	static getInstance(logger: Logger, metrics: Metrics): AuthorizationRequestProcessor {
		if (!AuthorizationRequestProcessor.instance) {
			AuthorizationRequestProcessor.instance = new AuthorizationRequestProcessor(logger, metrics);
		}
		return AuthorizationRequestProcessor.instance;
	}

	 
	async processRequest(sessionId: string): Promise<APIGatewayProxyResult> {
		const session = await this.BavService.getSessionById(sessionId);

		if (!session) {
			this.logger.error("No session found for session id", {
				messageCode: MessageCodes.SESSION_NOT_FOUND,
			});
			return Response(HttpCodesEnum.UNAUTHORIZED, `No session found with the session id: ${sessionId}`);
		}

		this.logger.appendKeys({ govuk_signin_journey_id: session.clientSessionId });
		this.metrics.addMetric("found session", MetricUnits.Count, 1);

		switch (session.authSessionState) {
			case AuthSessionState.BAV_DATA_RECEIVED:
				break;
			case AuthSessionState.BAV_AUTH_CODE_ISSUED:
				this.logger.info(`Session is in state ${AuthSessionState.BAV_AUTH_CODE_ISSUED}, generating a new auth code`);
				break;
			default: 
				this.logger.warn(`Session is in the wrong state: ${session.authSessionState}, expected state should be ${AuthSessionState.BAV_DATA_RECEIVED}`, { 
					messageCode: MessageCodes.INCORRECT_SESSION_STATE,
				});
				return Response(HttpCodesEnum.UNAUTHORIZED, `Session is in the wrong state: ${session.authSessionState}`);
		}

		const authorizationCode = randomUUID();
		await this.BavService.setAuthorizationCode(sessionId, authorizationCode);
		this.metrics.addMetric("Set authorization code", MetricUnits.Count, 1);

		const authResponse = {
			authorizationCode: {
				value: authorizationCode,
			},
			redirect_uri: session.redirectUri,
			state: session.state,
		};

		return Response(HttpCodesEnum.OK, JSON.stringify(authResponse));
	}
}
