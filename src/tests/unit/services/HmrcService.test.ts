/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import axios, { AxiosRequestConfig } from "axios";
import { mock } from "jest-mock-extended";
import { hmrcVerifyResponse } from "../data/hmrcEvents";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { HmrcService } from "../../../services/HmrcService";
import { AppError } from "../../../utils/AppError";
import { Constants } from "../../../utils/Constants";
import { sleep } from "../../../utils/Sleep";

const hmrcBaseUrl = process.env.HMRC_BASE_URL!;
let hmrcServiceTest: HmrcService;
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

describe("HMRC Service", () => {
	beforeAll(() => {
		hmrcServiceTest = new HmrcService(logger, hmrcBaseUrl, 2000, 3);
	});

	describe("#verify", () => {
		const accountNumber = "12345678";
		const sortCode = "123456";
		const name = "Test Testing";
		const uuid = "uuid";
		const hmrcTokenSsmPath = "dev/HMRC/TOKEN";

		it("calls HMRC verify endpoint with correct params and headers", async () => {
			const endpoint = `${hmrcServiceTest.hmrcBaseUrl}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`;
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: hmrcVerifyResponse });

			const response = await hmrcServiceTest.verify({ accountNumber, sortCode, name, uuid }, hmrcTokenSsmPath);

			expect(logger.info).toHaveBeenCalledWith("Sending COP verify request to HMRC", { uuid, endpoint, retryCount: 0 });
			expect(axios.post).toHaveBeenCalledWith(
				endpoint,
				{
					account: { accountNumber, sortCode },
					subject: { name },
				},
				{ 
					headers: {
						"User-Agent": Constants.HMRC_USER_AGENT,
						"Authorization": "Bearer dev/HMRC/TOKEN",
						"X-Tracking-Id": uuid,
					},
				},
			);
			expect(logger.debug).toHaveBeenCalledWith({
				message: "Recieved reponse from HMRC COP verify request",
				accountNumberIsWellFormatted: hmrcVerifyResponse.accountNumberIsWellFormatted,
				accountExists: hmrcVerifyResponse.accountExists,
				nameMatches: hmrcVerifyResponse.nameMatches,
				nonStandardAccountDetailsRequiredForBacs: hmrcVerifyResponse.nonStandardAccountDetailsRequiredForBacs,
				sortCodeIsPresentOnEISCD: hmrcVerifyResponse.sortCodeIsPresentOnEISCD,
				sortCodeSupportsDirectDebit: hmrcVerifyResponse.sortCodeSupportsDirectDebit,
				sortCodeSupportsDirectCredit: hmrcVerifyResponse.sortCodeSupportsDirectCredit,
			});
			expect(response).toEqual(hmrcVerifyResponse);
		});

		it("retries verify call with exponential backoff when 500 response is received", async () => {
			const endpoint = `${hmrcServiceTest.hmrcBaseUrl}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`;
			const error = {
				response: {
					status: 500, message: "Server error",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);

			await expect(hmrcServiceTest.verify({ accountNumber, sortCode, name, uuid }, hmrcTokenSsmPath)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error sending COP verify request to HMRC"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "Error sending COP verify request to HMRC", messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: 500 },
			);
			expect(axios.post).toHaveBeenCalledTimes(4);
			expect(axios.post).toHaveBeenCalledWith(
				endpoint,
				{
					account: { accountNumber, sortCode },
					subject: { name },
				},
				{ 
					headers: {
						"User-Agent": Constants.HMRC_USER_AGENT,
						"Authorization": "Bearer dev/HMRC/TOKEN",
						"X-Tracking-Id": uuid,
					},
				},
			);
			expect(sleep).toHaveBeenNthCalledWith(1, 2000);
			expect(sleep).toHaveBeenNthCalledWith(2, 4000);
			expect(sleep).toHaveBeenNthCalledWith(3, 8000);
		});

		it("retries verify call with exponential backoff when 429 response is received", async () => {
			const endpoint = `${hmrcServiceTest.hmrcBaseUrl}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`;
			const error = {
				response: {
					status: 429, message: "Server error",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);

			await expect(hmrcServiceTest.verify({ accountNumber, sortCode, name, uuid }, hmrcTokenSsmPath)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error sending COP verify request to HMRC"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "Error sending COP verify request to HMRC", messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: 429 },
			);
			expect(axios.post).toHaveBeenCalledTimes(4);
			expect(axios.post).toHaveBeenCalledWith(
				endpoint,
				{
					account: { accountNumber, sortCode },
					subject: { name },
				},
				{ 
					headers: {
						"User-Agent": Constants.HMRC_USER_AGENT,
						"Authorization": "Bearer dev/HMRC/TOKEN",
						"X-Tracking-Id": uuid,
					},
				},
			);
			expect(sleep).toHaveBeenNthCalledWith(1, 2000);
			expect(sleep).toHaveBeenNthCalledWith(2, 4000);
			expect(sleep).toHaveBeenNthCalledWith(3, 8000);
		});

		it("returns error if HMRC verify call fails with non 500", async () => {
			const error = {
				response: {
					status: 400, message: "Bad request",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValueOnce(error);

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			await expect(hmrcServiceTest.verify({ accountNumber, sortCode, name, uuid }, hmrcTokenSsmPath))
				.rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.SERVER_ERROR,
					message: "Error sending COP verify request to HMRC",
				}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Error sending COP verify request to HMRC", messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: 400 });
			expect(axios.post).toHaveBeenCalledTimes(1);
		});
	});

	describe("#generateToken", () => {
		const hmrcClientId = process.env.HMRC_CLIENT_ID!;
		const hmrcClientSecret = process.env.HMRC_CLIENT_SECRET!;
		const expectedParams = {
			client_secret : hmrcClientSecret,
			client_id : hmrcClientId,
			grant_type : "client_credentials",
		};
		const config: AxiosRequestConfig<any> = {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		};

		it("Should return a valid access_token response", async () => {
			jest.spyOn(axios, "post").mockResolvedValue({ data: tokenResponse });
			const data = await hmrcServiceTest.generateToken(hmrcClientSecret, hmrcClientId);
			expect(axios.post).toHaveBeenCalledWith(`${hmrcBaseUrl}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				expectedParams,
				config);
			expect(data?.access_token).toBe("token");
		});

		it("should throw an AppError and doesn't retry if there is a non 500 error while generating the HMRC access token", async () => {
			const error = {
				response: {
					status: 400, message: "Bad request",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);

			await expect(hmrcServiceTest.generateToken(hmrcClientSecret, hmrcClientId)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC token"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "An error occurred when generating HMRC token", statusCode: 400, messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN },
			);
			expect(axios.post).toHaveBeenCalledTimes(1);
			expect(axios.post).toHaveBeenCalledWith(`${hmrcBaseUrl}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`, expectedParams, config);
		});
	
		it("generateToken retries when HMRC Token endpoint throws a 500 error", async () => {
			const error = {
				response: {
					status: 500, message: "Server error",
				},
			};
			jest.spyOn(axios, "post").mockRejectedValue(error);

			await expect(hmrcServiceTest.generateToken(hmrcClientSecret, hmrcClientId)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC token"),
			);
			expect(logger.error).toHaveBeenCalledWith(
				{ message: "An error occurred when generating HMRC token", statusCode: 500, messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN },
			);
			expect(axios.post).toHaveBeenCalledTimes(4);
			expect(axios.post).toHaveBeenCalledWith(`${hmrcBaseUrl}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				expectedParams,
				config,
			);
		});
	});
});
