/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import { ExperianService } from "../../../services/ExperianService";
import { mock } from "jest-mock-extended";
import { createDynamoDbClient } from "../../../utils/DynamoDBFactory";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import axios, { AxiosRequestConfig } from "axios";
import { Constants } from "../../../utils/Constants";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { experianVerifyResponse, 
	experianVerifyResponseError2, 
	experianVerifyResponseError3, 
	experianVerifyResponseError6, 
	experianVerifyResponseError7,
	experianVerifyResponseError11,
	experianVerifyResponseError12 } from "../data/experianEvents";
import { Metrics } from "@aws-lambda-powertools/metrics";

let experianServiceTest: ExperianService;
const mockDynamoDbClient = jest.mocked(createDynamoDbClient());
const experianTokenTableName = "EXPERIANSTOKENTABLE";
const logger = mock<Logger>();
const metrics = mock<Metrics>();


jest.useFakeTimers();
jest.spyOn(Date, "now").mockReturnValue(1728637200); // 11/10/2024 10:00:00.000 - Return value is mocked for 'checkExperianToken()', set as the same time valid token was issued
jest.setSystemTime(new Date("2024-10-11T09:00:00.000Z"));

jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => "randomId",
}));

const experianPayload = {
	header: {
		requestType: "BAVConsumer-Standard",
		clientReferenceId: "uuid",
		expRequestId: "",
		messageTime: "2024-10-11T09:00:00Z",
		options: {},
	},
	payload: {
		source: "WEB",
		application: {
			applicants: [
	  {
					id: "APPLICANT_1",
					applicantType: "APPLICANT",
					contactId: "MainContact_1",
	  },
			],
		},
		contacts: [
			{
	  id: "MainContact_1",
	  person: {
					typeOfPerson: "APPLICANT",
					personDetails: {
		  dateOfBirth: "DATE",
					},
					names: [
		  {
							firstName: "First",
							surName: "Last",
		  },
					],
	  },
	  bankAccount: {
					sortCode: "123456",
					clearAccountNumber: "12345678",
	  },
			},
		],
	},
};

const experianTokenResponse = {
	"issued_at" : "1728637200", // 11/10/2024 10:00:00.000
	"expires_in" : "1800",
	"token_type" : "Bearer",
	"access_token" : "TOKEN",
	"refresh_token" : "123456789123456789",
};

// refresh_token field is not stored in DynamoDB
const storedExperianToken = {
	"issued_at" : "1728637200", // 11/10/2024 10:00:00.000
	"expires_in" : "1800",
	"token_type" : "Bearer",
	"access_token" : "TOKEN",
};

const expiredToken = {
	...storedExperianToken,
	issued_at: "1728631800", // 11/10/2024 08:30:00.000
};

const clientUsername = "123456";
const clientPassword = "12345678";
const clientId = "clientId";
const clientSecret = "Test";
const experianVerifyUrl = "https://localhost/verify";
const experianTokenUrl = "https://localhost/token";

process.env.THIRDPARTY_DIRECT_SUBMISSION = "false";

