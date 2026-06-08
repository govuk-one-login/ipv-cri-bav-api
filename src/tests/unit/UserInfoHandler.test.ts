 
import { lambdaHandler } from "../../UserInfoHandler";
import { mock } from "vitest-mock-extended";
import { VALID_USERINFO } from "./data/userInfo-events";
import { UserInfoRequestProcessor } from "../../services/UserInfoRequestProcessor";
import { HttpCodesEnum } from "../../models/enums/HttpCodesEnum";
import { CONTEXT } from "./data/context";

const mockedUserInfoRequestProcessor = mock<UserInfoRequestProcessor>();
vi.mock("../../utils/Config", () => ({
	getParameter: (parameter: string) => parameter,
}));

describe("UserInfoHandler", () => {
  
	beforeEach(() => {
	});

	it("return success when UserInfoRequestProcessor completes successfully", async () => {
		UserInfoRequestProcessor.getInstance = vi.fn().mockReturnValue(mockedUserInfoRequestProcessor);

		await lambdaHandler(VALID_USERINFO, CONTEXT);

		expect(mockedUserInfoRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when UserInfoRequestProcessor throws an error", async () => {
		UserInfoRequestProcessor.getInstance = vi.fn().mockReturnValue(mockedUserInfoRequestProcessor);
		mockedUserInfoRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		const response = await lambdaHandler(VALID_USERINFO, CONTEXT);

		expect(mockedUserInfoRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
		expect(response.statusCode).toEqual(HttpCodesEnum.SERVER_ERROR);
		expect(response.body).toBe("Server Error");
	});
});
