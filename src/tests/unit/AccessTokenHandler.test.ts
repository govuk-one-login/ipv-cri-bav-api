/* eslint-disable @typescript-eslint/unbound-method */
import { mock } from "jest-mock-extended";
import { AccessTokenRequestProcessor } from "../../services/AccessTokenRequestProcessor";
import { lambdaHandler } from "../../AccessTokenHandler";
import { CONTEXT } from "./data/context";
import { HttpCodesEnum } from "../../models/enums/HttpCodesEnum";
import { VALID_ACCESSTOKEN } from "./data/accessToken-events";

const mockedAccessTokenRequestProcessor = mock<AccessTokenRequestProcessor>();

jest.mock("../../services/AccessTokenRequestProcessor", () => {
	return {
		AccessTokenRequestProcessor: jest.fn(() => mockedAccessTokenRequestProcessor),
	};
});

describe("AccessTokenHandler", () => {
	it("return success response for accessToken", async () => {
		AccessTokenRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAccessTokenRequestProcessor);

		await lambdaHandler(VALID_ACCESSTOKEN, CONTEXT);

		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(mockedAccessTokenRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when AccessTokenRequestProcessor throws an error", async () => {
		AccessTokenRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAccessTokenRequestProcessor);
		mockedAccessTokenRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		const response = await lambdaHandler(VALID_ACCESSTOKEN, CONTEXT);

		expect(mockedAccessTokenRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
		expect(response.statusCode).toEqual(HttpCodesEnum.SERVER_ERROR);
		expect(response.body).toBe("Server Error");
	});
});
