import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { Logger } from "@aws-lambda-powertools/logger";
import { DynamoDBDocument, GetCommand, PutCommand, QueryCommandInput, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ISessionItem } from "../models/ISessionItem";
import { SharedClaimsPersonIdentity, PersonIdentityItem, PersonIdentityName, PersonIdentityDateOfBirth } from "../models/PersonIdentityItem";
import { AppError } from "../utils/AppError";
import { absoluteTimeNow, getAuthorizationCodeExpirationEpoch } from "../utils/DateTimeUtils";
import { sqsClient } from "../utils/SqsClient";
import { TxmaEvent } from "../utils/TxmaEvent";
import { Constants } from "../utils/Constants";
import { AuthSessionState } from "../models/enums/AuthSessionState";

export class BavService {
	readonly tableName: string;

	private readonly dynamo: DynamoDBDocument;

	readonly logger: Logger;

	private static instance: BavService;

	constructor(tableName: string, logger: Logger, dynamoDbClient: DynamoDBDocument) {
		this.tableName = tableName;
		this.dynamo = dynamoDbClient;
		this.logger = logger;
	}

	static getInstance(tableName: string, logger: Logger, dynamoDbClient: DynamoDBDocument): BavService {
		if (!BavService.instance) {
			BavService.instance = new BavService(tableName, logger, dynamoDbClient);
		}
		return BavService.instance;
	}

	async getSessionById(sessionId: string): Promise<ISessionItem | undefined> {
		this.logger.debug("Table name " + this.tableName);
		const getSessionCommand = new GetCommand({
			TableName: this.tableName,
			Key: {
				sessionId,
			},
		});

		let session;
		try {
			session = await this.dynamo.send(getSessionCommand);
		} catch (error) {
			this.logger.error({ message: "getSessionById - failed executing get from dynamodb:" }, {
				messageCode: MessageCodes.FAILED_FETCHING_SESSION,
			});
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error retrieving Session");
		}

		if (session.Item) {
			if (session.Item.expiryDate < absoluteTimeNow()) {
				this.logger.error({ message: `Session with session id: ${sessionId} has expired` }, { messageCode: MessageCodes.EXPIRED_SESSION });
				throw new AppError(HttpCodesEnum.UNAUTHORIZED, `Session with session id: ${sessionId} has expired`);
			}
			return session.Item as ISessionItem;
		}
	}

	async sendToTXMA(QueueUrl: string, event: TxmaEvent): Promise<void> {
		try {
			const messageBody = JSON.stringify(event);
			const params = {
				MessageBody: messageBody,
				QueueUrl,
			};

			this.logger.info({ message: "Sending message to TxMA", eventName: event.event_name });

			await sqsClient.send(new SendMessageCommand(params));
			this.logger.info("Sent message to TxMA");
		} catch (error) {
			this.logger.error({
				message: `Error when sending event ${event.event_name} to TXMA Queue`,
				messageCode: MessageCodes.FAILED_TO_WRITE_TXMA,
			});
		}
	}

	private mapBirthDate(birthDate: PersonIdentityDateOfBirth[]): PersonIdentityDateOfBirth[] {
		return birthDate?.map((bd) => ({ value: bd.value }));
	}

	private mapNames(name: PersonIdentityName[]): PersonIdentityName[] {
		return name?.map((index) => ({
			nameParts: index?.nameParts?.map((namePart) => ({
				type: namePart.type,
				value: namePart.value,
			})),
		}));
	}

	private createPersonIdentityItem(
		sharedClaims: SharedClaimsPersonIdentity,
		sessionId: string,
		authSessionTtlInSecs: string,
	): PersonIdentityItem {

		return {
			sessionId,
			birthDate: this.mapBirthDate(sharedClaims.birthDate),
			name: this.mapNames(sharedClaims.name),
			expiryDate: absoluteTimeNow() + +authSessionTtlInSecs,
			createdDate: absoluteTimeNow(),
		};
	}

