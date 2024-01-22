/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { lambdaHandler, logger } from "../../AbortHandler";
import { VALID_ABORT } from "./data/abort-events";
import { CONTEXT } from "./data/context";
import { mock } from "jest-mock-extended";
import { HttpCodesEnum } from "../../models/enums/HttpCodesEnum";
import { AbortRequestProcessor } from "../../services/AbortRequestProcessor";
import { Constants } from "../../utils/Constants";
import { MessageCodes } from "../../models/enums/MessageCodes";

const mockedAbortRequestProcessor = mock<AbortRequestProcessor>();

describe("AbortHandler", () => {
	let loggerSpy: jest.SpyInstance;

	beforeEach(() => {
		loggerSpy = jest.spyOn(logger, "error");
	});

	it("returns error when x-govuk-signin-session-id header isn't passed", async () => {
		const message = `Missing header: ${Constants.X_SESSION_ID} is required`;

		const response = await lambdaHandler({ ...VALID_ABORT, headers: {} }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_SESSION_ID });
	});

	it("returns error when x-govuk-signin-session-id header is invalid", async () => {
		const message = `${Constants.X_SESSION_ID} header does not contain a valid uuid`;

		const response = await lambdaHandler({ ...VALID_ABORT, headers: { [Constants.X_SESSION_ID]: "1" } }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_SESSION_ID });
	});

	it("return success when AbortRequestProcessor completes successfully", async () => {
		AbortRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAbortRequestProcessor);

		await lambdaHandler(VALID_ABORT, CONTEXT);

		expect(mockedAbortRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when AbortRequestProcessor throws an error", async () => {
		AbortRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAbortRequestProcessor);
		mockedAbortRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		const response = await lambdaHandler(VALID_ABORT, CONTEXT);

		expect(mockedAbortRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
		expect(response.statusCode).toEqual(HttpCodesEnum.SERVER_ERROR);
		expect(response.body).toBe("Server Error");
	});
});
