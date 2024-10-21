/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import { ExperianService } from "../../../services/ExperianService";
import { mock } from "jest-mock-extended";
import { createDynamoDbClient } from "../../../utils/DynamoDBFactory";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import axios, { AxiosRequestConfig } from "axios";
import { Constants } from "../../../utils/Constants";
import { AppError } from "../../../utils/AppError";
import { MessageCodes } from "../../../models/enums/MessageCodes";

let experianServiceTest: ExperianService;
const experianBaseUrl = process.env.EXPERIAN_BASE_URL!;
const mockDynamoDbClient = jest.mocked(createDynamoDbClient());
const experianTokenTableName = "EXPERIANSTOKENTABLE";
const logger = mock<Logger>();

jest.spyOn(Date, "now").mockReturnValue(1728637200000); // 11/10/2024 09:00:00.000
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => "randomId",
}));

import { experianVerifyResponse, 
	experianVerifyResponseError2, 
	experianVerifyResponseError3, 
	experianVerifyResponseError6, 
	experianVerifyResponseError7,
	experianVerifyResponseError11,
	experianVerifyResponseError12 } from "../data/experianEvents";

const experianTokenResponse = {
	"issued_at" : "1728637200000",
	"expires_in" : "1800",
	"token_type" : "Bearer",
	"access_token" : "TOKEN",
	"refresh_token" : "123456789123456789",
};

// refresh_token field is not stored in DynamoDB
const storedExperianToken = {
	"issued_at" : "1728637200000",
	"expires_in" : "1800",
	"token_type" : "Bearer",
	"access_token" : "TOKEN",
};

const expiredToken = {
	...storedExperianToken,
	issued_at: "1728631800000", // 11/10/2024 08:30:00.000
};

const clientUsername = "123456";
const clientPassword = "12345678";
const clientId = "clientId";
const clientSecret = "Test";
const experianTokenSsmPath = "dev/Experian/TOKEN";

