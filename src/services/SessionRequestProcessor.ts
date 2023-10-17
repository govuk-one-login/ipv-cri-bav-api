import { APIGatewayProxyEvent } from "aws-lambda";
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { BavService } from "./BavService";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ISessionItem } from "../models/ISessionItem";
import { JwtPayload, Jwt } from "../models/IVeriCredential";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";
import { Response, UnauthorizedResponse, SECURITY_HEADERS } from "../utils/Response";
import { buildCoreEventFields } from "../utils/TxmaEvent";
import { isJwtValid, isPersonNameValid } from "../utils/Validations";

interface ClientConfig {
	jwksEndpoint: string;
	clientId: string;
	redirectUri: string;
}

export class SessionRequestProcessor {
  private static instance: SessionRequestProcessor;

  private readonly logger: Logger;

	private readonly clientConfig: string;

	private readonly authSessionTtlInSecs: string;

	private readonly issuer: string;

	private readonly txmaQueueUrl: string;

	private readonly personIdentityTableName: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  private readonly kmsDecryptor: KmsJwtAdapter;

  constructor(logger: Logger, metrics: Metrics) {
  	this.logger = logger;
  	this.metrics = metrics;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);

  	const sessionTableName: string = checkEnvironmentVariable("SESSION_TABLE", this.logger);
  	const encryptionKeyIds: string = checkEnvironmentVariable("ENCRYPTION_KEY_IDS", this.logger);
  	this.clientConfig = checkEnvironmentVariable("CLIENT_CONFIG", this.logger);
  	this.authSessionTtlInSecs = checkEnvironmentVariable("AUTH_SESSION_TTL_SECS", this.logger);
  	this.issuer = checkEnvironmentVariable("ISSUER", this.logger);
  	this.txmaQueueUrl = checkEnvironmentVariable("TXMA_QUEUE_URL", this.logger);
  	this.personIdentityTableName = checkEnvironmentVariable("PERSON_IDENTITY_TABLE_NAME", this.logger);

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

  	let configClient: ClientConfig | undefined;
  	try {
  		const config = JSON.parse(this.clientConfig) as ClientConfig[];
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
  	const JwtErrors = isJwtValid(jwtPayload, requestBodyClientId, configClient.redirectUri);
  	if (JwtErrors.length > 0) {
  		this.logger.error(JwtErrors, {
  			messageCode: MessageCodes.FAILED_VALIDATING_JWT,
  		});
  		return UnauthorizedResponse;
  	}

  	const personDetailsError = isPersonNameValid(jwtPayload.shared_claims.name);
  	if (!personDetailsError) {
  		this.logger.error({
  			message: "Missing GivenName or FamilyName from shared claims data",
  			messageCode: MessageCodes.INVALID_PERSONAL_DETAILS,
  		});
  		return UnauthorizedResponse;
  	}

  	const sessionId: string = await this.BavService.generateSessionId();
  	this.logger.appendKeys({
  		sessionId,
  		govuk_signin_journey_id: jwtPayload.govuk_signin_journey_id as string,
  	});

  	const session: ISessionItem = {
  		sessionId,
  		clientId: jwtPayload.client_id,
  		clientSessionId: jwtPayload.govuk_signin_journey_id as string,
  		redirectUri: jwtPayload.redirect_uri,
  		expiryDate: absoluteTimeNow() + +this.authSessionTtlInSecs,
  		createdDate: absoluteTimeNow(),
  		state: jwtPayload.state,
  		subject: jwtPayload.sub ? jwtPayload.sub : "",
  		persistentSessionId: jwtPayload.persistent_session_id,
  		clientIpAddress,
  		attemptCount: 0,
  		authSessionState: "BAV_SESSION_CREATED",
  		evidence_requested: jwtPayload.evidence_requested,
  	};

  	await this.BavService.createAuthSession(session);
  	await this.BavService.savePersonIdentity({
  		sharedClaims: jwtPayload.shared_claims,
  		sessionId,
  		tableName: this.personIdentityTableName,
  		authSessionTtlInSecs:
			this.authSessionTtlInSecs,
  	});

  	const coreEventFields = buildCoreEventFields(session, this.issuer, clientIpAddress, absoluteTimeNow);
  	await this.BavService.sendToTXMA(
  		this.txmaQueueUrl,
  		{
  			event_name: "BAV_CRI_START",
  			...coreEventFields,
  			user: {
  				...coreEventFields.user,
  				govuk_signin_journey_id: session.clientSessionId,
  		},
  	});

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
