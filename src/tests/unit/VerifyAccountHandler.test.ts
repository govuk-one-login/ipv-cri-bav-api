/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { mock } from "jest-mock-extended";
import { CONTEXT } from "./data/context";
import { VALID_VERIFY_ACCOUNT } from "./data/verify-account-events";
import { HttpCodesEnum } from "../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../models/enums/MessageCodes";
import { Constants } from "../../utils/Constants";
import { VerifyAccountRequestProcessor } from "../../services/VerifyAccountRequestProcessor";
import { lambdaHandler, logger } from "../../VerifyAccountHandler";

const mockedVerifyAccountRequestProcessor = mock<VerifyAccountRequestProcessor>();
jest.mock("../../utils/Config", () => ({
	getParameter: (parameter: string) => parameter,
}));

describe("VerifyAccountHandler", () => {
	let loggerSpy: jest.SpyInstance;
  
	beforeEach(() => {
		loggerSpy = jest.spyOn(logger, "error");
	});

	it("returns success response for correct request", async () => {
		VerifyAccountRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedVerifyAccountRequestProcessor);

		await lambdaHandler(VALID_VERIFY_ACCOUNT, CONTEXT);

		expect(mockedVerifyAccountRequestProcessor.processExperianRequest).toHaveBeenCalledTimes(1);
	});

	it("calls VerifyAccountRequestProcessor with clientIpAddress from X_FORWARDED_FOR header if present", async () => {
		VerifyAccountRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedVerifyAccountRequestProcessor);

		await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, headers: { ...VALID_VERIFY_ACCOUNT.headers, [Constants.X_FORWARDED_FOR]: "x-forwarded-for" } }, CONTEXT);

		expect(mockedVerifyAccountRequestProcessor.processExperianRequest).toHaveBeenCalledWith(
			"732075c8-08e6-4b25-ad5b-d6cb865a18e5",
			JSON.parse(VALID_VERIFY_ACCOUNT.body),
			"x-forwarded-for",
			"encoded header",
			"username",
			"password",
			"id",
			"secret",
		);
	});

	it("calls VerifyAccountRequestProcessor with clientIpAddress from sourceIp if X_FORWARDED_FOR header is not present", async () => {
		VerifyAccountRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedVerifyAccountRequestProcessor);

		await lambdaHandler(VALID_VERIFY_ACCOUNT, CONTEXT);

		expect(mockedVerifyAccountRequestProcessor.processExperianRequest).toHaveBeenCalledWith(
			"732075c8-08e6-4b25-ad5b-d6cb865a18e5",
			JSON.parse(VALID_VERIFY_ACCOUNT.body),
			"1.1.1",
			"encoded header",
			"username",
			"password",
			"id",
			"secret",
		);
	});

	it("returns error when x-govuk-signin-session-id header isn't passed", async () => {
		const message = `Missing header: ${Constants.X_SESSION_ID} is required`;

		const response = await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, headers: {} }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_SESSION_ID });
	});

	it("returns error when x-govuk-signin-session-id header is invalid", async () => {
		const message = `${Constants.X_SESSION_ID} header does not contain a valid uuid`;

		const response = await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, headers: { [Constants.X_SESSION_ID]: "1" } }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_SESSION_ID });
	});

	it("returns error when body is missing", async () => {
		const message = "Invalid request: missing body";

		const response = await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, body: null }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_REQUEST_PAYLOAD });
	});

	it("returns error when sort code in body is missing", async () => {
		const body = JSON.stringify({
			sort_code: null,
			account_number: "12345678",
		});
		const message = "Invalid request: Missing sort_code parameter";

		const response = await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, body }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_REQUEST_PAYLOAD });
	});

	it("returns error when sort code in body is invalid", async () => {
		const body = JSON.stringify({
			sort_code: "1234",
			account_number: "12345678",
		});
		const message = "Invalid request: sort_code parameter is incorrect";

		const response = await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, body }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_REQUEST_PAYLOAD });
	});

	it("returns error when account number in body is missing", async () => {
		const body = JSON.stringify({
			sort_code: "123456",
			account_number: null,
		});
		const message = "Invalid request: Missing account_number parameter";

		const response = await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, body }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_REQUEST_PAYLOAD });
	});

	it("returns error when account number in body is invalid", async () => {
		const body = JSON.stringify({
			sort_code: "123456",
			account_number: "123",
		});
		const message = "Invalid request: account_number parameter is incorrect";

		const response = await lambdaHandler({ ...VALID_VERIFY_ACCOUNT, body }, CONTEXT);

		expect(response.statusCode).toEqual(HttpCodesEnum.BAD_REQUEST);
		expect(response.body).toBe(message);
		expect(loggerSpy).toHaveBeenCalledWith({ message, messageCode: MessageCodes.INVALID_REQUEST_PAYLOAD });
	});

	it("returns error when VerifyAccountRequestProcessor throws an error", async () => {
		VerifyAccountRequestProcessor.getInstance = jest.fn().mockReturnValue(mockedVerifyAccountRequestProcessor);
		mockedVerifyAccountRequestProcessor.processExperianRequest.mockRejectedValueOnce("Error");

		const response = await lambdaHandler(VALID_VERIFY_ACCOUNT, CONTEXT);
		
		expect(mockedVerifyAccountRequestProcessor.processExperianRequest).toHaveBeenCalledTimes(1);
		expect(response.statusCode).toEqual(HttpCodesEnum.SERVER_ERROR);
		expect(response.body).toBe("Server Error");
	});
});
