/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import { ExperianService } from "../../../services/ExperianService";
import { mock } from "jest-mock-extended";
import { createDynamoDbClient } from "../../../utils/DynamoDBFactory";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import axios, { AxiosRequestConfig } from "axios";
import { Constants } from "../../../utils/Constants";

let experianServiceTest: ExperianService;
const experianBaseUrl = process.env.EXPERIAN_BASE_URL!;
const mockDynamoDbClient = jest.mocked(createDynamoDbClient());
const experianTokenTableName = "EXPERIANSTOKENTABLE";
const logger = mock<Logger>();

jest.spyOn(Date, "now").mockReturnValue(1728637200000); // 11/10/2024 09:00:00.000
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => "randomId",
}));

const mockToken = {
	"issued_at" : "1728637200000",
	"expires_in" : "1800",
	"token_type" : "Bearer",
	"access_token" : "TOKEN",
	"refresh_token" : "123456789123456789",
};

describe("Experian service", () => {
	
	beforeAll(() => {
		experianServiceTest = new ExperianService(logger, experianBaseUrl, mockDynamoDbClient, experianTokenTableName);
	});

	describe("#checkExperianToken", () => {
		it("should return access_token if token is valid and not expired", async () => {
		  mockDynamoDbClient.send = jest.fn().mockResolvedValue({ Item: mockToken });
		  const result = await experianServiceTest.checkExperianToken();
		  expect(result).toBe(mockToken);
		});

		it("should return undefined if no token found", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			const result = await experianServiceTest.checkExperianToken();
			expect(result).toBeUndefined();
		  });

		  it("should return undefined if token has expired", async () => {
			const expiredToken = {
				...mockToken,
				issued_at: 1728639000000, // 11/10/2024 09:30:00.000
			};
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({ expiredToken });
			const result = await experianServiceTest.checkExperianToken();
			expect(result).toBeUndefined();
		  });
	  });

	describe("#saveExperianToken", () => {
		it("should save Experian token with Id = 1", async () => {
			mockDynamoDbClient.send = jest.fn().mockResolvedValue({});
			await experianServiceTest.saveExperianToken(mockToken);
			expect(mockDynamoDbClient.send).toHaveBeenCalledWith(expect.objectContaining({
				input: {
					Item: {
						"id": "1",
						...mockToken,
					},
					TableName: experianTokenTableName,
				},
			}));
		});

		it("should handle error when sending message to dynamo", async () => {
			mockDynamoDbClient.send = jest.fn().mockRejectedValueOnce({});
			await expect(experianServiceTest.saveExperianToken(mockToken)).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.SERVER_ERROR,
				message: "Error storing new Experian token",
			}));
		});
	});

	describe("#generateExperianToken", () => {
		const clientUsername = "123456";
		const clientPassword = "12345678";
		const clientSecret = "Test";
		const clientId = "clientId";

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
			experianServiceTest.checkExperianToken = jest.fn().mockResolvedValue(mockToken);
			const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret);
			expect(data).toBe(mockToken);
		});

		it("Should generate a new access token if a valid access token does not exist", async () => {
			experianServiceTest.checkExperianToken = jest.fn().mockResolvedValue(undefined);
			jest.spyOn(axios, "post").mockResolvedValue({ data: mockToken });
			const data = await experianServiceTest.generateExperianToken(clientUsername, clientPassword, clientId, clientSecret);
			expect(axios.post).toHaveBeenCalledWith(`${experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`,
				expectedParams,
				config,
			);
			expect(data).toBe(mockToken);
		});

	});
});
