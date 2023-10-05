import { APIGatewayProxyEvent } from "aws-lambda";
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { BavService } from "./BavService";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { ISessionItem } from "../models/ISessionItem";
import { JwtPayload, Jwt } from "../models/IVeriCredential";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";
import { MessageCodes } from "../models/enums/MessageCodes";
import { Response, GenericServerError, UnauthorizedResponse, SECURITY_HEADERS } from "../utils/Response";
import { AppError } from "../utils/AppError";
import { ValidationHelper } from "../utils/ValidationHelper";

interface ClientConfig {
	jwksEndpoint: string;
	clientId: string;
	redirectUri: string;
}

export class SessionRequestProcessor {
  private static instance: SessionRequestProcessor;

  private readonly logger: Logger;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  private readonly kmsDecryptor: KmsJwtAdapter;

  constructor(logger: Logger, metrics: Metrics) {
  	this.logger = logger;
  	this.metrics = metrics;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);

  	const sessionTableName: string | undefined = process.env.SESSION_TABLE;
  	const encryptionKeyIds: string | undefined  = process.env.ENCRYPTION_KEY_IDS;
  	if (!sessionTableName || !encryptionKeyIds) {
  		this.logger.error({
  			message: "Missing AUTH_SESSION_TTL_SECS or SESSION_TABLE environment variable",
  			sessionTableName,
  			encryptionKeyIds,
  			messageCode: MessageCodes.MISSING_CONFIGURATION,
  		});
  		throw new AppError(HttpCodesEnum.SERVER_ERROR, "Session Service incorrectly configured");
  	}

  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
  	this.kmsDecryptor = new KmsJwtAdapter(encryptionKeyIds);
  }

  static getInstance(logger: Logger, metrics: Metrics): SessionRequestProcessor {
  	if (!SessionRequestProcessor.instance) {
  		SessionRequestProcessor.instance = new SessionRequestProcessor(logger, metrics);
  	}
  	return SessionRequestProcessor.instance;
  }

  async processRequest(event: APIGatewayProxyEvent): Promise<Response> {
  	const deserialisedRequestBody = JSON.parse(event.body as string);
  	const requestBodyClientId = deserialisedRequestBody.client_id;
  	const clientIpAddress = event.requestContext.identity?.sourceIp;

  	const clientConfig: string | undefined  = process.env.CLIENT_CONFIG;
  	if (!clientConfig) {
  		this.logger.error({
  			message: "Missing CLIENT_CONFIG environment variable",
  			messageCode: MessageCodes.MISSING_CONFIGURATION,
  		});
  		return GenericServerError;
  	}

  	let configClient: ClientConfig | undefined;
  	try {
  		const config = JSON.parse(clientConfig) as ClientConfig[];
  		configClient = config.find(c => c.clientId === requestBodyClientId);
  	} catch (error: any) {
  		this.logger.error("Invalid or missing client configuration table", {
  			error,
  			messageCode: MessageCodes.MISSING_CONFIGURATION,
  		});
  		return new Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
  	}

  	if (!configClient) {
  		this.logger.error("Unrecognised client in request", {
  			messageCode: MessageCodes.UNRECOGNISED_CLIENT,
  		});
  		return new Response(HttpCodesEnum.BAD_REQUEST, "Bad Request");
  	}

  	let urlEncodedJwt: string;
  	try {
  		urlEncodedJwt = await this.kmsDecryptor.decrypt(deserialisedRequestBody.request);
  	} catch (error: any) {
  		this.logger.error("Failed to decrypt supplied JWE request", {
  			error,
  			messageCode: MessageCodes.FAILED_DECRYPTING_JWE,
  		});
  		return UnauthorizedResponse;
  	}

  	let parsedJwt: Jwt;
  	try {
  		parsedJwt = this.kmsDecryptor.decode(urlEncodedJwt);
  	} catch (error: any) {
  		this.logger.error("Failed to decode supplied JWT", {
  			error,
  			messageCode: MessageCodes.FAILED_DECODING_JWT,
  		});
  		return UnauthorizedResponse;
  	}

  	try {
  		if (configClient.jwksEndpoint) {
  			const payload = await this.kmsDecryptor.verifyWithJwks(urlEncodedJwt, configClient.jwksEndpoint);

  			if (!payload) {
  				this.logger.error("Failed to verify JWT", {
  					messageCode: MessageCodes.FAILED_VERIFYING_JWT,
  				});
  				return UnauthorizedResponse;
  			}
  		} else {
  			this.logger.error("Incomplete Client Configuration", {
  				messageCode: MessageCodes.MISSING_CONFIGURATION,
  			});
  			return new Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
  		}
  	} catch (error: any) {
  		this.logger.error("Invalid request: Could not verify jwt", {
  			error,
  			messageCode: MessageCodes.FAILED_VERIFYING_JWT,
  		});
  		return UnauthorizedResponse;
  	}

  	const jwtPayload: JwtPayload = parsedJwt.payload;
  	const JwtErrors = this.validationHelper.isJwtValid(jwtPayload, requestBodyClientId, configClient.redirectUri);
  	if (JwtErrors.length > 0) {
  		this.logger.error(JwtErrors, {
  			messageCode: MessageCodes.FAILED_VALIDATING_JWT,
  		});
  		return UnauthorizedResponse;
  	}

  	// Validate the user details of the shared_claims received from the jwt.
  	const data = this.validationHelper.isPersonDetailsValid(jwtPayload.shared_claims.emailAddress, jwtPayload.shared_claims.name);
  	if (data.errorMessage.length > 0) {
  		this.logger.error( { message: data.errorMessage + "  from shared claims data" }, { messageCode : data.errorMessageCode });
  		return UnauthorizedResponse;
  	}

  	// Validate the address format of the shared_claims received from the jwt.
  	const { errorMessage, errorMessageCode } = this.validationHelper.isAddressFormatValid(jwtPayload);
  	if (errorMessage.length > 0) {
  		this.logger.error( { message: errorMessage }, { messageCode : errorMessageCode });
  		return UnauthorizedResponse;
  	}

  	// TODO highlight in the PR that I changed this
  	const sessionId: string = await this.BavService.generateSessionId();
  	this.logger.appendKeys({
  		sessionId,
  		govuk_signin_journey_id: jwtPayload.govuk_signin_journey_id as string,
  	});

  	const authSessionTtlInSecs: string | undefined = process.env.AUTH_SESSION_TTL_SECS;
  	if (!authSessionTtlInSecs) {
  		this.logger.error({
  			message: "Missing AUTH_SESSION_TTL_SECS environment variable",
  			messageCode: MessageCodes.MISSING_CONFIGURATION,
  		});
  		return GenericServerError;
  	}

  	const session: ISessionItem = {
  		sessionId,
  		clientId: jwtPayload.client_id,
  		clientSessionId: jwtPayload.govuk_signin_journey_id as string,
  		redirectUri: jwtPayload.redirect_uri,
  		expiryDate: absoluteTimeNow() + +authSessionTtlInSecs,
  		createdDate: absoluteTimeNow(),
  		state: jwtPayload.state,
  		subject: jwtPayload.sub ? jwtPayload.sub : "",
  		persistentSessionId: jwtPayload.persistent_session_id, //Might not be used
  		clientIpAddress,
  		attemptCount: 0,
  		authSessionState: "F2F_SESSION_CREATED",
  		evidence_requested: jwtPayload.evidence_requested,
  	};

  	try {
  		await this.BavService.createAuthSession(session);
  	} catch (error: any) {
  		this.logger.error("Failed to create session in session table", {
  			error,
  			messageCode: MessageCodes.FAILED_CREATING_SESSION,
  		});
  		return GenericServerError;
  	}

  	if (jwtPayload.shared_claims) {
  		try {
  			await this.BavService.savePersonIdentity(jwtPayload.shared_claims, sessionId);
  		} catch (error: any) {
  			this.logger.error("Failed to create session in person identity table", {
  				error,
  				messageCode: MessageCodes.FAILED_SAVING_PERSON_IDENTITY,
  			});
  			return GenericServerError;
  		}
  	}

  	try {
  		const issuer = process.env.ISSUER;
  		if (!issuer) {
  			this.logger.error({
  				message: "Missing ISSUER environment variable",
  				messageCode: MessageCodes.MISSING_CONFIGURATION,
  			});
  			return GenericServerError;
  		}

  		const coreEventFields = buildCoreEventFields(session, issuer, clientIpAddress, absoluteTimeNow);
  		await this.BavService.sendToTXMA({
  			event_name: "BAV_CRI_START",
  			...coreEventFields,
  			user: {
  				...coreEventFields.user,
  				govuk_signin_journey_id: session.clientSessionId,
  			},
  		});
  	} catch (error: any) {
  		this.logger.error("Auth session successfully created. Failed to send CIC_CRI_START event to TXMA", {
  			sessionId: session.sessionId,
  			error,
  			messageCode: MessageCodes.FAILED_TO_WRITE_TXMA,
  		});
  	}

  	this.logger.info("Session created successfully. Returning 200OK");

  	return {
  		statusCode: HttpCodesEnum.OK,
  		headers: SECURITY_HEADERS,
  		body: JSON.stringify({
  			session_id: sessionId,
  			state: jwtPayload.state,
  			redirect_uri: jwtPayload.redirect_uri,
  		}),
  	};
  }
}
