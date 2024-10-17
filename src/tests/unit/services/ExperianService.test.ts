/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import axios, { AxiosRequestConfig } from "axios";
import { mock } from "jest-mock-extended";
import { experianVerifyResponse, 
	experianVerifyResponseError2, 
	experianVerifyResponseError3, 
	experianVerifyResponseError6, 
	experianVerifyResponseError7,
	experianVerifyResponseError11,
	experianVerifyResponseError12 } from "../data/experianEvents";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { ExperianService } from "../../../services/ExperianService";
import { AppError } from "../../../utils/AppError";
import { Constants } from "../../../utils/Constants";
import { sleep } from "../../../utils/Sleep";
import { createDynamoDbClient } from "../../../utils/DynamoDBFactory";


let experianServiceTest: ExperianService;
const experianBaseUrl = process.env.EXPERIAN_BASE_URL!;
const mockDynamoDbClient = jest.mocked(createDynamoDbClient());
const experianTokenTableName = "EXPERIANSTOKENTABLE";
const logger = mock<Logger>();
const tokenResponse = {
	"access_token": "token",
	"scope": "default",
	"expires_in": 14400,
	"token_type": "bearer",
};

jest.mock(("../../../utils/Sleep"), () => ({
	sleep: jest.fn(),
}));

jest.spyOn(Date, "now").mockReturnValue(1728637200000); // 11/10/2024 09:00:00.000
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => "randomId",
}));