describe("Experian service", () => {
	
	beforeAll(() => {
		process.env.LOG_THIRDPARTY_API_RESPONSE = "false";
		experianServiceTest = new ExperianService(logger, metrics, 2, mockDynamoDbClient, experianTokenTableName);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("#verify", () => {
		const verifyAccountPayload = {
			account_number: "12345678",
			sort_code: "123456",
		};

		const firstName = "First";
		const surname = "Last";
		const uuid = "uuid";
		const birthDate = "DATE";
		

		it("calls Experian verify endpoint with correct params and headers", async () => {
			const endpoint = experianVerifyUrl;
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: experianVerifyResponse });

			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: storedExperianToken });

			const response = await experianServiceTest.verify({ verifyAccountPayload, firstName, surname, birthDate, uuid },
				clientUsername,
				clientPassword,
				clientId,
				clientSecret,
				experianVerifyUrl,
				experianTokenUrl,
			);

			expect(logger.info).toHaveBeenNthCalledWith(1, { message: "Checking EXPERIANSTOKENTABLE for valid token" });
			expect(logger.info).toHaveBeenNthCalledWith(2, "Fetching Experian token from table EXPERIANSTOKENTABLE");
			expect(logger.info).toHaveBeenNthCalledWith(3, "Valid token found");
			expect(logger.info).toHaveBeenNthCalledWith(4, "Sending verify request to Experian", { uuid, endpoint });
			expect(axios.post).toHaveBeenCalledWith(
				endpoint,
				experianPayload,
				{ 
					headers: {
						"User-Agent": Constants.EXPERIAN_USER_AGENT,
						"Authorization": "Bearer TOKEN",
						"Content-Type":"application/json",
						"Accept":"application/json",
					},
				},
			);
			
			expect(logger.info).toHaveBeenNthCalledWith(10, {
				message: "Received response from Experian verify request. Match Result:",
				eventType: experianVerifyResponse.clientResponsePayload.decisionElements[1].auditLogs![0].eventType,
				eventOutcome: experianVerifyResponse.clientResponsePayload.decisionElements[1].auditLogs![0].eventOutcome,
			});
			expect(logger.info).toHaveBeenNthCalledWith(11, "Triggered rules: [\"Rule Id: CNS1018, Rule Name: BAV_OA_GE90D_PDSGE7_ASGE6 , Rule text: Match to an open account, aged >=90 days, Personal Details Score >=7 and Address Score >=6\",\"Rule Id: CNS1019, Rule Name: BAV_OA_GE90D_PDSGE5_ASGE4 , Rule text: Match found to an open account which was opened 90 or more days ago with Personal Details Score >= 5 and Address Score >= 4\",\"Rule Id: CNS1020, Rule Name: BAV_OA_PDSGE5_ASGE4 , Rule text: Match to an open account, aged >=90 days, Personal Details Score >=5 and Address Score >=4\",\"Rule Id: CNS1022, Rule Name: BAV_OA_GE90D_PDSGE5 , Rule text: Match to an open account, aged >=90 days, Personal Details Score >=5\"]");
			expect(response).toEqual({ "personalDetailsScore": 9, "expRequestId": "1234567890", "warningsErrors":[] });
			
			expect(metrics.addMetric).toHaveBeenNthCalledWith(1, "Experian-CONTINUE", "Count", 1);
			expect(metrics.addMetric).toHaveBeenNthCalledWith(2, "Experian-Match_Found", "Count", 1);
			expect(metrics.addMetric).toHaveBeenNthCalledWith(3, "PersonalDetailsScore-9", "Count", 1);

		});

		it("processes Experian verify request when response is missing Personal Details score and audit logs", async () => {
			const endpoint = experianVerifyUrl;
			const experianVerifyResponseNoPDScoreOrAuditLogs = experianVerifyResponse;
			delete experianVerifyResponseNoPDScoreOrAuditLogs.clientResponsePayload.decisionElements[2].scores;
			delete experianVerifyResponseNoPDScoreOrAuditLogs.clientResponsePayload.decisionElements[1].auditLogs;

			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: experianVerifyResponseNoPDScoreOrAuditLogs });

			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: storedExperianToken });

			const response = await experianServiceTest.verify({ verifyAccountPayload, firstName, surname, birthDate, uuid },
				clientUsername,
				clientPassword,
				clientId,
				clientSecret,
				experianVerifyUrl,
				experianTokenUrl,
			);

			expect(logger.info).toHaveBeenNthCalledWith(1, { message: "Checking EXPERIANSTOKENTABLE for valid token" });
			expect(logger.info).toHaveBeenNthCalledWith(2, "Fetching Experian token from table EXPERIANSTOKENTABLE");
			expect(logger.info).toHaveBeenNthCalledWith(3, "Valid token found");
			expect(logger.info).toHaveBeenNthCalledWith(4, "Sending verify request to Experian", { uuid, endpoint });
			expect(axios.post).toHaveBeenCalledWith(
				endpoint,
				experianPayload,
				{ 
					headers: {
						"User-Agent": Constants.EXPERIAN_USER_AGENT,
						"Authorization": "Bearer TOKEN",
						"Content-Type":"application/json",
						"Accept":"application/json",
					},
				},
			);
			
			expect(logger.info).toHaveBeenNthCalledWith(10, {
				message: "Received response from Experian verify request. Match Result:",
				eventType: undefined,
				eventOutcome: undefined,
			});
			expect(logger.info).toHaveBeenNthCalledWith(11, "Triggered rules: [\"Rule Id: CNS1018, Rule Name: BAV_OA_GE90D_PDSGE7_ASGE6 , Rule text: Match to an open account, aged >=90 days, Personal Details Score >=7 and Address Score >=6\",\"Rule Id: CNS1019, Rule Name: BAV_OA_GE90D_PDSGE5_ASGE4 , Rule text: Match found to an open account which was opened 90 or more days ago with Personal Details Score >= 5 and Address Score >= 4\",\"Rule Id: CNS1020, Rule Name: BAV_OA_PDSGE5_ASGE4 , Rule text: Match to an open account, aged >=90 days, Personal Details Score >=5 and Address Score >=4\",\"Rule Id: CNS1022, Rule Name: BAV_OA_GE90D_PDSGE5 , Rule text: Match to an open account, aged >=90 days, Personal Details Score >=5\"]");
			expect(response).toEqual({ "personalDetailsScore": undefined, "expRequestId": "1234567890", "warningsErrors":[] });
		});

		it.each([
			{ responseCode: "2", errorResponse: experianVerifyResponseError2, expectedMessage: "Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid" },
			{ responseCode: "3", errorResponse: experianVerifyResponseError3, expectedMessage: "Account number does not use a modulus check algorithm and therefore Bank Wizard cannot confirm the details are valid" },
		  ])("returns correct logger response in case of Experian response", async ({ responseCode, errorResponse, expectedMessage }) => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: errorResponse });
			mockDynamoDbClient.send = jest.fn().mockResolvedValueOnce({ Item: storedExperianToken });
		  

			const response = await experianServiceTest.verify({ verifyAccountPayload, firstName, surname, birthDate, uuid }, clientUsername,
				clientPassword,
				clientId,
				clientSecret,
				experianVerifyUrl,
				experianTokenUrl);
		
			expect(response).toEqual({ "expRequestId": "1234567890", "personalDetailsScore": 1, "warningsErrors": [{ responseCode, "responseMessage": expectedMessage, "responseType": "warning" }] });
		  });

		it.each([
			{ errorResponse: experianVerifyResponseError6, expectedMessage: "Response code 6: Bank or branch code is not in use" },
			{ errorResponse: experianVerifyResponseError7, expectedMessage: "Response code 7: Modulus check has failed. Although the formats of the supplied fields are correct, one or more of them are incorrect" },
			{ errorResponse: experianVerifyResponseError11, expectedMessage: "Response code 11: Sort Code has been closed" },
			{ errorResponse: experianVerifyResponseError12, expectedMessage: "Response code 12: Branch has been transferred and the accounts have been redirected to another branch" },
		  ])("returns correct logger response in case of Experian response", async ({ errorResponse, expectedMessage }) => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: errorResponse });
			mockDynamoDbClient.send = jest.fn().mockResolvedValueOnce({ Item: storedExperianToken });
		  
			await experianServiceTest.verify({ verifyAccountPayload, firstName, surname, birthDate, uuid }, clientUsername,
				clientPassword,
				clientId,
				clientSecret,
				experianVerifyUrl,
				experianTokenUrl);
		  		  });

	});

	describe("#experianToken", () => {

		describe("#checkExperianToken", () => {
			it("should return true if token is valid", () => {
				const result = experianServiceTest.checkExperianToken(storedExperianToken);
				expect(result).toBe(true);
			});

			it("should return false if token is invalid", () => {
				const result = experianServiceTest.checkExperianToken(expiredToken);
				expect(result).toBe(false);
			});
		});

		describe("#saveExperianToken", () => {
			it("should save Experian token with Id = 1 and without 'refresh_token' value", async () => {
				mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
				await experianServiceTest.saveExperianToken(experianTokenResponse);
				expect(mockDynamoDbClient.send).toHaveBeenCalledWith(expect.objectContaining({
					input: {
						Item: {
							"id": "1",
							...storedExperianToken,
						},
						TableName: experianTokenTableName,
					},
				}));
			});

			it("should handle error when sending message to dynamo", async () => {
				mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});
				await expect(experianServiceTest.saveExperianToken(experianTokenResponse)).rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.SERVER_ERROR,
					message: "Error storing new Experian token",
				}));
			});
		});

		describe("#getExperianToken", () => {
			it("should retrieve Experian token", async () => {
				mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: storedExperianToken });
				const result = await experianServiceTest.getExperianToken();
				expect(result).toEqual(storedExperianToken);
			});

			it("should handle error when sending message to dynamo", async () => {
				mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});
				await expect(experianServiceTest.getExperianToken()).rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.SERVER_ERROR,
					message: "Error retrieving Experian token",
				}));
			});
		});

		describe("#generateExperianToken", () => {

			const expectedParams = {
				username: clientUsername,
				password: clientPassword,
				client_id: clientId,
				client_secret: clientSecret,
			};

			const config: AxiosRequestConfig<any> = {
				headers: {
					"Content-Type": "application/json",
					"X-Correlation-Id": "randomId",
					"X-User-Domain": "cabinetofficegds.com",
				},
			};

			it("Should return a valid access token response if a valid access token already exists", async () => {
				experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(storedExperianToken);
				const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret, experianTokenUrl);
				expect(data).toBe(storedExperianToken);
			});

			it("Should generate a new access token if a valid access token does not exist", async () => {
				experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(expiredToken);
				jest.spyOn(axios, "post").mockResolvedValueOnce({ data: experianTokenResponse });
				const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret, experianTokenUrl);
				expect(axios.post).toHaveBeenCalledWith(experianTokenUrl, expectedParams, config);
				expect(data).toBe(experianTokenResponse);
			});

			it("Should return existing access token if call to Experian token endpoint fails", async () => {
				const error = {
					response: {
						status: 400, message: "Bad request",
					},
					message: "ERROR",
				};

				experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(expiredToken);
				jest.spyOn(axios, "post").mockRejectedValueOnce(error);
				const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret, experianTokenUrl);
				expect(axios.post).toHaveBeenCalledWith(experianTokenUrl, expectedParams, config);
				expect(data).toBe(expiredToken);
				expect(logger.error).toHaveBeenCalledWith(
					{ errorMessage: "ERROR",
						message: "Error refreshing Experian token - returning previous Experian token",
						statusCode: 400,
						messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN },
				);
			});

			it("Should throw app error if no access token present and call to Experian token endpoint fails", async () => {
				const error = {
					response: {
						status: 400, message: "Bad request",
					},
				};

				experianServiceTest.getExperianToken = jest.fn().mockResolvedValue(undefined);
				jest.spyOn(axios, "post").mockRejectedValueOnce(error); 
				await expect(experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret, experianTokenUrl)).rejects.toThrow(expect.objectContaining({
					message: "Error generating Experian token and no previous token found",
					statusCode: HttpCodesEnum.SERVER_ERROR,
				}));
			});
		});
	});

});

