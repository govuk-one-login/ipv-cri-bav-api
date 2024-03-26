import { APIGatewayProxyEvent } from "aws-lambda";
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { BavService } from "./BavService";
import { AuthSessionState } from "../models/enums/AuthSessionState";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { TxmaEventNames } from "../models/enums/TxmaEvents";
import { ISessionItem } from "../models/ISessionItem";
import { Constants, EnvironmentVariables } from "../utils/Constants";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";
import { Response } from "../utils/Response";
import { buildCoreEventFields } from "../utils/TxmaEvent";
import { eventToSubjectIdentifier } from "../utils/Validations";
import { AppError } from "../utils/AppError";
import { VerifiableCredentialService } from "./VerifiableCredentialService";

export class UserInfoRequestProcessor {
  private static instance: UserInfoRequestProcessor;

  private readonly logger: Logger;

	private readonly issuer: string;

	private readonly txmaQueueUrl: string;

	private readonly personIdentityTableName: string;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

  private readonly kmsDecryptor: KmsJwtAdapter;

	private readonly verifiableCredentialService: VerifiableCredentialService;

	private readonly dnsSuffix: string;

	constructor(logger: Logger, metrics: Metrics) {
  	this.logger = logger;
  	this.metrics = metrics;
  	logger.debug("metrics is  " + JSON.stringify(this.metrics));
  	this.metrics.addMetric("Called", MetricUnits.Count, 1);

  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, this.logger);
  	const signinKeyIds: string = checkEnvironmentVariable(EnvironmentVariables.KMS_KEY_ARN, this.logger);
  	this.issuer = checkEnvironmentVariable(EnvironmentVariables.ISSUER, this.logger);
  	this.txmaQueueUrl = checkEnvironmentVariable(EnvironmentVariables.TXMA_QUEUE_URL, this.logger);
  	this.personIdentityTableName = checkEnvironmentVariable(EnvironmentVariables.PERSON_IDENTITY_TABLE_NAME, this.logger);
		this.dnsSuffix = checkEnvironmentVariable(EnvironmentVariables.DNSSUFFIX, this.logger);

  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
  	this.kmsDecryptor = new KmsJwtAdapter(signinKeyIds);
		this.verifiableCredentialService = VerifiableCredentialService.getInstance(this.kmsDecryptor, this.issuer, this.logger, this.dnsSuffix);
	}

	static getInstance(logger: Logger, metrics: Metrics): UserInfoRequestProcessor {
  	if (!UserInfoRequestProcessor.instance) {
  		UserInfoRequestProcessor.instance = new UserInfoRequestProcessor(logger, metrics);
  	}
  	return UserInfoRequestProcessor.instance;
	}

	// eslint-disable-next-line max-lines-per-function, complexity
	async processRequest(event: APIGatewayProxyEvent): Promise<Response> {
		const encodedHeader = event.headers[Constants.ENCODED_AUDIT_HEADER] ?? "";
		let sessionId: string;

		try {
			sessionId = await eventToSubjectIdentifier(this.kmsDecryptor, event);
		} catch (error) {
			if (error instanceof AppError) {
				this.logger.error("Error validating Authentication Access token from headers: ", {
					error,
					messageCode: MessageCodes.INVALID_AUTH_CODE,
				});
				return new Response(HttpCodesEnum.UNAUTHORIZED, "Error Validating Token");
			}
			this.logger.error("Unexpected error occurred", {
				error,
				messageCode: MessageCodes.SERVER_ERROR,
			});
			return new Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
		}

		this.logger.appendKeys({ sessionId });
		
		const session: ISessionItem | undefined = await this.BavService.getSessionById(sessionId);
		if (!session) {
			this.logger.error("No session found", {
				messageCode: MessageCodes.SESSION_NOT_FOUND,
			});
			return new Response(HttpCodesEnum.UNAUTHORIZED, "No Session Found");
		}

		this.logger.appendKeys({ govuk_signin_journey_id: session.clientSessionId });

		this.logger.info("Found Session:", {
			// note: we only log specific non-PII attributes from the session object
			session: {
				authSessionState: session.authSessionState,
				accessTokenExpiryDate: session.accessTokenExpiryDate,
				authorizationCodeExpiryDate: session.authorizationCodeExpiryDate,
				createdDate: session.createdDate,
				expiryDate: session.expiryDate,
				redirectUri: session.redirectUri,
			},
		});
  
		this.metrics.addMetric("found session data", MetricUnits.Count, 1);

		const personInfo = await this.BavService.getPersonIdentityBySessionId(sessionId, this.personIdentityTableName);
		if (!personInfo) {
			this.logger.error("No person found with this session ID", {
				messageCode: MessageCodes.PERSON_NOT_FOUND,
			});
			return new Response(HttpCodesEnum.UNAUTHORIZED, "Missing Person Identity");
		}

		this.metrics.addMetric("found person identity data", MetricUnits.Count, 1);

		if (session.authSessionState !== AuthSessionState.BAV_ACCESS_TOKEN_ISSUED) {
			this.logger.error("Session is in wrong Auth state", {
				// note: we only log specific non-PII attributes from the session object
				expectedSessionState: AuthSessionState.BAV_ACCESS_TOKEN_ISSUED,
				session: {
					authSessionState: session.authSessionState,
				},
				messageCode: MessageCodes.INCORRECT_SESSION_STATE,
			});
			return new Response(HttpCodesEnum.UNAUTHORIZED, "Invalid Session State");
		}

		const names = personInfo.name[0].nameParts;
		
		if (names && names.length > 0 && personInfo.sortCode && personInfo.accountNumber) {
			const { signedJWT, evidenceInfo } = await this.verifiableCredentialService.generateSignedVerifiableCredentialJwt(
				session,
				names, {
					sortCode: personInfo.sortCode,
					accountNumber: personInfo.accountNumber,
				},
				absoluteTimeNow);

			this.metrics.addMetric("Generated signed verifiable credential jwt", MetricUnits.Count, 1);

			await this.BavService.updateSessionAuthState(session.sessionId, AuthSessionState.BAV_CRI_VC_ISSUED);

			const txmaCoreFields = buildCoreEventFields(session, this.issuer, session.clientIpAddress);
			await this.BavService.sendToTXMA(
				this.txmaQueueUrl,
				encodedHeader,
				{
					event_name: TxmaEventNames.BAV_CRI_VC_ISSUED,
					...txmaCoreFields,
					restricted:{
						name: personInfo.name,
						bankAccount: [{
							sortCode: personInfo.sortCode,
							accountNumber: personInfo.accountNumber,
						}],
				  },
					extensions: {
						evidence: [
							{
								txn: session.hmrcUuid!,
								strengthScore: evidenceInfo.strengthScore,
								validityScore: evidenceInfo.validityScore,
								attemptNum: session.attemptCount || 1,
								ci: evidenceInfo.ci,
								ciReasons: [{
									ci: evidenceInfo.ci?.[0],
									reason: session.copCheckResult,
								}],
							},
						],
				 },
				});

			await this.BavService.sendToTXMA(
				this.txmaQueueUrl,
				encodedHeader,
				{
					event_name: TxmaEventNames.BAV_CRI_END,
					...txmaCoreFields,
				},
			);

			return new Response(HttpCodesEnum.OK, JSON.stringify({
				sub: session.subject,
				"https://vocab.account.gov.uk/v1/credentialJWT": [signedJWT],
			}));
		} else {
			this.logger.error("Missing required fields to generate BAV VC", {
				messageCode: MessageCodes.MISSING_PERSONAL_DETAILS,
			}, {
				names: names.length === 0 ? false : !!names,
				sortCode: !!personInfo.sortCode,
				accountNumber: !!personInfo.accountNumber,
			});
			return new Response(HttpCodesEnum.BAD_REQUEST, "Bad Request");
		}
	}
}
