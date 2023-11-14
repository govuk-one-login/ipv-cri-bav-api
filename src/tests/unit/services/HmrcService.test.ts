/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { HmrcService } from "../../../services/HmrcService";
import axios, { AxiosRequestConfig } from "axios";
import { Constants } from "../../../utils/Constants";
import { AppError } from "../../../utils/AppError";
import { MessageCodes } from "../../../models/enums/MessageCodes";

jest.mock("axios");
let hmrcService: HmrcService;

const logger = mock<Logger>();

const HMRC_CLIENT_ID = "clientId";
const HMRC_CLIENT_SECRET = "client-secret";
const HMRC_BASE_URL = "https://base-api";

const params = {
	client_secret : HMRC_CLIENT_SECRET,
	client_id : HMRC_CLIENT_ID,
	grant_type : "client_credentials",
};
const config: AxiosRequestConfig<any> = {
	headers: {
		Accept: "application/x-www-form-urlencoded",
	},
};

const tokenResponse = {
	"access_token": "token",
	"scope": "default",
	"expires_in": 14400,
	"token_type": "bearer",
};

describe("Hmrc Service", () => {
	let axiosMock: jest.Mocked<typeof axios>;

	beforeEach(() => {
		axiosMock = axios as jest.Mocked<typeof axios>;
		hmrcService = HmrcService.getInstance(logger, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET, HMRC_BASE_URL);
	});

	describe("#generateToken", () => {
		it("Should return a valid access_token response", async () => {
			axiosMock.post.mockResolvedValue({ data: tokenResponse });
			const data = await hmrcService.generateToken();
			expect(axios.post).toHaveBeenCalledWith(`${HMRC_BASE_URL}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				params,
				config);
			expect(data?.access_token).toBe("token");
		});

		it("should throw an AppError if there is an error generating the hmrc access token", async () => {		

			axiosMock.post.mockRejectedValueOnce(new Error("Failed to generate hmrc token"));

			await expect(hmrcService.generateToken()).rejects.toThrow(
				new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC token"),
			);

			expect(logger.error).toHaveBeenCalledWith(
				{ message: "An error occurred when generating HMRC token", hmrcErrorMessage: "Failed to generate hmrc token", hmrcErrorCode: undefined, messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN },
			);
			expect(axios.post).toHaveBeenCalledWith(`${HMRC_BASE_URL}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				params,
				config);
		});
	});		
});
