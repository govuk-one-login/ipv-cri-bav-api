 
import { lambdaHandler } from "../../HmrcTokenHandler";
import { mock } from "vitest-mock-extended";
import { HmrcTokenRequestProcessor } from "../../services/HmrcTokenRequestProcessor";

const mockedHmrcTokenRequestProcessor = mock<HmrcTokenRequestProcessor>();
vi.mock("../../utils/Config", () => {
	return {
		getParameter: vi.fn(() => {return "dgsdgsg";}),
	};
});

describe("HmrcTokenHandler", () => {
	
	it("return success when HmrcTokenRequestProcessor completes successfully", async () => {
		HmrcTokenRequestProcessor.getInstance = vi.fn().mockReturnValue(mockedHmrcTokenRequestProcessor);

		await lambdaHandler();

		expect(mockedHmrcTokenRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when HmrcTokenRequestProcessor throws an error", async () => {
		HmrcTokenRequestProcessor.getInstance = vi.fn().mockReturnValue(mockedHmrcTokenRequestProcessor);
		mockedHmrcTokenRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		await expect(lambdaHandler()).rejects.toThrow(expect.objectContaining({
			message: "Server Error",
		}));

		expect(mockedHmrcTokenRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});
});
