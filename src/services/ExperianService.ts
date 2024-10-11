import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ExperianTokenResponse } from "../models/IExperianResponse";
import { DynamoDBDocument, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

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

	async generateExperianToken(clientPassword: string, clientUsername: string, clientSecret: string, clientId: string): Promise<ExperianTokenResponse> {
    	this.logger.info({ message: `Checking ${this.experianTokenTableName} for valid token` });
		const token = await this.checkExperianToken();
		if (token) {
			return token;
		} else {		
			this.logger.info("requestExperianToken - no valid token - trying to generate new Experian token");
			try {
				const params = {
					clientPassword,
					clientUsername,
					client_secret : clientSecret,
					client_id : clientId,
				};
				
				const { token }: { token: ExperianTokenResponse } = await axios.post(
					`${this.experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`,
					params,
				);
				this.logger.info("Received response from experian token endpoint");
				await this.saveExperianToken(token);
				return token;
			} catch (error: any) {
				this.logger.error({ message: "Error generating experian token", statusCode: error?.response?.status, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN });
				throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating experian token");
			}
		}
	}

	async saveExperianToken(token : ExperianTokenResponse): Promise<void> {
		this.logger.info({ message: `Updating ${this.experianTokenTableName} with new Experian token` });

		const putExperianTokenCommand = new PutCommand({
			TableName: this.experianTokenTableName,
			Item: { 
				id: "1",
				issued_at: token.issued_at,
				expires_in: token.expires_in,
				token_type: token.token_type,
				access_token: token.access_token,
				refresh_token: token.refresh_token,
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
		this.logger.debug("Fetching Experian token from table " + this.experianTokenTableName);
		const getExperianTokenCommand = new GetCommand({
			TableName: this.experianTokenTableName,
			Key: {
				id: "1",
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
		if (token.Item 
			&& Date.now() < parseInt(token.Item.issued_at) + twentyFiveMinutesInMillis) {
			return token.Item as ExperianTokenResponse;
			
		} 
    	return undefined; 
	}
}

