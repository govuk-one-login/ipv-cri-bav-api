import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ExperianTokenResponse, StoredExperianToken } from "../models/IExperianResponse";
import { DynamoDBDocument, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { logResponseCode } from "../utils/LogResponseCode";

export class ExperianService {
	readonly logger: Logger;

	private static instance: ExperianService;

	private readonly dynamo: DynamoDBDocument;

	readonly experianTokenTableName: string;

    readonly maxRetries: number;

    constructor(logger: Logger, maxRetries: number, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string) {
    	this.logger = logger;
    	this.maxRetries = maxRetries;
    	this.dynamo = dynamoDbClient;
    	this.experianTokenTableName = experianTokenTableName;
    }

    static getInstance(logger: Logger, maxRetries: number, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string): ExperianService {
    	if (!ExperianService.instance) {
    		ExperianService.instance = new ExperianService(logger, maxRetries, dynamoDbClient, experianTokenTableName);
    	}
    	return ExperianService.instance;
    }

	 // eslint-disable-next-line max-lines-per-function
	 async verify(
    	{ accountNumber, sortCode, givenName, surname, birthDate, uuid }: { accountNumber: string; sortCode: string; givenName: string; surname: string; birthDate: string; uuid: string }, 
    	experianUsername: string,
    	experianPassword: string,
    	experianClientId: string,
    	experianClientSecret: string,
    	experianVerifyUrl: string,
    	experianTokenUrl: string,
    ): Promise<any> {
    		try {
    		const params = {
    			header: {
				  requestType: Constants.EXPERIAN_PRODUCT_NAME,
				  clientReferenceId: uuid,
				  messageTime: new Date().toISOString(),
				  options: {},
    			},
    			payload: {
				  source: "WEB",
				  application: {
    					applicant: [
					  {
    							id: "APPLICANT_1",
    							contactId: "MainContact_1",
					  },
    					],
				  },
				  contacts: [
    					{
					  id: "MainContact_1",
					  person: {
    							personDetails: {
						  dateOfBirth: birthDate,
    							},
    							names: [
						  {
    									firstName: givenName,
    									surName: surname,
						  },
    							],
					  },
					  bankAccount: {
    							sortCode,
    							clearAccountNumber: accountNumber,
					  },
    					},
				  ],
    			},
			  };
				
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
	   			const decisionElements = data?.clientResponsePayload?.decisionElements;
    		const expRequestId = data?.responseHeader?.expRequestId;

    			const logObject = decisionElements.find((object: { auditLogs: object[] }) => object.auditLogs);
    			this.logger.info({
    				message: "Received response from Experian verify request",
    				eventType: logObject.auditLogs[0]?.eventType,
    				eventOutcome: logObject.auditLogs[0]?.eventOutcome,
    			});

				
    			const errorObject = decisionElements.find((object: { warningsErrors: Array<{ responseType: string; responseCode: string; responseMessage: string }> }) => object.warningsErrors);
    			const warningsErrors = errorObject?.warningsErrors.find((object: { responseType: string; responseCode: string; responseMessage: string }) => object.responseType !== undefined);
    			if (warningsErrors) {
    				logResponseCode(warningsErrors, this.logger);
    			} 
				
    			const bavCheckResults = decisionElements.find((object: { scores: Array<{ name: string; score: number }> }) => object.scores);
    		const personalDetailsScore = bavCheckResults?.scores.find((object: { name: string; score: number }) => object.name === "Personal details")?.score;

    		const verifyObject = {
    			expRequestId,
    			personalDetailsScore,
    			warningsErrors,
    		};
    		
    		return verifyObject;
    			
    		} catch (error: any) {
    			const message = "Error sending verify request to Experian";
    			this.logger.error({ error, message, messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: error?.response?.status });
    		throw new AppError(HttpCodesEnum.SERVER_ERROR, message);		
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
    				this.logger.error({ error, message, statusCode: error?.response?.status, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN });
    				return storedToken;
    			} else {
    				const message = "Error generating Experian token and no previous token found";
    				this.logger.error({ error, message, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN });
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

    	const twentyFiveMinutesInMillis = 25 * 60 * 1000; 
    	const tokenValidityWindow = Number(token.issued_at) + twentyFiveMinutesInMillis;
    	
    	if (Date.now() < tokenValidityWindow) {
    		return true;
    	} else {
    		return false;
    	} 
    }
}

