import { Logger } from "@aws-lambda-powertools/logger";
import { MetricUnits, Metrics } from "@aws-lambda-powertools/metrics";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { APIGatewayProxyEvent } from "aws-lambda";
import { Response } from "../utils/Response";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { Constants, EnvironmentVariables } from "../utils/Constants";
import { MessageCodes } from "../models/enums/MessageCodes";
import { AppError } from "../utils/AppError";
import { BavService } from "./BavService";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { isPayloadValid, validateTokenRequestToRecord } from "../utils/AccessTokenRequestValidations";
import { AuthSessionState } from "../models/enums/AuthSessionState";

export class AccessTokenRequestProcessor {
	private static instance: AccessTokenRequestProcessor;

	private readonly logger: Logger;

	private readonly metrics: Metrics;

	private readonly bavService: BavService;

	private readonly kmsJwtAdapter: KmsJwtAdapter;

	private readonly issuer: string;

	constructor(logger: Logger, metrics: Metrics) {
		this.logger = logger;
		this.metrics = metrics;
  		logger.debug("metrics is  " + JSON.stringify(this.metrics));
  		this.metrics.addMetric("Called", MetricUnits.Count, 1);

		const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, this.logger);
  		const signingKeyArn: string = checkEnvironmentVariable(EnvironmentVariables.KMS_KEY_ARN, this.logger);
		this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, this.logger);
		
		this.kmsJwtAdapter = new KmsJwtAdapter(signingKeyArn);
		this.bavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
	}

	static getInstance(logger: Logger, metrics: Metrics): AccessTokenRequestProcessor {
		if (!AccessTokenRequestProcessor.instance) {
			AccessTokenRequestProcessor.instance = new AccessTokenRequestProcessor(logger, metrics);
		}
		return AccessTokenRequestProcessor.instance;
	}

	async processRequest(event: APIGatewayProxyEvent): Promise<Response> {
		try {
			let requestPayload;
			try {
				requestPayload = isPayloadValid(event.body);
			} catch (error) {
				this.logger.error("Failed validating the Access token request body.", { error, messageCode: MessageCodes.FAILED_VALIDATING_REQUEST_BODY });
				if (error instanceof AppError) {
					return new Response(error.statusCode, error.message);
				}
				return new Response(HttpCodesEnum.UNAUTHORIZED, "An error has occurred while validating the Access token request payload.");
			}
						
			const session = await this.bavService.getSessionByAuthorizationCode(requestPayload.code);
			if (!session) {
				this.logger.info(`No session found by authorization code: : ${requestPayload.code}`, { messageCode: MessageCodes.SESSION_NOT_FOUND });
				return new Response(HttpCodesEnum.UNAUTHORIZED, `No session found by authorization code: ${requestPayload.code}`);
			}
			this.logger.appendKeys({ sessionId: session.sessionId });
			this.logger.info({ message: "Found Session" });
			this.logger.appendKeys({
				govuk_signin_journey_id: session?.clientSessionId,
			});

			if (session.authSessionState === AuthSessionState.BAV_AUTH_CODE_ISSUED) {

				validateTokenRequestToRecord(session, requestPayload.redirectUri);
				// Generate access token
				const jwtPayload = {
					sub: session.sessionId,
					aud: this.issuer,
					iss: this.issuer,
					exp: absoluteTimeNow() + Constants.TOKEN_EXPIRY_SECONDS,
				};
				let accessToken;
				try {
					accessToken = await this.kmsJwtAdapter.sign(jwtPayload);
				} catch (error) {
					this.logger.error("Failed to sign the accessToken Jwt", { messageCode: MessageCodes.FAILED_SIGNING_JWT });
					return new Response(HttpCodesEnum.SERVER_ERROR, "Failed to sign the accessToken Jwt");
				}

				// Update the sessionTable with accessTokenExpiryDate and AuthSessionState.
				await this.bavService.updateSessionWithAccessTokenDetails(session.sessionId, jwtPayload.exp);

				this.logger.info({ message: "Access token generated successfully" });

				return {
					statusCode: HttpCodesEnum.OK,
					body: JSON.stringify({
						access_token: accessToken,
						token_type: Constants.BEARER,
						expires_in: Constants.TOKEN_EXPIRY_SECONDS,
					}),
				};
			} else {
				this.logger.warn(`Session is in the wrong state: ${session.authSessionState}, expected state should be ${AuthSessionState.BAV_AUTH_CODE_ISSUED}`, { messageCode: MessageCodes.INCORRECT_SESSION_STATE });
				return new Response(HttpCodesEnum.UNAUTHORIZED, `Session is in the wrong state: ${session.authSessionState}`);
			}
		} catch (err: any) {
			this.logger.error({ message: "Error processing access token request", err });
			return new Response(err.statusCode, err.message);
		}
	}
}
