/* eslint-disable @typescript-eslint/unbound-method */
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { BavService } from "../../../services/BavService";
import { createDynamoDbClient } from "../../../utils/DynamoDBFactory";
import { AuthSessionState } from "../../../models/enums/AuthSessionState";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { sqsClient } from "../../../utils/SqsClient";
import { TxmaEvent } from "../../../utils/TxmaEvent";
import { absoluteTimeNow } from "../../../utils/DateTimeUtils";
import { personIdentityInputRecord, personIdentityOutputRecord } from "../data/personIdentity-records";
import { AuthSessionState } from "../../../models/enums/AuthSessionState";


let bavService: BavService;
const tableName = "SESSIONTABLE";
const sessionId = "SESSIONID";
const fakeTime = 1684933200.123;
const SESSION_RECORD = require("../data/db_record.json");

const logger = mock<Logger>();
const mockDynamoDbClient = jest.mocked(createDynamoDbClient());
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => "randomId",
}));
jest.mock("@aws-sdk/client-sqs", () => ({
	SendMessageCommand: jest.fn().mockImplementation(() => {}),
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
	...jest.requireActual("@aws-sdk/lib-dynamodb"),
	UpdateCommand: jest.fn().mockImplementation(() => {}),
}));
jest.mock("../../../utils/SqsClient", () => ({
	sqsClient: {
		send: jest.fn(),
	},
}));

function getTXMAEventPayload(): TxmaEvent {
	const txmaEventPayload: TxmaEvent = {
		event_name: "BAV_CRI_START",
		user: {
			user_id: "sessionCliendId",
			persistent_session_id: "sessionPersistentSessionId",
			session_id: "sessionID",
			govuk_signin_journey_id: "clientSessionId",
			ip_address: "sourceIp",
		},
		client_id: "clientId",
		timestamp: 123,
		component_id: "issuer",
	};
	return txmaEventPayload;
}

