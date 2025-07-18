import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { BavService } from "./BavService";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";
import { HttpCodesEnum } from "../utils/HttpCodesEnum";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Response } from "../utils/Response";
import { AccessTokenRequestValidationHelper } from "../utils/AccessTokenRequestValidationHelper";
import { ISessionItem } from "../models/ISessionItem";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { Constants, EnvironmentVariables } from "../utils/Constants";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { AuthSessionState } from "../models/enums/AuthSessionState";
import { MessageCodes } from "../models/enums/MessageCodes";
import { AppError } from "../utils/AppError";
import { Jwt } from "../models/IVeriCredential";

interface ClientConfig {
	jwksEndpoint: string;
	clientId: string;
}

export class AccessTokenRequestProcessor {
	private static instance: AccessTokenRequestProcessor;

	private readonly logger: Logger;

	private readonly metrics: Metrics;

	private readonly accessTokenRequestValidationHelper: AccessTokenRequestValidationHelper;

	private readonly bavService: BavService;

	private readonly kmsJwtAdapter: KmsJwtAdapter;

	private readonly issuer: string;

	private readonly dnsSuffix: string;

	private readonly clientConfig: string;

	constructor(logger: Logger, metrics: Metrics) {
		this.logger = logger;
		this.kmsJwtAdapter = new KmsJwtAdapter(checkEnvironmentVariable(EnvironmentVariables.KMS_KEY_ARN, logger), logger);
		this.accessTokenRequestValidationHelper = new AccessTokenRequestValidationHelper();
		this.metrics = metrics;
		this.bavService = BavService.getInstance(checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, logger), this.logger, createDynamoDbClient());
		this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, this.logger);
		this.dnsSuffix = checkEnvironmentVariable(EnvironmentVariables.DNSSUFFIX, this.logger);
		this.clientConfig = checkEnvironmentVariable(EnvironmentVariables.CLIENT_CONFIG, logger);
	}

	static getInstance(logger: Logger, metrics: Metrics): AccessTokenRequestProcessor {
		if (!AccessTokenRequestProcessor.instance) {
			AccessTokenRequestProcessor.instance = new AccessTokenRequestProcessor(logger, metrics);
		}
		return AccessTokenRequestProcessor.instance;
	}

	async processRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
		try {
			let requestPayload;
			try {
				requestPayload = this.accessTokenRequestValidationHelper.validatePayload(event.body);
			} catch (error: any) {
				const statusCode = error instanceof AppError ? error.statusCode : HttpCodesEnum.UNAUTHORIZED;
				this.logger.error("Failed validating the Access token request body.", { messageCode: MessageCodes.FAILED_VALIDATING_ACCESS_TOKEN_REQUEST_BODY, error: error.message });
				return Response(statusCode, error.message);
			}

			let session: ISessionItem | undefined;

				session = await this.bavService.getSessionByAuthorizationCode(requestPayload.code);
				if (!session) {
					this.logger.info(`No session found by authorization code: : ${requestPayload.code}`, { messageCode: MessageCodes.SESSION_NOT_FOUND });
					return Response(HttpCodesEnum.UNAUTHORIZED, `No session found by authorization code: ${requestPayload.code}`);
				}
				this.logger.appendKeys({ sessionId: session.sessionId });
				this.logger.info({ message: "Found Session" });
				this.logger.appendKeys({
					govuk_signin_journey_id: session?.clientSessionId,
				});
				let configClient: ClientConfig | undefined;
				try {
					const config = JSON.parse(this.clientConfig) as ClientConfig[];
					configClient = config.find(c => c.clientId === session?.clientId);
				} catch (error: any) {
					this.logger.error("Invalid or missing client configuration table", {
						error,
						messageCode: MessageCodes.MISSING_CONFIGURATION,
					});
					return Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
				}
		
				if (!configClient) {
					this.logger.error("Unrecognised client in request", {
						messageCode: MessageCodes.UNRECOGNISED_CLIENT,
					});
					return Response(HttpCodesEnum.BAD_REQUEST, "Bad Request");
				}	

			if (session.authSessionState === AuthSessionState.BAV_AUTH_CODE_ISSUED) {
				const jwt: string = requestPayload.client_assertion;

				let parsedJwt: Jwt;
				try {
					parsedJwt = this.kmsJwtAdapter.decode(jwt);
				} catch (error: any) {
					this.logger.error("Failed to decode supplied JWT", {
						error,
						messageCode: MessageCodes.FAILED_DECODING_JWT,
					});
					return Response(HttpCodesEnum.UNAUTHORIZED, "Unauthorized");
				}

				try {
					if (configClient.jwksEndpoint) {
						const payload = await this.kmsJwtAdapter.verifyWithJwks(jwt, configClient.jwksEndpoint, parsedJwt.header.kid);

						if (!payload) {
							this.logger.error("Failed to verify JWT", {
								messageCode: MessageCodes.FAILED_VERIFYING_JWT,
							});
							return Response(HttpCodesEnum.UNAUTHORIZED, "Unauthorized");
						}
					} else {
						this.logger.error("Incomplete Client Configuration", {
							messageCode: MessageCodes.MISSING_CONFIGURATION,
						});
						return Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
					}
				} catch (error: any) {
					this.logger.error("Invalid request: Could not verify JWT", {
						error,
						messageCode: MessageCodes.FAILED_VERIFYING_JWT,
					});
					return Response(HttpCodesEnum.UNAUTHORIZED, "Unauthorized");
				}

				this.accessTokenRequestValidationHelper.validateTokenRequestToRecord(session, requestPayload.redirectUri);
				// Generate access token
				const jwtPayload = {
					sub: session.sessionId,
					aud: this.issuer,
					iss: this.issuer,
					exp: absoluteTimeNow() + Constants.TOKEN_EXPIRY_SECONDS,
				};
				let accessToken;
				try {
					accessToken = await this.kmsJwtAdapter.sign(jwtPayload, this.dnsSuffix);
				} catch (error) {
					this.logger.error("Failed to sign the accessToken Jwt", { messageCode: MessageCodes.FAILED_SIGNING_JWT });
					if (error instanceof AppError) {
						return Response(error.statusCode, error.message);
					}
					return Response(HttpCodesEnum.SERVER_ERROR, "Failed to sign the accessToken Jwt");
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
				this.metrics.addMetric("AccessToken_error_user_state_incorrect", MetricUnits.Count, 1);
				this.logger.warn(`Session for journey ${session?.clientSessionId} is in the wrong Auth state: expected state - ${AuthSessionState.BAV_AUTH_CODE_ISSUED}, actual state - ${session.authSessionState}`, { messageCode: MessageCodes.INCORRECT_SESSION_STATE });
				return Response(HttpCodesEnum.UNAUTHORIZED, `Session for journey ${session?.clientSessionId} is in the wrong Auth state: expected state - ${AuthSessionState.BAV_AUTH_CODE_ISSUED}, actual state - ${session.authSessionState}`);
			}
		} catch (err: any) {
			const statusCode = err instanceof AppError ? err.statusCode : HttpCodesEnum.UNAUTHORIZED;
			this.logger.error({ message: "Error processing access token request", err });
			return Response(statusCode, err.message);
		}
	}
}
