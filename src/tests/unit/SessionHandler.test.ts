/* eslint-disable @typescript-eslint/unbound-method */
import { lambdaHandler } from "../../SessionHandler";
import { mock } from "jest-mock-extended";
import { VALID_SESSION } from "./data/session-events";
import { SessionRequestProcessor } from "../../services/SessionRequestProcessor";
import { CONTEXT } from "./data/context";
import { HttpCodesEnum } from "../../models/enums/HttpCodesEnum";

const mockedSessionRequestProcessor = mock<SessionRequestProcessor>();

describe("SessionHandler", () => {
	it("return success when SessionRequestProcessor completes successfully", async () => {
		SessionRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedSessionRequestProcessor);

		await lambdaHandler(VALID_SESSION, CONTEXT);

		expect(mockedSessionRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when SessionRequestProcessor throws an error", async () => {
		SessionRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedSessionRequestProcessor);
		mockedSessionRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		const response = await lambdaHandler(VALID_SESSION, CONTEXT);

		expect(mockedSessionRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
		expect(response.statusCode).toEqual(HttpCodesEnum.SERVER_ERROR);
		expect(response.body).toBe("Server Error");
	});
});