describe("Experian service", () => {
	
	beforeAll(() => {
		experianServiceTest = new ExperianService(logger, experianBaseUrl, 2, mockDynamoDbClient, experianTokenTableName);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("#verify", () => {
		const accountNumber = "12345678";
		const sortCode = "123456";
		const name = "Test Testing";
		const uuid = "uuid";
		

		it("calls Experian verify endpoint with correct params and headers", async () => {
			const endpoint = `${experianServiceTest.experianBaseUrl}/${Constants.EXPERIAN_VERIFY_ENDPOINT_PATH}`;
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: experianVerifyResponse });
			// mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: storedExperianToken });

			const response = await experianServiceTest.verify({ accountNumber, sortCode, name, uuid },
				clientUsername,
				clientPassword,
				clientId,
				clientSecret,
			);

			// expect(logger.info).toHaveBeenNthCalledWith(1, {message: "Checking EXPERIANSTOKENTABLE for valid token"});
			// expect(logger.info).toHaveBeenNthCalledWith(2, "Fetching Experian token from table EXPERIANSTOKENTABLE");
			expect(logger.info).toHaveBeenNthCalledWith(1, "Sending verify request to Experian", { uuid, endpoint });
			expect(axios.post).toHaveBeenCalledWith(
				endpoint,
				{	header: {
					tenantId: uuid,
					requestType: "BAVConsumer-Standard",
				  },
				account: { accountNumber, sortCode },
				subject: { name },
				},
				{ 
					headers: {
						"User-Agent": Constants.EXPERIAN_USER_AGENT,
						"Authorization": "Bearer TOKEN",
						"Content-Type":"application/json",
						"Accept":"application/json",
					},
				},
			);
			
			expect(logger.debug).toHaveBeenCalledWith({
				message: "Received response from Experian verify request",
				eventType: experianVerifyResponse.clientResponsePayload.decisionElements[1].auditLogs![0].eventType,
				eventOutcome: experianVerifyResponse.clientResponsePayload.decisionElements[1].auditLogs![0].eventOutcome,
			});
			expect(response).toBe(9);
		});

		it.each([
			{ errorResponse: experianVerifyResponseError2, expectedMessage: "Response code 2: Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid" },
			{ errorResponse: experianVerifyResponseError3, expectedMessage: "Response code 3: Account number does not use a modulus check algorithm and therefore Bank Wizard cannot confirm the details are valid" },
		  ])("returns correct logger response in case of Experian response", async ({ errorResponse, expectedMessage }) => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: errorResponse });
		  
			await experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, clientUsername,
				clientPassword,
				clientId,
				clientSecret);
		  
			expect(logger.warn).toHaveBeenCalledWith({ message: expectedMessage });
		  });

		it.each([
			{ errorResponse: experianVerifyResponseError6, expectedMessage: "Response code 6: Bank or branch code is not in use" },
			{ errorResponse: experianVerifyResponseError7, expectedMessage: "Response code 7: Modulus check has failed. Although the formats of the supplied fields are correct, one or more of them are incorrect" },
			{ errorResponse: experianVerifyResponseError11, expectedMessage: "Response code 11: Sort Code has been closed" },
			{ errorResponse: experianVerifyResponseError12, expectedMessage: "Response code 12: Branch has been transferred and the accounts have been redirected to another branch" },
		  ])("returns correct logger response in case of Experian response", async ({ errorResponse, expectedMessage }) => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: errorResponse });
		  
			await experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, clientUsername,
				clientPassword,
				clientId,
				clientSecret);
		  
			expect(logger.error).toHaveBeenCalledWith({ message: expectedMessage });
		  });

	});

	describe("#experianToken", () => {

		describe("#checkExperianToken", () => {
				it("should return true if token is valid", () => {
			const result = experianServiceTest.checkExperianToken(storedExperianToken);
			expect(result).toBe(true);
				});

				it("should return false if token is invalid", () => {
					const result = experianServiceTest.checkExperianToken(expiredToken);
					expect(result).toBe(false);
			});
		});

		describe("#saveExperianToken", () => {
			it("should save Experian token with Id = 1 and without 'refresh_token' value", async () => {
				mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
				await experianServiceTest.saveExperianToken(experianTokenResponse);
				expect(mockDynamoDbClient.send).toHaveBeenCalledWith(expect.objectContaining({
					input: {
						Item: {
							"id": "1",
							...storedExperianToken,
						},
						TableName: experianTokenTableName,
					},
				}));
			});

			it("should handle error when sending message to dynamo", async () => {
				mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});
				await expect(experianServiceTest.saveExperianToken(experianTokenResponse)).rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.SERVER_ERROR,
					message: "Error storing new Experian token",
				}));
			});
		});

		describe("#getExperianToken", () => {
			it("should retrieve Experian token", async () => {
				mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: storedExperianToken });
				const result = await experianServiceTest.getExperianToken();
				expect(result).toEqual(storedExperianToken);
			});

			it("should handle error when sending message to dynamo", async () => {
				mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});
				await expect(experianServiceTest.getExperianToken()).rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.SERVER_ERROR,
					message: "Error retrieving Experian token",
				}));
			});
		});

		describe("#generateExperianToken", () => {

			const expectedParams = {
				username: clientUsername,
				password: clientPassword,
				client_id: clientId,
				client_secret: clientSecret,
			};

			const config: AxiosRequestConfig<any> = {
				headers: {
					"Content-Type": "application/json",
					"X-Correlation-Id": "randomId",
					"X-User-Domain": "cabinetofficegds.com",
				},
			};

			it("Should return a valid access token response if a valid access token already exists", async () => {
				experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(storedExperianToken);
				const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret);
				expect(data).toBe(storedExperianToken);
			});

			it("Should generate a new access token if a valid access token does not exist", async () => {
				experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(expiredToken);
				jest.spyOn(axios, "post").mockResolvedValueOnce({ data: experianTokenResponse });
				const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret);
				expect(axios.post).toHaveBeenCalledWith(`${experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`,
					expectedParams,
					config,
				);
				expect(data).toBe(experianTokenResponse);
			});

			it("Should return existing access token if call to Experian token endpoint fails", async () => {
				const error = {
					response: {
						status: 400, message: "Bad request",
					},
				};

				experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(expiredToken);
				jest.spyOn(axios, "post").mockRejectedValueOnce(error);
				const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret);
				expect(axios.post).toHaveBeenCalledWith(`${experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`, expectedParams, config);
				expect(data).toBe(expiredToken);
				expect(logger.error).toHaveBeenCalledWith(
					{ message: "Error generating experian token", statusCode: 400, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN },
				);
			});
		});
	});

});

