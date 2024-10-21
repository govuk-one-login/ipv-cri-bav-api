import { logResponseCode } from "../../../utils/LogResponseCode";

describe("logResponseCode", () => {
	let logger: { [x: string]: any; warn?: jest.Mock<any, any, any>; error?: jest.Mock<any, any, any>; debug?: jest.Mock<any, any, any> };
  
	beforeEach(() => {
		logger = {
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		};
	});
  
	it.each([
		{ responseCode: "2", responseMessage: "Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid", expectedMethod: "warn", expectedMessage: "Response code 2: Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid" },
		{ responseCode: "3", responseMessage: "Account number does not use a modulus check algorithm and therefore Bank Wizard cannot confirm the details are valid", expectedMethod: "warn", expectedMessage: "Response code 3: Account number does not use a modulus check algorithm and therefore Bank Wizard cannot confirm the details are valid" },
		{ responseCode: "6", responseMessage: "Bank or branch code is not in use", expectedMethod: "error", expectedMessage: "Response code 6: Bank or branch code is not in use" },
		{ responseCode: "7", responseMessage: "Modulus check has failed. Although the formats of the supplied fields are correct, one or more of them are incorrect", expectedMethod: "error", expectedMessage: "Response code 7: Modulus check has failed. Although the formats of the supplied fields are correct, one or more of them are incorrect" },
		{ responseCode: "11", responseMessage: "Sort Code has been closed", expectedMethod: "error", expectedMessage: "Response code 11: Sort Code has been closed" },
		{ responseCode: "12", responseMessage: "Branch has been transferred and the accounts have been redirected to another branch", expectedMethod: "error", expectedMessage: "Response code 12: Branch has been transferred and the accounts have been redirected to another branch" },
	])("logs correctly for response code $responseCode", ({ responseCode, responseMessage, expectedMethod, expectedMessage }) => {
		logResponseCode({ responseCode, responseMessage }, logger);
		expect(logger[expectedMethod]).toHaveBeenCalledWith({ message: expectedMessage });
	});
});
