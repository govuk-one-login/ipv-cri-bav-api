/* eslint-disable @typescript-eslint/unbound-method */
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { HmrcService } from "../../../services/HmrcService";
import { HmrcTokenRequestProcessor } from "../../../services/HmrcTokenRequestProcessor";
import { Constants } from "../../../utils/Constants";
import { putParameter } from "../../../utils/Config";

let hmrcTokenRequestProcessorTest: HmrcTokenRequestProcessor;
const metrics = new Metrics({ namespace: "BAV" });
const HMRC_CLIENT_ID = "clientId";
const HMRC_CLIENT_SECRET = "client-secret";
jest.mock("../../../utils/Config", () => {
	return {
		putParameter: jest.fn(() => {return;}),
	};
});
const tokenResponse = {
	"access_token": "token",
	"scope": "default",
	"expires_in": 14400,
	"token_type": "bearer",
};

const mockHmrcService = mock<HmrcService>();
const logger = mock<Logger>();

describe("HmrcTokenRequestProcessor", () => {
	beforeAll(() => {
		hmrcTokenRequestProcessorTest = new HmrcTokenRequestProcessor(logger, metrics, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET);
		// @ts-ignore
		hmrcTokenRequestProcessorTest.hmrcService = mockHmrcService;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("throws error if hmrc token generation failed", async () => {
		mockHmrcService.generateToken.mockResolvedValue(undefined);

		await expect(hmrcTokenRequestProcessorTest.processRequest()).rejects.toThrow(expect.objectContaining({
			message: "Error generating HMRC access token",
			statusCode: HttpCodesEnum.SERVER_ERROR,
		}));
			
	});

	it("logs error if expires_in is not equal to 14400", async () => {
		mockHmrcService.generateToken.mockResolvedValue({
			"access_token": "token",
			"scope": "default",
			"expires_in": 15400,
			"token_type": "bearer",
		});

		await hmrcTokenRequestProcessorTest.processRequest();
		expect(logger.error).toHaveBeenCalledWith(`expires_in doesnt match the expected value, received 15400 instead of ${Constants.HMRC_EXPECTED_TOKEN_EXPIRES_IN}`);
	});

	it("sucessfully generates the token and stores it to SSM parameter", async () => {
		mockHmrcService.generateToken.mockResolvedValue(tokenResponse);

		await hmrcTokenRequestProcessorTest.processRequest();
		expect(logger.info).toHaveBeenNthCalledWith(2, "Storing the HMRC access token to SSM");
		expect(putParameter).toHaveBeenCalledWith(Constants.HMRC_TOKEN_SSM_PATH, tokenResponse.access_token, "String", "HMRC Access token");
		expect(logger.info).toHaveBeenNthCalledWith(3, "Successfully Stored the HMRC token to SSM");
	});
});
