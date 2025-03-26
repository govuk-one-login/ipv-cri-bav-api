import { Logger } from "@aws-lambda-powertools/logger";
import { Constants, EnvironmentVariables } from "../utils/Constants";
import axios from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ExperianTokenResponse, StoredExperianToken } from "../models/IExperianResponse";
import { DynamoDBDocument, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { logResponseCode } from "../utils/LogResponseCode";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";
import { ExperianVerifyResponse } from "../models/IVeriCredential";

export class ExperianService {
	readonly logger: Logger;

	private static instance: ExperianService;

	private readonly dynamo: DynamoDBDocument;

	private readonly metrics: Metrics;

	readonly experianTokenTableName: string;

    readonly maxRetries: number;

    constructor(logger: Logger, metrics: Metrics, maxRetries: number, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string) {
    	this.logger = logger;
    	this.metrics = metrics;
    	this.maxRetries = maxRetries;
    	this.dynamo = dynamoDbClient;
    	this.experianTokenTableName = experianTokenTableName;
    }

    static getInstance(logger: Logger, metrics: Metrics, maxRetries: number, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string): ExperianService {
    	if (!ExperianService.instance) {
    		ExperianService.instance = new ExperianService(logger, metrics, maxRetries, dynamoDbClient, experianTokenTableName);
    	}
    	return ExperianService.instance;
    }

	 // eslint-disable-next-line max-lines-per-function
	 async verify(
    	{ verifyAccountPayload, firstName, surname, birthDate, uuid }: { verifyAccountPayload: any; firstName: string; surname: string; birthDate: string; uuid: string }, 
    	experianUsername: string,
    	experianPassword: string,
    	experianClientId: string,
    	experianClientSecret: string,
    	experianVerifyUrl: string,
    	experianTokenUrl: string,
    ): Promise<ExperianVerifyResponse> {
    	try {
    		const THIRDPARTY_DIRECT_SUBMISSION = checkEnvironmentVariable(EnvironmentVariables.THIRDPARTY_DIRECT_SUBMISSION, this.logger);

    		let params: any = "";
    		if (THIRDPARTY_DIRECT_SUBMISSION === "true") {
    			params = verifyAccountPayload;
    		} else {
    		/* eslint-disable */
    		params = {
    			header: {
				  requestType: Constants.EXPERIAN_PRODUCT_NAME,
				  clientReferenceId: uuid,
				  expRequestId: "",
				  messageTime: new Date().toISOString().split('.')[0]+"Z",
				  options: {}
    			},
    			payload: {
				  source: "WEB",
				  application: {
    					applicants: [
					  {
    							id: "APPLICANT_1",
    							applicantType: "APPLICANT",
    							contactId: "MainContact_1"
					  }
    					]
				  },
				  contacts: [
    					{
					  id: "MainContact_1",
					  person: {
    							typeOfPerson: "APPLICANT",
    							personDetails: {
						  dateOfBirth: birthDate,
    							},
    							names: [
    								{
    									firstName: firstName,
    									surName: surname
    								}
    							]
					  },
					  bankAccount: {
    							sortCode: verifyAccountPayload?.sort_code,
    							clearAccountNumber: verifyAccountPayload?.account_number?.padStart(8, "0")
					  		}
    					}
				  ]
    			}
			  };
			}
			  /* eslint-enable */
				
    		const token = await this.generateExperianToken(experianUsername, experianPassword, experianClientId, experianClientSecret, experianTokenUrl);
    		const headers = {
    			"User-Agent": Constants.EXPERIAN_USER_AGENT,
    			"Authorization": `Bearer ${token.access_token}`,
    			"Content-Type":"application/json",
    			"Accept":"application/json",
    		};

    		const endpoint = experianVerifyUrl;
    		this.logger.info("Sending verify request to Experian", { uuid, endpoint });
    		const { data } = await axios.post(endpoint, params, { headers });
    		
    		const LOG_THIRDPARTY_API_RESPONSE = checkEnvironmentVariable(EnvironmentVariables.LOG_THIRDPARTY_API_RESPONSE, this.logger);
    		this.logger.info("Logging experian response " + LOG_THIRDPARTY_API_RESPONSE);
    		if (LOG_THIRDPARTY_API_RESPONSE === "true") {
    			const requestPayload = JSON.stringify(params, function replacer(key: string, value: any): any { return value;});
    			const responsePayload = JSON.stringify(data, function replacer(key: string, value: any): any { return value;});
    			this.logger.info(`Experian request: : ${requestPayload}` );
    			this.logger.info(`Experian response: : ${responsePayload}` );
    		}

    		const responseHeader = data?.responseHeader;
    		this.logger.info("Experian response header client referenceId " + responseHeader?.clientReferenceId);
    		this.logger.info("Experian response header expRequestId " + responseHeader?.expRequestId);
    		this.logger.info("Experian response details: ResponseTye " + responseHeader?.responseType + " Response Code " + responseHeader?.responseCode + " ResponseMessage " + responseHeader?.responseMessage);
    		this.logger.info("Experian overall response details " + JSON.stringify(responseHeader?.overallResponse));
    		
    		const expRequestId = responseHeader?.expRequestId;

    		const decision = responseHeader?.overallResponse?.decision;
    		this.metrics.addMetric("Experian-" + decision, MetricUnits.Count, 1);

    		let warningsErrors = undefined;
    		let personalDetailsScore = undefined;

	   		const decisionElements = data?.clientResponsePayload?.decisionElements;
    		if (decisionElements) {
    			this.logEventOutcomes(decisionElements);
    			this.logRules(decisionElements);

    			const errorObject = decisionElements.find((object: { warningsErrors: Array<{ responseType: string; responseCode: string; responseMessage: string }> }) => object.warningsErrors);
    			if (errorObject) {	
    				const thirdPartyWarningsErrors = errorObject?.warningsErrors;
    				if (thirdPartyWarningsErrors) {
    					warningsErrors = thirdPartyWarningsErrors;
    					if (warningsErrors) {
    						logResponseCode(warningsErrors, this.logger, this.metrics);
    					}
    				}
    			}

    			const bavCheckResults = decisionElements.find((object: { scores: Array<{ name: string; score: number }> }) => object.scores);
    			const scores = bavCheckResults?.scores;
    			if (scores) {
    				personalDetailsScore = scores.find((object: { name: string; score: number }) => object.name === "Personal details")?.score;
    				this.logger.info("Personal details score is " + personalDetailsScore);
    				this.metrics.addMetric("PersonalDetailsScore-" + personalDetailsScore, MetricUnits.Count, 1);
    			} else {
    				this.logger.warn("No scores present in response");
    			}
    		} else {
    			this.logger.info("Decision elements not found.");
    		}

    		const verifyObject = {
    			outcome: decision,
    			expRequestId,
    			personalDetailsScore,
    			warningsErrors,
    		};
    		
    		return verifyObject;
    			
    	} catch (error: any) {
    		const message = "Error sending verify request to Experian";
    		this.logger.error({ errorMessage: error?.message, message, messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: error?.response?.status });
    		throw new AppError(HttpCodesEnum.SERVER_ERROR, message);		
    	}
    }

    private logRules(decisionElements: any): void {
    	const rulesElement = decisionElements.find((object: { rules: object[] }) => object.rules);
    	const rules: Array<{ ruleId: string; ruleName: string; ruleText: string; ruleScore: number }> = rulesElement ? rulesElement?.rules : [];
    	const triggeredRules: string[] = [];
    	if (rules) {
    		rules.forEach((rule) => {
    			if (rule?.ruleScore > 0) {
    				triggeredRules.push(`Rule Id: ${rule?.ruleId}, Rule Name: ${rule?.ruleName} , Rule text: ${rule?.ruleText}`);
    			}
    		});
    	}
    	this.logger.info("Triggered rules: " + JSON.stringify(triggeredRules));
    }

    private logEventOutcomes(decisionElements: any): void {
    	const logObject = decisionElements.find((object: { auditLogs: object[] }) => object.auditLogs);
    	const eventOutcome = logObject?.auditLogs[0]?.eventOutcome;
    	this.logger.info({
    		message: "Received response from Experian verify request. Match Result:",
    		eventType: logObject?.auditLogs[0]?.eventType,
    		eventOutcome,
    	});
    	if (eventOutcome) {
    		this.metrics.addMetric("Experian-" + eventOutcome.replace(" ", "_"), MetricUnits.Count, 1);
    	}
    }

    async generateExperianToken(clientUsername: string, clientPassword: string, clientId: string, clientSecret: string, experianTokenUrl: string): Promise<StoredExperianToken | ExperianTokenResponse> {
    	this.logger.info({ message: `Checking ${this.experianTokenTableName} for valid token` });

    	const storedToken = await this.getExperianToken();
    	const isValidToken = this.checkExperianToken(storedToken);

    	if (storedToken && isValidToken) {
    		this.logger.info("Valid token found");
    		return storedToken;

    	} else {
    		try {
    			const endpoint = experianTokenUrl;
    			
    			const params = {
    				username: clientUsername,
    				password: clientPassword,
    				client_id: clientId,
    				client_secret: clientSecret,
    			};
    			this.logger.info("No valid token found - trying to generate new Experian token", { endpoint });
    			this.logger.debug({ message: `Query params: ${params.username} ${params.password} ${params.client_id} ${params.client_secret}` });

    			const correlationId = randomUUID();

    			const { data }: { data: ExperianTokenResponse } = await axios.post(
    				endpoint,
    				params,
    				{ headers: {
    					"Content-Type": "application/json",
    					"X-Correlation-Id": correlationId,
    					"X-User-Domain": "cabinetofficegds.com",
    				} },
    			);
    			this.logger.info(`Received response from Experian token endpoint - X-Correlation-Id: ${correlationId}`);
    			await this.saveExperianToken(data);
    			return data;

    		} catch (error: any) {
    			if (storedToken) {
    				const message = "Error refreshing Experian token - returning previous Experian token";
    				this.logger.error({ errorMessage: error?.message, message, statusCode: error?.response?.status, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN });
    				return storedToken;
    			} else {
    				const message = "Error generating Experian token and no previous token found";
    				this.logger.error({ errorMessage: error?.message, message, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN });
    				throw new AppError(HttpCodesEnum.SERVER_ERROR, message);
    			}
    		}
    	}
    }

    async saveExperianToken(token : ExperianTokenResponse): Promise<void> {
    	this.logger.info({ message: `Updating ${this.experianTokenTableName} with new Experian token` });

    	const putExperianTokenCommand = new PutCommand({
    		TableName: this.experianTokenTableName,
    		Item: { 
    			id: "1", //Static primary key - table will only store 1 token, old token will always be overwritten
    			issued_at: token.issued_at,
    			expires_in: token.expires_in,
    			token_type: token.token_type,
    			access_token: token.access_token,
    		},
    	});

    	try {
    		await this.dynamo.send(putExperianTokenCommand);
    		this.logger.info({ message: "Stored new Experian token" });
    	} catch (error) {
    		this.logger.error({ message: "Error storing new Experian token", messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN, error });
    		throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error storing new Experian token");
    	}
    }

    async getExperianToken(): Promise<StoredExperianToken | undefined> {
    	this.logger.info("Fetching Experian token from table " + this.experianTokenTableName);
    	const getExperianTokenCommand = new GetCommand({
    		TableName: this.experianTokenTableName,
    		Key: {
    			id: "1", //Static primary key - table will only store 1 token, old token will always be overwritten
    		},
    	});

    	let token;
    	try {
    		token = await this.dynamo.send(getExperianTokenCommand);
			// ignored so as not log PII
			/* eslint-disable @typescript-eslint/no-unused-vars */
    	} catch (error) {
    		this.logger.error({ message: "getExperianTokenById - failed executing get from dynamodb:" }, {
    			messageCode: MessageCodes.FAILED_FETCHING_EXPERIAN_TOKEN,
    		});
    		throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error retrieving Experian token");
    	}
		
    	if (token.Item) {
    		return token.Item as StoredExperianToken;
    	} else { 
    		return undefined;
    	}
    }

    checkExperianToken(token: StoredExperianToken | undefined): boolean {
		
    	if (token === undefined) {
    		return false;
    	}

    	const twentyFiveMinutesInSeconds = 25 * 60; 
    	const tokenValidityWindow = Number(token.issued_at) + twentyFiveMinutesInSeconds;

    	if (Date.now() / 1000 < tokenValidityWindow) {
    		return true;
    	} else {
    		return false;
    	} 
    }
}

