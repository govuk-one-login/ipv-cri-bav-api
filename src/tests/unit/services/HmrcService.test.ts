/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import axios, { AxiosRequestConfig } from "axios";
import { mock } from "jest-mock-extended";
import { hmrcVerifyResponse } from "../data/hmrcEvents";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { HmrcService } from "../../../services/HmrcService";
import { Constants } from "../../../utils/Constants";
import { AppError } from "../../../utils/AppError";

const HMRC_BASE_URL = process.env.HMRC_BASE_URL!;
const HMRC_CLIENT_ID = process.env.HMRC_CLIENT_ID!;
const HMRC_CLIENT_SECRET = process.env.HMRC_CLIENT_SECRET!;
let hmrcServiceTest: HmrcService;
const logger = mock<Logger>();
const params = {
	client_secret : HMRC_CLIENT_SECRET,
	client_id : HMRC_CLIENT_ID,
	grant_type : "client_credentials",
};
const config: AxiosRequestConfig<any> = {
	headers: {
		"Content-Type": "application/x-www-form-urlencoded",
	},
};

const tokenResponse = {
	"access_token": "token",
	"scope": "default",
	"expires_in": 14400,
	"token_type": "bearer",
};

describe("HMRC Service", () => {
	beforeAll(() => {
		hmrcServiceTest = new HmrcService(logger, HMRC_BASE_URL, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET);
	});

	describe("#verify", () => {
		const accountNumber = "12345678";
		const sortCode = "123456";
		const name = "Test Testing";
		const hmrcTokenSsmPath = "dev/HMRC/TOKEN";

		it("calls HMRC verify endpoint with correct params and headers", async () => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: hmrcVerifyResponse });
			const endpoint = `${hmrcServiceTest.HMRC_BASE_URL}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`;

			const response = await hmrcServiceTest.verify({ accountNumber, sortCode, name }, hmrcTokenSsmPath);

			expect(logger.info).toHaveBeenCalledWith("Sending COP verify request to HMRC", { endpoint });
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

		it("returns error if HMRC verify call fails", async () => {
			jest.spyOn(axios, "post").mockRejectedValueOnce("Error!");

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			await expect(hmrcServiceTest.verify({ accountNumber, sortCode, name }, hmrcTokenSsmPath))
				.rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.UNAUTHORIZED,
					message: "Error sending COP verify request to HMRC",
				}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Error sending COP verify request to HMRC", messageCode: MessageCodes.FAILED_VERIFYING_ACOUNT });
		});
	});

	describe("#generateToken", () => {
		it("Should return a valid access_token response", async () => {
			jest.spyOn(axios, "post").mockResolvedValue({ data: tokenResponse });
			const data = await hmrcServiceTest.generateToken(2000, 3);
			expect(axios.post).toHaveBeenCalledWith(`${HMRC_BASE_URL}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				params,
				config);
			expect(data?.access_token).toBe("token");
		});

		it("should throw an AppError and doesnt retry if there is a non 500 error while generating the hmrc access token", async () => {		

			jest.spyOn(axios, "post").mockRejectedValue( {
				"message": "Request failed with status code 400",
				"code": "ERR_BAD_REQUEST",
        		"status": 400,					
			});

			await expect(hmrcServiceTest.generateToken(2000, 3)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC token"),
			);

			expect(logger.error).toHaveBeenCalledWith(
				{ message: "An error occurred when generating HMRC token", hmrcErrorMessage: "Request failed with status code 400", hmrcStatusCode: 400, hmrcErrorCode: "ERR_BAD_REQUEST", messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN },
			);
			expect(axios.post).toHaveBeenCalledWith(`${HMRC_BASE_URL}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				params,
				config);
			expect(axios.post).toHaveBeenCalledTimes(1);
		});
	
		it("generateToken retries when Hmrc Token endpoint throws a 500 error", async () => {
			jest.spyOn(axios, "post").mockRejectedValue( {
				"message": "Request failed with status code 500",
				"code": "ERR_BAD_RESPONSE",
        		"status": 500,					
			});

			await expect(hmrcServiceTest.generateToken(2000, 3)).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC token"),
			);

			expect(logger.error).toHaveBeenCalledWith(
				{ message: "An error occurred when generating HMRC token", hmrcErrorMessage: "Request failed with status code 500", hmrcStatusCode: 500, hmrcErrorCode: "ERR_BAD_RESPONSE", messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN },
			);
			expect(axios.post).toHaveBeenCalledWith(`${HMRC_BASE_URL}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				params,
				config);
			expect(axios.post).toHaveBeenCalledTimes(4);
		});
	});
});
