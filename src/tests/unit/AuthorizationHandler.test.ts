/* eslint-disable @typescript-eslint/unbound-method */
import { lambdaHandler } from "../../AuthorizationHandler";
import { VALID_AUTH } from "./data/auth-events";
import { CONTEXT } from "./data/context";
import { mock } from "jest-mock-extended";
import { HttpCodesEnum } from "../../models/enums/HttpCodesEnum";
import { AuthorizationRequestProcessor } from "../../services/AuthorizationRequestProcessor";
import { Constants } from "../../utils/Constants";

const mockedAuthorizationRequestProcessor = mock<AuthorizationRequestProcessor>();

describe("AuthorizationHandler", () => {
	it("throws an error if no session ID header has been provided", async () => {
		AuthorizationRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAuthorizationRequestProcessor);

		const response = await lambdaHandler({ ...VALID_AUTH, headers: { [Constants.SESSION_ID]: undefined } }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe( "Missing header: session-id is required");
	});

	it("throws an error if session ID header is not valid UUID", async () => {
		AuthorizationRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAuthorizationRequestProcessor);

		const response = await lambdaHandler({ ...VALID_AUTH, headers: { [Constants.SESSION_ID]: "test" } }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe( "session-id header does not contain a valid uuid");
	});

	it("return success when SessionRequestProcessor completes successfully", async () => {
		AuthorizationRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAuthorizationRequestProcessor);

		await lambdaHandler(VALID_AUTH, CONTEXT);

		expect(mockedAuthorizationRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
	});

	it("return error when SessionRequestProcessor throws an error", async () => {
		AuthorizationRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedAuthorizationRequestProcessor);
		mockedAuthorizationRequestProcessor.processRequest.mockRejectedValueOnce("Error");

		const response = await lambdaHandler(VALID_AUTH, CONTEXT);

		expect(mockedAuthorizationRequestProcessor.processRequest).toHaveBeenCalledTimes(1);
		expect(response.statusCode).toEqual(HttpCodesEnum.SERVER_ERROR);
		expect(response.body).toBe("Server Error");
	});
});
