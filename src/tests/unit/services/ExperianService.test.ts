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

const experianBaseUrl = process.env.EXPERIAN_BASE_URL!;
let experianServiceTest: ExperianService;
const tokenResponse = {
	"access_token": "token",
	"scope": "default",
	"expires_in": 14400,
	"token_type": "bearer",
};
const logger = mock<Logger>();
jest.mock(("../../../utils/Sleep"), () => ({
	sleep: jest.fn(),
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

		it("should throw an AppError and doesn't retry if there is a non 500 error while generating the Experian access token", async () => {
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
	
		it("generateToken retries when Experian Token endpoint throws a 500 error", async () => {
			const error = {
				response: {
					status: 500, message: "Server error",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);

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
	});
});