	async savePersonIdentity({
		sharedClaims,
		sessionId,
		tableName,
		authSessionTtlInSecs,
	}: {
		sharedClaims: SharedClaimsPersonIdentity;
		sessionId: string;
		tableName: string;
		authSessionTtlInSecs: string;
	}): Promise<void> {
		const personIdentityItem = this.createPersonIdentityItem(
			sharedClaims,
			sessionId,
			authSessionTtlInSecs,
		);

		const putSessionCommand = new PutCommand({
			TableName: tableName,
			Item: personIdentityItem,
		});

		this.logger.info({ message: "Saving personal identity data in DynamoDB" });

		try {
			await this.dynamo.send(putSessionCommand);
			this.logger.info("Successfully saved personal identity data in DynamoDB");
			return putSessionCommand?.input?.Item?.sessionId;

		} catch (error) {
			this.logger.error({ message: "Failed to save personal identity information", error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Failed to save personal identity information" );
		}
	}

	async createAuthSession(session: ISessionItem): Promise<void> {
		const putSessionCommand = new PutCommand({
			TableName: this.tableName,
			Item: session,
		});

		this.logger.info({ message: "Saving auth session data in DynamoDB" });

		try {
			await this.dynamo.send(putSessionCommand);
			this.logger.info("Successfully saved auth session data in DynamoDB");

		} catch (error) {
			this.logger.error({ message: "Failed to save auth session data", error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Failed to save auth session data");
		}
	}

	async setAuthorizationCode(sessionId: string, authorizationCode: string): Promise<void> {
		const updateSessionCommand = new UpdateCommand({
			TableName: this.tableName,
			Key: { sessionId },
			UpdateExpression:
				"SET authorizationCode=:authCode, authorizationCodeExpiryDate=:authCodeExpiry, authSessionState = :authSessionState",
			ExpressionAttributeValues: {
				":authCode": authorizationCode,
				":authCodeExpiry": getAuthorizationCodeExpirationEpoch(
					process.env.AUTHORIZATION_CODE_TTL,
				),
				":authSessionState": AuthSessionState.BAV_AUTH_CODE_ISSUED,
			},
		});

		this.logger.info("Updating authorizationCode in dynamodb", { tableName: this.tableName });

		try {
			await this.dynamo.send(updateSessionCommand);
			this.logger.info("Updated authorizationCode in dynamodb");
		} catch (error) {
			const message = "Error updating authorizationCode in dynamodb";
			this.logger.error({ message, error, messageCode: MessageCodes.FAILED_SAVING_AUTH_CODE });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, message);
		}
	}

	async generateSessionId(count = 1): Promise<string> {
  	const sessionId: string = randomUUID();
		const existingSession = await this.getSessionById(sessionId);

  	if (existingSession && count < 3) {
  		this.logger.info("Session ID already exists in database, generating another");
			return this.generateSessionId(count + 1);
  	} else if (existingSession && count >= 3) {
			this.logger.error("Failed to generate unique sessionId");
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Failed to generate unique sessionId");
		}
		return sessionId;
	}

	async getSessionByAuthorizationCode(code: string | undefined): Promise<ISessionItem | undefined> {
		const params: QueryCommandInput = {
			TableName: this.tableName,
			IndexName: Constants.AUTHORIZATION_CODE_INDEX_NAME,
			KeyConditionExpression: "authorizationCode = :authorizationCode",
			ExpressionAttributeValues: {
				":authorizationCode": code,
			},
		};

		const sessionItem = await this.dynamo.query(params);

		if (!sessionItem?.Items || sessionItem?.Items?.length !== 1) {
			this.logger.error("Error retrieving Session by authorization code", {
				messageCode: MessageCodes.FAILED_FETCHING_SESSION_BY_AUTH_CODE,
			});
			throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Error retrieving Session by authorization code");
		}

		if (sessionItem.Items[0].expiryDate < absoluteTimeNow()) {
			this.logger.error(`Session with session id: ${sessionItem.Items[0].sessionId} has expired`, {
				messageCode: MessageCodes.EXPIRED_SESSION,
			});
			throw new AppError(HttpCodesEnum.UNAUTHORIZED, `Session with session id: ${sessionItem.Items[0].sessionId} has expired`);
		}

		return sessionItem.Items[0] as ISessionItem;
	}

	async updateSessionWithAccessTokenDetails(sessionId: string, accessTokenExpiryDate: number): Promise<void> {
		const updateAccessTokenDetailsCommand = new UpdateCommand({
			TableName: this.tableName,
			Key: { sessionId },
			UpdateExpression: "SET authSessionState = :authSessionState, accessTokenExpiryDate = :accessTokenExpiryDate REMOVE authorizationCode",
			ExpressionAttributeValues: {
				":authSessionState": AuthSessionState.BAV_ACCESS_TOKEN_ISSUED,
				":accessTokenExpiryDate": accessTokenExpiryDate,
			},
		});

		this.logger.info({ message: "updating Access token details in dynamodb" }, { tableName: this.tableName });
		try {
			await this.dynamo.send(updateAccessTokenDetailsCommand);
			this.logger.info({ message: "updated Access token details in dynamodb" });
		} catch (error) {
			this.logger.error({ message: "got error updating Access token details", error }, { messageCode: MessageCodes.FAILED_UPDATING_SESSION });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "updateItem - failed: got error updating Access token details");
		}
	}
}
