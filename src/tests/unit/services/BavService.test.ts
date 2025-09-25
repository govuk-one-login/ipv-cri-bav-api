 
 
 
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { BavService } from "../../../services/BavService";
import { createDynamoDbClient } from "../../../utils/DynamoDBFactory";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { createSqsClient } from "../../../utils/SqsClient";
import { TxmaEvent } from "../../../utils/TxmaEvent";
import { ISessionItem } from "../../../models/ISessionItem";
import { absoluteTimeNow } from "../../../utils/DateTimeUtils";
import { personIdentityInputRecord, personIdentityOutputRecord } from "../data/personIdentity-records";
import { AuthSessionState } from "../../../models/enums/AuthSessionState";
import { PersonIdentityItem } from "../../../models/PersonIdentityItem";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

let bavService: BavService;
const tableName = "SESSIONTABLE";
const sessionId = "SESSIONID";
const clientId = "ipv-core-stub";
const fakeTime = 1684933200.123;
import SAMPLE_SESSION_RECORD  from "../data/db_record.json"
import SAMPLE_PERSON_IDENTITY_RECORD from "../data/person_identity_record.json"

let SESSION_RECORD: ISessionItem;
let PERSON_IDENTITY_RECORD: PersonIdentityItem;

const logger = mock<Logger>();
const mockDynamoDbClient = jest.mocked(createDynamoDbClient());
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => "randomId",
}));
jest.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: jest.fn(),
    SendMessageCommand: jest.fn(),
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
	...jest.requireActual("@aws-sdk/lib-dynamodb"),
	UpdateCommand: jest.fn().mockImplementation(() => {}),
}));

function createBaseTXMAEventPayload(): TxmaEvent {
	return {
		event_name: "BAV_CRI_START",
		user: {
			user_id: "sessionCliendId",
			session_id: "sessionID",
			govuk_signin_journey_id: "clientSessionId",
			ip_address: "sourceIp",
		},
		timestamp: 123,
		event_timestamp_ms: 123000,
		component_id: "issuer",
	}
}

