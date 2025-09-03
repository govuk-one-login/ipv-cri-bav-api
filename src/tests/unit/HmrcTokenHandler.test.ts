 
import { lambdaHandler } from "../../HmrcTokenHandler";
import { mock } from "jest-mock-extended";
import { HmrcTokenRequestProcessor } from "../../services/HmrcTokenRequestProcessor";

const mockedHmrcTokenRequestProcessor = mock<HmrcTokenRequestProcessor>();
jest.mock("../../utils/Config", () => {
	return {
		getParameter: jest.fn(() => {return "dgsdgsg";}),
	};
});

describe("HmrcTokenHandler", () => {
	
	it("return success when HmrcTokenRequestProcessor completes successfully", async () => {
		HmrcTokenRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedHmrcTokenRequestProcessor);

		await lambdaHandler();

		expect(mockedHmrcTokenRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when HmrcTokenRequestProcessor throws an error", async () => {
		HmrcTokenRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedHmrcTokenRequestProcessor);
		mockedHmrcTokenRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		await expect(lambdaHandler()).rejects.toThrow(expect.objectContaining({
			message: "Server Error",
		}));

		expect(mockedHmrcTokenRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});
});