describe("BAV Service", () => {
	let txmaEventPayload: TxmaEvent;

	beforeAll(() => {
		txmaEventPayload = getTXMAEventPayload();
	});

	beforeEach(() => {
		jest.resetAllMocks();
		bavService = BavService.getInstance(tableName, logger, mockDynamoDbClient);
		jest.useFakeTimers();
		jest.setSystemTime(new Date(fakeTime * 1000)); // 2023-05-24T13:00:00.123Z
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("#getSessionById", () => {
		it("Should return a session item when passed a valid session Id", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: SESSION_RECORD });
			const result = await bavService.getSessionById(sessionId);
			expect(result).toEqual({ sessionId });
		});
	
		it("Should return undefined when session doesn't exist", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			await expect(bavService.getSessionById("1234")).resolves.toBeUndefined();
		});

		it("Should throw an error when session expiry date has passed", async () => {
			const expiredSession = {
				...SESSION_RECORD,
				expiryDate: absoluteTimeNow() - 500,
			};
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: expiredSession });
			await expect(bavService.getSessionById("1234")).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.UNAUTHORIZED,
				message: "Session with session id: 1234 has expired",
			}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Session with session id: 1234 has expired" }, { messageCode: "EXPIRED_SESSION" });
		});
	});

	describe("#sendToTXMA", () => {
		it("Should send event to TxMA with the correct details", async () => {
			const messageBody = JSON.stringify(txmaEventPayload);

			await bavService.sendToTXMA("MYQUEUE", txmaEventPayload);

			expect(SendMessageCommand).toHaveBeenCalledWith({
				MessageBody: messageBody,
				QueueUrl: "MYQUEUE",
			});
			expect(sqsClient.send).toHaveBeenCalled();
			expect(bavService.logger.info).toHaveBeenCalledWith("Sent message to TxMA");
		});

		it("show log error if failed to send to TXMA queue", async () => {
			sqsClient.send.mockRejectedValueOnce({});
			await bavService.sendToTXMA("MYQUEUE", txmaEventPayload);
	
			expect(bavService.logger.error).toHaveBeenCalledWith({
				message: "Error when sending event BAV_CRI_START to TXMA Queue",
				messageCode: MessageCodes.FAILED_TO_WRITE_TXMA,
			});
		});
	});

	describe("#createAuthSession", () => {
		it("should create auth session", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			await bavService.createAuthSession(SESSION_RECORD);
			expect(mockDynamoDbClient.send).toHaveBeenCalledWith(expect.objectContaining({
				input: {
					Item: {
						sessionId,
					},
					TableName: tableName,
				},
			}));
		});

		it("should handle error when sending message to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});
			await expect(bavService.createAuthSession(SESSION_RECORD)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "Failed to save auth session data",
			}));
		});
	});

	describe("#savePersonIdentity", () => {
		it("should create and save a PersonIdentity record", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
	
			await bavService.savePersonIdentity({
				sharedClaims: personIdentityInputRecord,
				sessionId: "1234",
				tableName: "SESSIONTABLE",
				authSessionTtlInSecs: "950400",
			});
	
			expect(mockDynamoDbClient.send).toHaveBeenCalledWith(expect.objectContaining({
				clientCommand: expect.objectContaining({
					input: expect.objectContaining({
						Item: expect.objectContaining(personIdentityOutputRecord),
					}),
				}),
			}));
		});

		it("should add createdDate and expiryDate to a PersonIdentity record", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
	
			await bavService.savePersonIdentity({
				sharedClaims: personIdentityInputRecord,
				sessionId: "1234",
				tableName: "SESSIONTABLE",
				authSessionTtlInSecs: "950400",
			});
	
			expect(mockDynamoDbClient.send).toHaveBeenCalledWith(expect.objectContaining({
				clientCommand: expect.objectContaining({
					input: expect.objectContaining({
						Item: expect.objectContaining({
							expiryDate: Math.floor(fakeTime + +"950400"),
							createdDate: Math.floor(fakeTime),
						}),
					}),
				}),
			}));
		});

		it("should handle error when sending message to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});

			await expect(bavService.savePersonIdentity({
				sharedClaims: personIdentityInputRecord,
				sessionId: "1234",
				tableName: "SESSIONTABLE",
				authSessionTtlInSecs: "950400",
			})).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "Failed to save personal identity information",
			}));
		});
	});

	describe("#setAuthorizationCode", () => {
		const authorizationCode = "AUTH_CODE";

		it("saves authorization code information to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.setAuthorizationCode(sessionId, authorizationCode);

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression:
				"SET authorizationCode=:authCode, authorizationCodeExpiryDate=:authCodeExpiry, authSessionState = :authSessionState",
				ExpressionAttributeValues: {
					":authCode": authorizationCode,
					":authCodeExpiry": 1684933800123,
					":authSessionState": AuthSessionState.BAV_AUTH_CODE_ISSUED,
				},
			});
		});

		it("returns an error when authorization code information cannot be saved to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});

			await expect(bavService.setAuthorizationCode(sessionId, authorizationCode)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "Error updating authorizationCode in dynamodb",
			}));
		});
	});

	describe("#updateSessionWithAccessTokenDetails", () => {
		it("should throw 500 if request fails during update Session data with access token details", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});
	
			await expect(bavService.updateSessionWithAccessTokenDetails("SESSID", 12345)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
			}));
		});

		it("should update Session data with access token details", async () => {			
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			await bavService.updateSessionWithAccessTokenDetails("SESSID", 12345);			

			expect(mockDynamoDbClient.send).toHaveBeenCalledWith(expect.objectContaining({
				clientCommand: expect.objectContaining({
					input: {
						ExpressionAttributeValues: {
							":accessTokenExpiryDate": 12345,
							":authSessionState": AuthSessionState.BAV_ACCESS_TOKEN_ISSUED,
						},
						Key: {
							sessionId: "SESSID",
						},
						TableName: tableName,
						UpdateExpression: "SET authSessionState = :authSessionState, accessTokenExpiryDate = :accessTokenExpiryDate REMOVE authorizationCode",
					},
				}),
			}));
		});

	});

	describe("#generateSessionId", () => {
		it("returns a unique sessionId", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValueOnce({});
			const result = await bavService.generateSessionId();
			expect(result).toBe("randomId");
		});

		it("makes 3 attempts to generate a unique session ID", async () => {
			jest.spyOn(bavService, "generateSessionId");
			mockDynamoDbClient.send = jest.fn().mockResolvedValueOnce({ Item: SESSION_RECORD }).mockResolvedValueOnce({ Item: SESSION_RECORD }).mockResolvedValueOnce({});
			const result = await bavService.generateSessionId();
			expect(result).toBe("randomId");
			expect(bavService.generateSessionId).toHaveBeenCalledTimes(3);
		});

		it("throws an error if unique session ID cannot be generated after 3 attempts", async () => {
			jest.spyOn(bavService, "generateSessionId");
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: SESSION_RECORD });
			await expect(bavService.generateSessionId()).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "Failed to generate unique sessionId",
			}));
			expect(bavService.generateSessionId).toHaveBeenCalledTimes(3);
		});
	});

	describe("#getSessionByAuthorizationCode", () => {
		it("should return undefined when session item is not found by authorization code", async () => {
			mockDynamoDbClient.query = jest.fn().mockResolvedValue({ Items: [] });
	
			await expect(bavService.getSessionByAuthorizationCode("1234")).rejects.toThrow("Error retrieving Session by authorization code");
		});
	
		it("should throw error when multiple session items are found by authorization code", async () => {
			mockDynamoDbClient.query = jest.fn().mockResolvedValue({ Items: [{ sessionId: "SESSID1" }, { sessionId: "SESSID2" }] });
	
			await expect(bavService.getSessionByAuthorizationCode("1234")).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.UNAUTHORIZED,
			}));
			expect(mockDynamoDbClient.query).toHaveBeenCalledWith(expect.objectContaining({
				KeyConditionExpression: "authorizationCode = :authorizationCode",
				ExpressionAttributeValues: {
					":authorizationCode": "1234",
				},
			}));
		});
	
		it("should throw error when session item has expired by authorization code", async () => {
			mockDynamoDbClient.query = jest.fn().mockResolvedValue({
				Items: [{
					sessionId: "SESSID",
					expiryDate: absoluteTimeNow() - 500,
				}],
			});
	
			await expect(bavService.getSessionByAuthorizationCode("1234")).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.UNAUTHORIZED,
			}));
			expect(mockDynamoDbClient.query).toHaveBeenCalledWith(expect.objectContaining({
				KeyConditionExpression: "authorizationCode = :authorizationCode",
				ExpressionAttributeValues: {
					":authorizationCode": "1234",
				},
			}));
		});
	
		it("should return session item when session is found by authorization code", async () => {
			mockDynamoDbClient.query = jest.fn().mockResolvedValue({
				Items: [{
					sessionId: "SESSID",
					expiryDate: absoluteTimeNow() + 500,
				}],
			});
	
			const result = await bavService.getSessionByAuthorizationCode("1234");
			expect(result).toEqual({ sessionId: "SESSID", expiryDate: expect.any(Number) });
			expect(mockDynamoDbClient.query).toHaveBeenCalledWith(expect.objectContaining({
				KeyConditionExpression: "authorizationCode = :authorizationCode",
				ExpressionAttributeValues: {
					":authorizationCode": "1234",
				},
			}));
		});

	});
});