describe("BAV Service", () => {
	let txmaEventPayload: TxmaEvent;
	let mockSend: jest.Mock;

	beforeAll(async () => {
		txmaEventPayload = createBaseTXMAEventPayload();

		SESSION_RECORD = await SAMPLE_SESSION_RECORD as ISessionItem;
		PERSON_IDENTITY_RECORD = await SAMPLE_PERSON_IDENTITY_RECORD as PersonIdentityItem;
	});

	beforeEach(() => {
		jest.resetAllMocks();
		jest.restoreAllMocks();
		
		bavService = BavService.getInstance(tableName, logger, mockDynamoDbClient);
		jest.useFakeTimers();
		jest.setSystemTime(new Date(fakeTime * 1000)); // 2023-05-24T13:00:00.123Z
		mockSend = jest.fn();
		(SQSClient as jest.Mock).mockImplementation(() => ({
			send: mockSend,
		}));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("#getSessionById", () => {
		it("Should return a session item when passed a valid session Id", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: SESSION_RECORD });
			const result = await bavService.getSessionById(sessionId);
			expect(result).toEqual({ clientId: "ipv-core-stub", "sessionId": "SESSIONID" });
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

	describe("#getPersonIdentityBySessionId", () => {
		it("Should return a person identity item when passed a valid session Id", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: PERSON_IDENTITY_RECORD });
			const result = await bavService.getPersonIdentityBySessionId(sessionId);
			expect(result).toEqual(PERSON_IDENTITY_RECORD);
		});
	
		it("Should return undefined when session doesn't exist", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			await expect(bavService.getPersonIdentityBySessionId("1234")).resolves.toBeUndefined();
		});
	});

	describe("#sendToTXMA", () => {
		it("Should send event to TxMA with the correct details for a payload with restricted present", async () => {  
			await bavService.sendToTXMA("TXMA_QUEUE_URL", txmaEventPayload, "ABCDEFG");
	
			const messageBody = JSON.stringify({
				...createBaseTXMAEventPayload(),
				restricted: {
					device_information: {
						encoded: "ABCDEFG",
					},
				},
			});
	
			expect(SendMessageCommand).toHaveBeenCalledWith({
				MessageBody: messageBody,
				QueueUrl: "TXMA_QUEUE_URL",
			});
			expect(createSqsClient().send).toHaveBeenCalled();
			expect(bavService.logger.info).toHaveBeenCalledWith("Sent message to TxMA");
		});

		it("Should send event to TxMA with the correct details for a payload without restricted present", async () => {  
			const restrictedDetails = {
				CoP_request_details: [{
					name: "Frederick Joseph Flintstone",
					sortCode: "111111",
					accountNumber: "111111",
					attemptNum: 1,
				}],
				device_information: {
					encoded: "ABCDEFG",
				},
			};
	
			const payload = createBaseTXMAEventPayload();
			payload.restricted = restrictedDetails;
	
			await bavService.sendToTXMA("TXMA_QUEUE_URL", payload, "ABCDEFG");
	
			const messageBody = JSON.stringify(payload);
	
			expect(SendMessageCommand).toHaveBeenCalledWith({
				MessageBody: messageBody,
				QueueUrl: "TXMA_QUEUE_URL",
			});
			expect(createSqsClient().send).toHaveBeenCalled();
			expect(bavService.logger.info).toHaveBeenCalledWith("Sent message to TxMA");
		});

		it("Should send event to TxMA without encodedHeader if encodedHeader is empty string", async () => {  
			await bavService.sendToTXMA("TXMA_QUEUE_URL", txmaEventPayload);
	
			const messageBody = JSON.stringify({
				...createBaseTXMAEventPayload(),
				restricted: {
					device_information: {
						encoded: "ABCDEFG",
					},
				},
			});
	
			expect(SendMessageCommand).toHaveBeenCalledWith({
				MessageBody: messageBody,
				QueueUrl: "TXMA_QUEUE_URL",
			});
			expect(createSqsClient().send).toHaveBeenCalled();
			expect(bavService.logger.info).toHaveBeenCalledWith("Sent message to TxMA");
		});

		it("show log error if failed to send to TXMA queue", async () => {
			mockSend.mockRejectedValueOnce("Simulated SQS error");
			await bavService.sendToTXMA("TXMA_QUEUE_URL", txmaEventPayload, "ABCDEFG");
	
			expect(logger.error).toHaveBeenCalledWith({
				"message": "Error when sending event BAV_CRI_START to TXMA Queue",
    			"messageCode": "FAILED_TO_WRITE_TXMA",
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
						clientId,
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

	describe("#getPersonIdentityById", () => {
		it("Should return a person identity item when passed a valid session Id", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: personIdentityOutputRecord });
			const result = await bavService.getPersonIdentityById(sessionId);
			expect(result).toEqual(personIdentityOutputRecord);
		});
	
		it("Should return undefined when person identity doesn't exist", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			await expect(bavService.getPersonIdentityById(sessionId)).resolves.toBeUndefined();
		});

		it("Should throw an error when person identity expiry date has passed", async () => {
			const expiredSession = {
				...personIdentityOutputRecord,
				expiryDate: absoluteTimeNow() - 500,
			};
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: expiredSession });
			await expect(bavService.getPersonIdentityById(sessionId)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.UNAUTHORIZED,
				message: `Session with session id: ${sessionId} has expired`,
			}));
			expect(logger.error).toHaveBeenCalledWith({ message: `Session with session id: ${sessionId} has expired`, messageCode: MessageCodes.EXPIRED_SESSION });
		});

		it("Should throw an error when DB call fails", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValue("Error!");
			await expect(bavService.getPersonIdentityById(sessionId)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "Error retrieving record",
			}));
			expect(logger.error).toHaveBeenCalledWith({
				message: "getPersonIdentityById - failed executing get from dynamodb",
				messageCode: MessageCodes.FAILED_FETCHING_PERSON_IDENTITY,
				error: "Error!",
			});
		});
	});

	describe("#updateAccountDetails", () => {
		const accountNumber = "12345678";
		const sortCode = "123456";

		it("saves account information to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.updateAccountDetails({ sessionId, accountNumber, sortCode });

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression: "SET accountNumber = :accountNumber, sortCode = :sortCode",
				ExpressionAttributeValues: {
					":accountNumber": accountNumber,
					":sortCode": sortCode,
				},
			});
		});

		it("returns an error when account information cannot be saved to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce("Error!");

			await expect(bavService.updateAccountDetails({ sessionId, accountNumber, sortCode }))
				.rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.SERVER_ERROR,
					message: "Error updating record",
				}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Error updating record with account details", messageCode: MessageCodes.FAILED_UPDATING_PERSON_IDENTITY, error: "Error!" });
		});
	});

	describe("#saveCopCheckResult", () => {
		const copCheckResult = "FULL_MATCH";

		it("saves account information to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.saveCopCheckResult(sessionId, copCheckResult, 1);

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression: "SET copCheckResult = :copCheckResult, authSessionState = :authSessionState, attemptCount = :attemptCount",
				ExpressionAttributeValues: {
					":copCheckResult": copCheckResult,
					":attemptCount": 1,
					":authSessionState": AuthSessionState.BAV_DATA_RECEIVED,
				},
			});
		});

		it("saves account information to dynamo without attemptCount", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.saveCopCheckResult(sessionId, copCheckResult, undefined);

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression: "SET copCheckResult = :copCheckResult, authSessionState = :authSessionState",
				ExpressionAttributeValues: {
					":copCheckResult": copCheckResult,
					":authSessionState": AuthSessionState.BAV_DATA_RECEIVED,
				},
			});
		});

		it("returns an error when account information cannot be saved to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce("Error!");

			await expect(bavService.saveCopCheckResult(sessionId, copCheckResult)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "saveCopCheckResult failed: got error saving copCheckResult",
			}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Got error saving copCheckResult", messageCode: MessageCodes.FAILED_UPDATING_SESSION, error: "Error!" });
		});
	});

	describe("#saveVendorUuid", () => {
		const vendorUuid = "vendorUuid";

		it("saves account information to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.saveVendorUuid(sessionId, vendorUuid);

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression: "SET vendorUuid = :vendorUuid",
				ExpressionAttributeValues: {
					":vendorUuid": vendorUuid,
				},
			});
		});

		it("returns an error when account information cannot be saved to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce("Error!");

			await expect(bavService.saveVendorUuid(sessionId, vendorUuid)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "saveVendorUuid failed: got error saving vendorUuid",
			}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Got error saving vendorUuid", messageCode: MessageCodes.FAILED_UPDATING_SESSION, error: "Error!" });
		});
	});

	describe("#saveExperianCheckResult", () => {
		const experianCheckResultFullMatch = "FULL_MATCH";
		const experianCheckResultNoMatch = "NO_MATCH";

		const warningsError2 = [{
			responseType: "warning",
			responseCode: "2",
			responseMessage: "Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid",
		}];
		
		it("saves account information to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.saveExperianCheckResult(sessionId, { expRequestId: "1234568", personalDetailsScore: 9, warningsErrors: undefined, outcome: "CONTINUE" }, experianCheckResultFullMatch, 1);

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression: "SET experianCheckResult = :experianCheckResult, personalDetailsScore = :personalDetailsScore,  authSessionState = :authSessionState, attemptCount = :attemptCount",
				ExpressionAttributeValues: {
					":experianCheckResult": experianCheckResultFullMatch,
					":personalDetailsScore": 9,
					":authSessionState": AuthSessionState.BAV_DATA_RECEIVED,
					":attemptCount": 1,
				},
			});
		});

		it("saves account information to dynamo without attemptCount", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.saveExperianCheckResult(sessionId, { expRequestId: "1234568", personalDetailsScore: 9, warningsErrors: undefined, outcome: "continue" }, experianCheckResultFullMatch, undefined);

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression: "SET experianCheckResult = :experianCheckResult, personalDetailsScore = :personalDetailsScore,  authSessionState = :authSessionState",
				ExpressionAttributeValues: {
					":experianCheckResult": experianCheckResultFullMatch,
					":personalDetailsScore": 9,
					":authSessionState": AuthSessionState.BAV_DATA_RECEIVED,
				},
			});
		});

		it("saves account information to dynamo with responseCode if present", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});

			await bavService.saveExperianCheckResult(sessionId, { expRequestId: "1234568", personalDetailsScore: 1, warningsErrors: warningsError2, outcome: "REFER" }, experianCheckResultNoMatch, 1);

			expect(UpdateCommand).toHaveBeenCalledWith({
				TableName: tableName,
				Key: { sessionId },
				UpdateExpression: "SET experianCheckResult = :experianCheckResult, personalDetailsScore = :personalDetailsScore,  authSessionState = :authSessionState, attemptCount = :attemptCount",
				ExpressionAttributeValues: {
					":experianCheckResult": experianCheckResultNoMatch,
					":personalDetailsScore": 1,
					":authSessionState": AuthSessionState.BAV_DATA_RECEIVED,
					":attemptCount": 1,
				},
			});
		});

		it("returns an error when account information cannot be saved to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce("Error!");

			await expect(bavService.saveExperianCheckResult(sessionId, { expRequestId: "1234568", personalDetailsScore: 9, warningsErrors: undefined, outcome: "CONTINUE" }, experianCheckResultFullMatch, undefined)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "saveExperianCheckResult failed: got error saving experianCheckResult",
			}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Got error saving experianCheckResult", messageCode: MessageCodes.FAILED_UPDATING_SESSION, error: "Error!" });
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

			expect(UpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
				ExpressionAttributeValues: {
					":accessTokenExpiryDate": 12345,
					":authSessionState": AuthSessionState.BAV_ACCESS_TOKEN_ISSUED,
				},
				Key: {
					sessionId: "SESSID",
				},
				TableName: tableName,
				UpdateExpression: "SET authSessionState = :authSessionState, accessTokenExpiryDate = :accessTokenExpiryDate REMOVE authorizationCode",
			}));
		});

		it("should update session auth state", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			await bavService.updateSessionAuthState("SESSID", "AUTH_STATE");			

			expect(UpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
				ExpressionAttributeValues: {
					":authSessionState": "AUTH_STATE",
				},
				Key: {
					sessionId: "SESSID",
				},
				TableName: tableName,
				UpdateExpression: "SET authSessionState = :authSessionState",
			}));
		});
	});

	describe("obfuscateJSONValues", () => {
		it("should obfuscate all fields except those in txmaFieldsToShow", async () => {
			const inputObject = {
				field1: "sensitive1",
				field2: "sensitive2",
				field3: "non-sensitive",
				nested: {
					field4: "sensitive3",
					field5: "non-sensitive",
					field6: null,
					field7: undefined,
				},
			};
	
			const txmaFieldsToShow = ["field3", "field5"];
	
			const obfuscatedObject = await bavService.obfuscateJSONValues(inputObject, txmaFieldsToShow);
	
			// Check that sensitive fields are obfuscated and non-sensitive fields are not
			expect(obfuscatedObject.field1).toBe("***");
			expect(obfuscatedObject.field2).toBe("***");
			expect(obfuscatedObject.field3).toBe("non-sensitive");
			expect(obfuscatedObject.nested.field4).toBe("***");
			expect(obfuscatedObject.nested.field5).toBe("non-sensitive");
			expect(obfuscatedObject.nested.field6).toBeNull();
			expect(obfuscatedObject.nested.field7).toBeUndefined();
		});
	
		it("should handle arrays correctly", async () => {
			const inputObject = {
				field1: "sensitive1",
				arrayField: [
					{
						field2: "sensitive2",
						field3: "non-sensitive",
					},
					{
						field2: "sensitive3",
						field3: "non-sensitive",
					},
				],
			};
	
			const txmaFieldsToShow = ["field3"];
	
			const obfuscatedObject = await bavService.obfuscateJSONValues(inputObject, txmaFieldsToShow);
	
			// Check that sensitive fields are obfuscated and non-sensitive fields are not
			expect(obfuscatedObject.field1).toBe("***");
			expect(obfuscatedObject.arrayField[0].field2).toBe("***");
			expect(obfuscatedObject.arrayField[0].field3).toBe("non-sensitive");
			expect(obfuscatedObject.arrayField[1].field2).toBe("***");
			expect(obfuscatedObject.arrayField[1].field3).toBe("non-sensitive");
		});
	
		it("should obfuscate values of different types", async () => {
			const inputObject = {
				stringField: "sensitive-string",
				numberField: 42,
				booleanField: true,
			};
	
			const txmaFieldsToShow: string[] | undefined = [];
	
			const obfuscatedObject = await bavService.obfuscateJSONValues(inputObject, txmaFieldsToShow);
	
			// Check that all fields are obfuscated
			expect(obfuscatedObject.stringField).toBe("***");
			expect(obfuscatedObject.numberField).toBe("***");
			expect(obfuscatedObject.booleanField).toBe("***");
		});
	
		it('should return "***" for non-object input', async () => {
			const input = "string-input";
	
			const obfuscatedValue = await bavService.obfuscateJSONValues(input);
	
			// Check that non-object input is obfuscated as '***'
			expect(obfuscatedValue).toBe("***");
		});
	});
});