describe("Experian Service", () => {
	beforeAll(() => {
		experianServiceTest = new ExperianService(logger, experianBaseUrl, 2000, 2);
	});

	describe("#verify", () => {
		const accountNumber = "12345678";
		const sortCode = "123456";
		const name = "Test Testing";
		const uuid = "uuid";
		const experianTokenSsmPath = "dev/Experian/TOKEN";

		it("calls Experian verify endpoint with correct params and headers", async () => {
			const endpoint = `${experianServiceTest.experianBaseUrl}/${Constants.EXPERIAN_VERIFY_ENDPOINT_PATH}`;
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: experianVerifyResponse });

			const response = await experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, experianTokenSsmPath);

			expect(logger.info).toHaveBeenCalledWith("Sending verify request to Experian", { uuid, endpoint, retryCount: 0 });
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
						"Authorization": "Bearer dev/Experian/TOKEN",
						"Content-Type":"application/json",
						"Accept":"application/json",
					},
				},
			);
			
			expect(logger.debug).toHaveBeenCalledWith({
				message: "Recieved response from Experian verify request",
				eventType: experianVerifyResponse.clientResponsePayload.decisionElements[1].auditLogs![0].eventType,
				eventOutcome: experianVerifyResponse.clientResponsePayload.decisionElements[1].auditLogs![0].eventOutcome,
			});
			expect(response).toBe(9);
		});

		it("retries verify call with exponential backoff when 500 response is received", async () => {
			const endpoint = `${experianServiceTest.experianBaseUrl}/${Constants.EXPERIAN_VERIFY_ENDPOINT_PATH}`;
			const error = {
				response: {
					status: 500, message: "Server error",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);

			await expect(experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, experianTokenSsmPath)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error sending verify request to Experian"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "Error sending verify request to Experian", messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: 500 },
			);
			expect(axios.post).toHaveBeenCalledTimes(3);
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
						"Authorization": "Bearer dev/Experian/TOKEN",
						"Content-Type":"application/json",
						"Accept":"application/json",
					},
				},
			);
			expect(sleep).toHaveBeenNthCalledWith(1, 2000);
			expect(sleep).toHaveBeenNthCalledWith(2, 4000);
		});

		it("retries verify call with exponential backoff when 429 response is received", async () => {
			const endpoint = `${experianServiceTest.experianBaseUrl}/${Constants.EXPERIAN_VERIFY_ENDPOINT_PATH}`;
			const error = {
				response: {
					status: 429, message: "Server error",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);

			await expect(experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, experianTokenSsmPath)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error sending verify request to Experian"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "Error sending verify request to Experian", messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: 429 },
			);
			expect(axios.post).toHaveBeenCalledTimes(3);
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
						"Authorization": "Bearer dev/Experian/TOKEN",
						"Content-Type":"application/json",
						"Accept":"application/json",
					},
				},
			);
			expect(sleep).toHaveBeenNthCalledWith(1, 2000);
			expect(sleep).toHaveBeenNthCalledWith(2, 4000);
		});

		it("returns error if Experian verify call fails with non 500", async () => {
			const error = {
				response: {
					status: 400, message: "Bad request",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValueOnce(error);

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			await expect(experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, experianTokenSsmPath))
				.rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.SERVER_ERROR,
					message: "Error sending verify request to Experian",
				}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Error sending verify request to Experian", messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: 400 });
			expect(axios.post).toHaveBeenCalledTimes(1);
		});

		it.each([
			{ errorResponse: experianVerifyResponseError2, expectedMessage: "Response code 2: Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid" },
			{ errorResponse: experianVerifyResponseError3, expectedMessage: "Response code 3: Account number does not use a modulus check algorithm and therefore Bank Wizard cannot confirm the details are valid" },
		  ])("returns correct logger response in case of Experian response", async ({ errorResponse, expectedMessage }) => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: errorResponse });
		  
			await experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, experianTokenSsmPath);
		  
			expect(logger.warn).toHaveBeenCalledWith({ message: expectedMessage });
		  });

		it.each([
			{ errorResponse: experianVerifyResponseError6, expectedMessage: "Response code 6: Bank or branch code is not in use" },
			{ errorResponse: experianVerifyResponseError7, expectedMessage: "Response code 7: Modulus check has failed. Although the formats of the supplied fields are correct, one or more of them are incorrect" },
			{ errorResponse: experianVerifyResponseError11, expectedMessage: "Response code 11: Sort Code has been closed" },
			{ errorResponse: experianVerifyResponseError12, expectedMessage: "Response code 12: Branch has been transferred and the accounts have been redirected to another branch" },
		  ])("returns correct logger response in case of Experian response", async ({ errorResponse, expectedMessage }) => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: errorResponse });
		  
			await experianServiceTest.verify({ accountNumber, sortCode, name, uuid }, experianTokenSsmPath);
		  
			expect(logger.error).toHaveBeenCalledWith({ message: expectedMessage });
		  });


	});

	describe("#generateToken", () => {
		const experianClientId = process.env.Experian_CLIENT_ID!;
		const experianClientSecret = process.env.Experian_CLIENT_SECRET!;
		const expectedParams = {
			client_secret : experianClientSecret,
			client_id : experianClientId,
			grant_type : "client_credentials",
		};
		const config: AxiosRequestConfig<any> = {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		};

		it("Should return a valid access_token response", async () => {
			jest.spyOn(axios, "post").mockResolvedValue({ data: tokenResponse });
			const data = await experianServiceTest.generateToken(experianClientSecret, experianClientId);
			expect(axios.post).toHaveBeenCalledWith(`${experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`,
				expectedParams,
				config);
			expect(data?.access_token).toBe("token");
		});


jest.spyOn(Date, "now").mockReturnValue(1728637200000); // 11/10/2024 09:00:00.000
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => "randomId",
}));

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
		const clientUsername = "123456";
		const clientPassword = "12345678";
		const clientSecret = "Test";
		const clientId = "clientId";

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
			jest.spyOn(axios, "post").mockResolvedValue({ data: experianTokenResponse });
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
      jest.spyOn(axios, "post").mockRejectedValue(error);

			await expect(experianServiceTest.generateToken(experianClientSecret, experianClientId)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating Experian token"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "An error occurred when generating Experian token", statusCode: 400, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN },
			);
			expect(axios.post).toHaveBeenCalledTimes(1);
			expect(axios.post).toHaveBeenCalledWith(`${experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`, expectedParams, config);
		});
      
		it("should throw an AppError and doesn't retry if there is a non 500 error while generating the Experian access token", async () => {
			await expect(experianServiceTest.generateToken(experianClientSecret, experianClientId)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating Experian token"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "An error occurred when generating Experian token", statusCode: 500, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN },
			);
			expect(axios.post).toHaveBeenCalledTimes(3);
			expect(axios.post).toHaveBeenCalledWith(`${experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`,
				expectedParams,
				config,
			);
		});
    
  it("generateToken retries when Experian Token endpoint throws a 500 error", async () => {
			const error = {
				response: {
					status: 500, message: "Server error",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);
			experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(expiredToken);
			jest.spyOn(axios, "post").mockRejectedValue(error);
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
