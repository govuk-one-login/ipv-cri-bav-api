/* eslint-disable @typescript-eslint/unbound-method */
import { lambdaHandler, logger } from "../../UserInfoHandler";
import { mock } from "jest-mock-extended";
import { VALID_USERINFO } from "./data/userInfo-events";
import { UserInfoRequestProcessorExperian } from "../../services/UserInfoRequestProcessorExperian";
import { HttpCodesEnum } from "../../models/enums/HttpCodesEnum";
import { CONTEXT } from "./data/context";

const mockedUserInfoRequestProcessor = mock<UserInfoRequestProcessorExperian>();
jest.mock("../../utils/Config", () => ({
	getParameter: (parameter: string) => parameter,
}));

describe("UserInfoHandler", () => {
	let loggerSpy: jest.SpyInstance;
  
	beforeEach(() => {
		loggerSpy = jest.spyOn(logger, "error");
	});

	it("return success when UserInfoRequestProcessor completes successfully", async () => {
		UserInfoRequestProcessorExperian.getInstance = jest.fn().mockReturnValue(mockedUserInfoRequestProcessor);

		await lambdaHandler(VALID_USERINFO, CONTEXT);

		expect(mockedUserInfoRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when UserInfoRequestProcessor throws an error", async () => {
		UserInfoRequestProcessorExperian.getInstance = jest.fn().mockReturnValue(mockedUserInfoRequestProcessor);
		mockedUserInfoRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		const response = await lambdaHandler(VALID_USERINFO, CONTEXT);

		expect(mockedUserInfoRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
		expect(response.statusCode).toEqual(HttpCodesEnum.SERVER_ERROR);
		expect(response.body).toBe("Server Error");
	});
});
