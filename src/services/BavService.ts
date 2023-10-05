import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { Logger } from "@aws-lambda-powertools/logger";
import { DynamoDBDocument, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { ISessionItem } from "../models/ISessionItem";
import { MessageCodes } from "../models/enums/MessageCodes";
import { AppError } from "../utils/AppError";
import { absoluteTimeNow } from "../utils/DateTimeUtils";
import { sqsClient } from "../utils/SqsClient";
import { TxmaEvent } from "../utils/TxmaEvent";

// TODO add tests
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

	async getSessionById(sessionId: string, tableName: string = this.tableName): Promise<ISessionItem | undefined> {
		this.logger.debug("Table name " + tableName);
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
				error });
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

	async sendToTXMA(event: TxmaEvent): Promise<void> {
		try {
			const messageBody = JSON.stringify(event);
			const params = {
				MessageBody: messageBody,
				QueueUrl: process.env.TXMA_QUEUE_URL,
			};

			this.logger.info({ message: "Sending message to TxMA", eventName: event.event_name });

			await sqsClient.send(new SendMessageCommand(params));
			this.logger.info("Sent message to TxMA");
		} catch (error) {
			this.logger.error({ message: "Error when sending message to TXMA Queue", error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "sending event to txma queue - failed ");
		}
	}

	async savePersonIdentity(
		sharedClaims: SharedClaimsPersonIdentity,
		sessionId: string,
	): Promise<void> {
		const personIdentityItem = this.createPersonIdentityItem(
			sharedClaims,
			sessionId,
		);

		const putSessionCommand = new PutCommand({
			TableName: process.env.PERSON_IDENTITY_TABLE_NAME,
			Item: personIdentityItem,
		});
		await this.dynamo.send(putSessionCommand);
		return putSessionCommand?.input?.Item?.sessionId;
	}

	async createAuthSession(session: ISessionItem): Promise<void> {
		const putSessionCommand = new PutCommand({
			TableName: this.tableName,
			Item: session,
		});

		this.logger.info({ message: "Saving session data in DynamoDB" });
		try {
			await this.dynamo.send(putSessionCommand);
			this.logger.info("Successfully created session in dynamodb");
		} catch (error) {
			this.logger.error("got error " + error);
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "saveItem - failed " );
		}
	}

	// TODO give this a good old test
	async generateSessionId(count = 1): Promise<string> {
  	const sessionId: string = randomUUID();

  	if (await this.getSessionById(sessionId) && count < 3) {
  		this.logger.info("Session ID already exists in database, generating another");
			return this.generateSessionId();
  	} else if (count > 3) {
			this.logger.error("Failed to generate unique sessionId");
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Failed to generate unique sessionId" );
		} else {
			return sessionId;
		}

	}
}
