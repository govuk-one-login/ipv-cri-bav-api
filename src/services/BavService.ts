/* eslint-disable max-lines */
import { Logger } from "@aws-lambda-powertools/logger";
import { DynamoDBDocument, GetCommand, PutCommand, QueryCommandInput, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ISessionItem, ExperianCheckResult, CopCheckResult } from "../models/ISessionItem";
import { SharedClaimsPersonIdentity, PersonIdentityItem, PersonIdentityName } from "../models/PersonIdentityItem";
import { AppError } from "../utils/AppError";
import { absoluteTimeNow, getAuthorizationCodeExpirationEpoch } from "../utils/DateTimeUtils";
import { sqsClient } from "../utils/SqsClient";
import { TxmaEvent } from "../utils/TxmaEvent";
import { Constants } from "../utils/Constants";
import { AuthSessionState } from "../models/enums/AuthSessionState";
import { PartialNameSQSRecord } from "../models/IHmrcResponse";
import { SendMessageCommand } from "@aws-sdk/client-sqs";

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
		this.logger.debug("Fetching session from table " + this.tableName);
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

	async getPersonIdentityBySessionId(sessionId: string, tableName: string = this.tableName): Promise<PersonIdentityItem | undefined> {
		this.logger.debug(`Getting person identity from table ${tableName}`);
		const getPersonIdentityCommand = new GetCommand({
			TableName: tableName,
			Key: {
				sessionId,
			},
		});

		let personIdentity;
		try {
			personIdentity = await this.dynamo.send(getPersonIdentityCommand);
		} catch (error) {
			this.logger.error({ message: "getPersonIdentityBySessionId - failed executing get from dynamodb:" }, {
				messageCode: MessageCodes.FAILED_FETCHING_SESSION,
				error,
			});
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error retrieving person identity?");
		}

		if (personIdentity.Item) {
			return personIdentity.Item as PersonIdentityItem;
		}
	}

	async updateSessionAuthState(sessionId: string, authSessionState: string): Promise<void> {
		const updateStateCommand = new UpdateCommand({
			TableName: this.tableName,
			Key: { sessionId },
			UpdateExpression: "SET authSessionState = :authSessionState",
			ExpressionAttributeValues: {
				":authSessionState": authSessionState,
			},
		});

		this.logger.info({ message: "Updating session table with auth state details", updateStateCommand });
		try {
			await this.dynamo.send(updateStateCommand);
			this.logger.info({ message: "Updated auth state details in dynamodb" });
		} catch (error) {
			this.logger.error({ message: "Got error saving auth state details", error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "updateSessionAuthState failed: got error saving auth state details");
		}
	}

	async sendToTXMA(QueueUrl: string, event: TxmaEvent, encodedHeader?: string): Promise<void> {
		try {

			if (encodedHeader) {
				event.restricted = event.restricted ?? { device_information: { encoded: "" } };
				event.restricted.device_information = { encoded: encodedHeader };
			}

			const messageBody = JSON.stringify(event);
			const params = {
				MessageBody: messageBody,
				QueueUrl,
			};

			this.logger.info({ message: "Sending message to TxMA", eventName: event.event_name });

			const obfuscatedObject = await this.obfuscateJSONValues(event, Constants.TXMA_FIELDS_TO_SHOW);
			this.logger.info({ message: "Obfuscated TxMA Event", txmaEvent: JSON.stringify(obfuscatedObject, null, 2) });

			await sqsClient.send(new SendMessageCommand(params));
			this.logger.info("Sent message to TxMA");
		} catch (error) {
			this.logger.error({
				message: `Error when sending event ${event.event_name} to TXMA Queue`,
				messageCode: MessageCodes.FAILED_TO_WRITE_TXMA,
			});
		}
	}

	async savePartialNameInfo(QueueUrl: string, event: PartialNameSQSRecord): Promise<void> {
		try {
			const messageBody = JSON.stringify(event);
			const params = {
				MessageBody: messageBody,
				QueueUrl,
			};

			this.logger.info({ message: "Sending partial name info to SQS" });

			await sqsClient.send(new SendMessageCommand(params));
			this.logger.info("Sent message to PartialName Queue");
		} catch (error) {
			this.logger.error({
				message: "Error when sending event partial name info to SQS Queue",
				messageCode: MessageCodes.FAILED_TO_WRITE_PARTIAL_NAME_INFO,
			});
		}
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
			name: this.mapNames(sharedClaims.name),
			birthDate: sharedClaims.birthDate,
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

	async getPersonIdentityById(sessionId: string, tableName: string = this.tableName): Promise<PersonIdentityItem | undefined> {
		this.logger.debug(`Fetchching person identity from table ${tableName}`);

		const getPersonIdentityCommand = new GetCommand({
			TableName: tableName,
			Key: { sessionId },
		});

		let personInfo;
		try {
			personInfo = await this.dynamo.send(getPersonIdentityCommand);

		} catch (error: any) {
			this.logger.error({
				message: "getPersonIdentityById - failed executing get from dynamodb",
				messageCode: MessageCodes.FAILED_FETCHING_PERSON_IDENTITY,
				error,
			});
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error retrieving record");
		}

		if (personInfo.Item) {
			if (personInfo.Item.expiryDate < absoluteTimeNow()) {
				const message = `Session with session id: ${sessionId} has expired`;
				this.logger.error({ message, messageCode: MessageCodes.EXPIRED_SESSION });
				throw new AppError(HttpCodesEnum.UNAUTHORIZED, message);
			}
			return personInfo.Item as PersonIdentityItem;
		}
	}

	async updateAccountDetails(
		{ sessionId, accountNumber, sortCode }: { sessionId: string; accountNumber: string; sortCode: string },
		tableName = this.tableName,
	): Promise<void> {
		this.logger.info({ message: `Updating ${tableName} with account details` });

		const updateStateCommand = new UpdateCommand({
			TableName: tableName,
			Key: { sessionId },
			UpdateExpression: "SET accountNumber = :accountNumber, sortCode = :sortCode",
			ExpressionAttributeValues: {
				":accountNumber": accountNumber,
				":sortCode": sortCode,
			},
		});

		try {
			await this.dynamo.send(updateStateCommand);
			this.logger.info({ message: "Updated account details" });
		} catch (error) {
			this.logger.error({ message: "Error updating record with account details", messageCode: MessageCodes.FAILED_UPDATING_PERSON_IDENTITY, error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error updating record");
		}
	}

	async saveCopCheckResult(sessionId: string, copCheckResult: CopCheckResult, attemptCount?: number): Promise<void> {
		this.logger.info({ message: `Updating ${this.tableName} table with copCheckResult`, copCheckResult });

		const updateStateCommand = new UpdateCommand({
			TableName: this.tableName,
			Key: { sessionId },
			UpdateExpression: `SET ${copCheckResult ? "copCheckResult = :copCheckResult," : ""} authSessionState = :authSessionState${attemptCount ? ", attemptCount = :attemptCount" : ""}`,
			ExpressionAttributeValues: {
				...(copCheckResult && { ":copCheckResult": copCheckResult }),
				...(attemptCount && { ":attemptCount": attemptCount }),
				":authSessionState": AuthSessionState.BAV_DATA_RECEIVED,
			},
		});

		try {
			await this.dynamo.send(updateStateCommand);
			this.logger.info({ message: "Saved copCheckResult in dynamodb" });
		} catch (error) {
			this.logger.error({ message: "Got error saving copCheckResult", messageCode: MessageCodes.FAILED_UPDATING_SESSION, error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "saveCopCheckResult failed: got error saving copCheckResult");
		}
	}

	async saveExperianCheckResult(sessionId: string, experianCheckResult?: ExperianCheckResult, attemptCount?: number): Promise<void> {
		this.logger.info({ message: `Updating ${this.tableName} table with experianCheckResult`, experianCheckResult });
		const updateStateCommand = new UpdateCommand({
			TableName: this.tableName,
			Key: { sessionId },
			UpdateExpression: `SET ${experianCheckResult ? "experianCheckResult = :experianCheckResult," : ""} authSessionState = :authSessionState${attemptCount ? ", attemptCount = :attemptCount" : ""}`,
			ExpressionAttributeValues: {
				...(experianCheckResult && { ":experianCheckResult": experianCheckResult }),
				...(attemptCount && { ":attemptCount": attemptCount }),
				":authSessionState": AuthSessionState.BAV_DATA_RECEIVED,
			},
		});
		
		try {
			await this.dynamo.send(updateStateCommand);
			this.logger.info({ message: "Saved experianCheckResult in dynamodb" });
		} catch (error) {
			this.logger.error({ message: "Got error saving experianCheckResult", messageCode: MessageCodes.FAILED_UPDATING_SESSION, error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "saveExperianCheckResult failed: got error saving experianCheckResult");
		}
	}

	async saveVendorUuid(sessionId: string, vendorUuid: string): Promise<void> {
		this.logger.info({ message: `Updating ${this.tableName} table with vendorUuid`, vendorUuid });

		const updateStateCommand = new UpdateCommand({
			TableName: this.tableName,
			Key: { sessionId },
			UpdateExpression: "SET vendorUuid = :vendorUuid",
			ExpressionAttributeValues: {
				":vendorUuid": vendorUuid,
			},
		});

		try {
			await this.dynamo.send(updateStateCommand);
			this.logger.info({ message: "Saved vendorUuid in dynamodb" });
		} catch (error) {
			this.logger.error({ message: "Got error saving vendorUuid", messageCode: MessageCodes.FAILED_UPDATING_SESSION, error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "saveVendorUuid failed: got error saving vendorUuid");
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

	async getSessionByAuthorizationCode(code: string): Promise<ISessionItem | undefined> {
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
			this.logger.error(
				{ message: "got error updating Access token details", error },
				{ messageCode: MessageCodes.FAILED_UPDATING_SESSION },
			);
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "updateItem - failed: got error updating Access token details");
		}
	}

	async obfuscateJSONValues(input: any, txmaFieldsToShow: string[] = []): Promise<any> {
		if (typeof input === "object" && input !== null) {
			if (Array.isArray(input)) {
				return Promise.all(input.map((element) => this.obfuscateJSONValues(element, txmaFieldsToShow)));
			} else {
				const obfuscatedObject: any = {};
				for (const key in input) {
					if (Object.prototype.hasOwnProperty.call(input, key)) {
						if (txmaFieldsToShow.includes(key)) {
							obfuscatedObject[key] = input[key];
						} else {
							obfuscatedObject[key] = await this.obfuscateJSONValues(input[key], txmaFieldsToShow);
						}
					}
				}
				return obfuscatedObject;
			}
		} else {
			return input === null || input === undefined ? input : "***";
		}
	}
}
