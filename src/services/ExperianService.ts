import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios, { AxiosRequestConfig } from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { sleep } from "../utils/Sleep";
import { logResponseCode } from "../utils/LogResponseCode";
import { ExperianTokenResponse, StoredExperianToken } from "../models/IExperianResponse";
import { DynamoDBDocument, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

export class ExperianService {
	readonly logger: Logger;

	private static instance: ExperianService;

    readonly experianBaseUrl: string;

    readonly maxRetries: number;

	private readonly dynamo: DynamoDBDocument;

	readonly experianTokenTableName: string;

    constructor(logger: Logger, experianBaseUrl: string, maxRetries: number, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string) {
    	this.logger = logger;
		this.experianBaseUrl = experianBaseUrl;
    	this.maxRetries = maxRetries;
    	this.dynamo = dynamoDbClient;
		this.experianTokenTableName = experianTokenTableName;
    }

    static getInstance(logger: Logger, experianBaseUrl: string, maxRetries: number, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string): ExperianService {
    	if (!ExperianService.instance) {
    		ExperianService.instance = new ExperianService(logger, experianBaseUrl, maxRetries, dynamoDbClient, experianTokenTableName);
    	}
    	return ExperianService.instance;
    }

    // eslint-disable-next-line max-lines-per-function
    async verify(
    	{ accountNumber, sortCode, name, uuid }: { accountNumber: string; sortCode: string; name: string; uuid: string }, 
		experianUsername: string,
		experianPassword: string,
		experianClientId: string,
		experianClientSecret: string
    ): Promise<any> {
    		try {
				const params = {
					header: {
					  tenantId: uuid,
					  requestType: Constants.EXPERIAN_PRODUCT_NAME,
					},
					account: { accountNumber, sortCode },
					subject: { name },
				  };
				
				const token = this.generateExperianToken(experianUsername, experianPassword, experianClientId, experianClientSecret)
				const headers = {
					"User-Agent": Constants.EXPERIAN_USER_AGENT,
					"Authorization": `Bearer ${token}`,
					"Content-Type":"application/json",
					"Accept":"application/json",
				};
				
    			const endpoint = `${this.experianBaseUrl}/${Constants.EXPERIAN_VERIFY_ENDPOINT_PATH}`;
    			this.logger.info("Sending verify request to Experian", { uuid, endpoint });
    			const { data } = await axios.post(endpoint, params, { headers });
    			const decisionElements = data?.clientResponsePayload?.decisionElements;

    			const logObject = decisionElements.find((object: { auditLogs: object[] }) => object.auditLogs);
    			this.logger.debug({
    				message: "Recieved response from Experian verify request",
    				eventType: logObject.auditLogs[0].eventType,
    				eventOutcome: logObject.auditLogs[0].eventOutcome,
    			});

				
    			const errorObject = decisionElements.find((object: { warningsErrors: Array<{ responseType: string; responseCode: string; responseMessage: string }> }) => object.warningsErrors);
    			const responseCodeObject = errorObject?.warningsErrors.find((object: { responseType: string; responseCode: string; responseMessage: string }) => object.responseType !== undefined);
				    			
    			if (responseCodeObject && responseCodeObject.responseCode) {
    				logResponseCode(responseCodeObject, this.logger);
    			} 
				
    			const bavCheckResults = decisionElements.find((object: { scores: Array<{ name: string; score: number }> }) => object.scores);
    			const personalDetailsScore = bavCheckResults?.scores.find((object: { name: string; score: number }) => object.name === "Personal details")?.score;

    			return personalDetailsScore;
    			
    		} catch (error: any) {
    			const message = "Error sending verify request to Experian";
    			this.logger.error({ message, messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: error?.response?.status });
				throw new AppError(HttpCodesEnum.SERVER_ERROR, message);		
    	}
    }
	
	async generateExperianToken(clientUsername: string, clientPassword: string, clientId: string, clientSecret: string): Promise<StoredExperianToken | ExperianTokenResponse> {
    	this.logger.info({ message: `Checking ${this.experianTokenTableName} for valid token` });

		const storedToken = await this.getExperianToken();
		const isValidToken = this.checkExperianToken(storedToken);

		if (isValidToken) {
			return storedToken;
		} else {		
			this.logger.info("requestExperianToken - no valid token - trying to generate new Experian token");
			try {
				const params = {
					username: clientUsername,
					password: clientPassword,
					client_id: clientId,
					client_secret: clientSecret,
				};

				const config: AxiosRequestConfig<any> = {
    				headers: {
    					"Content-Type": "application/json",
						"X-Correlation-Id": randomUUID(),
						"X-User-Domain": "cabinetofficegds.com",
    				},
				};

				const { data }: { data: ExperianTokenResponse } = await axios.post(
					`${this.experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`,
					params,
					config,
				);
				this.logger.info("Received response from experian token endpoint");
				await this.saveExperianToken(data);
				return data;
			} catch (error: any) {
				this.logger.error({ message: "Error generating experian token", statusCode: error?.response?.status, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN });
				this.logger.info("Returning previous Experian token due to error generating a new one.");
				return storedToken;
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

	async getExperianToken(): Promise<StoredExperianToken> {
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
		return token.Item as StoredExperianToken;
	}

	checkExperianToken(token: StoredExperianToken): boolean {
		const twentyFiveMinutesInMillis = 25 * 60 * 1000; 
		const tokenValidityWindow = Number(token.issued_at) + twentyFiveMinutesInMillis;
		if (Date.now() < tokenValidityWindow) {
			return true;
		} 
    	return false; 
	}
}
