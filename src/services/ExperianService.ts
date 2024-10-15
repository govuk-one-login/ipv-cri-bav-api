import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios, { AxiosRequestConfig } from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ExperianTokenResponse } from "../models/IExperianResponse";
import { DynamoDBDocument, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

export class ExperianService {
	readonly logger: Logger;

	private static instance: ExperianService;

	private readonly dynamo: DynamoDBDocument;

	readonly experianTokenTableName: string;

	readonly experianBaseUrl: string;

	constructor(logger: Logger, experianBaseUrl: string, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string) {
    	this.logger = logger;
		this.dynamo = dynamoDbClient;
		this.experianBaseUrl = experianBaseUrl;
		this.experianTokenTableName = experianTokenTableName;
	}

	static getInstance(logger: Logger, experianBaseUrl: string, dynamoDbClient: DynamoDBDocument, experianTokenTableName: string): ExperianService {
    	if (!ExperianService.instance) {
    		ExperianService.instance = new ExperianService(logger, experianBaseUrl, dynamoDbClient, experianTokenTableName);
    	}
    	return ExperianService.instance;
	}

	async generateExperianToken(clientUsername: string, clientPassword: string, clientId: string, clientSecret: string): Promise<ExperianTokenResponse> {
    	this.logger.info({ message: `Checking ${this.experianTokenTableName} for valid token` });
		const token = await this.checkExperianToken();
		if (token) {
			return token;
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
				throw new AppError(HttpCodesEnum.BAD_REQUEST, "Error generating experian token");
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

	async checkExperianToken(): Promise<ExperianTokenResponse | undefined> {
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

		const twentyFiveMinutesInMillis = 25 * 60 * 1000; 
		if (token.Item && Date.now() < Number(token.Item.issued_at) + twentyFiveMinutesInMillis) {
			return token.Item as ExperianTokenResponse;
		} 
    	return undefined; 
	}
}

