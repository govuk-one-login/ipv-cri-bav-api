 
 
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { mock } from "jest-mock-extended";
import { JWTPayload } from "jose";
import { VALID_SESSION, SESSION_WITH_INVALID_CLIENT } from "../data/session-events";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { Jwt } from "../../../models/IVeriCredential";
import { SessionRequestProcessor } from "../../../services/SessionRequestProcessor";
import { BavService } from "../../../services/BavService";
import { Constants } from "../../../utils/Constants";
import * as envVarUtils from "../../../utils/EnvironmentVariables";
import { KmsJwtAdapter } from "../../../utils/KmsJwtAdapter";
import { SECURITY_HEADERS } from "../../../utils/Response";
import * as TxmaEventUtils from "../../../utils/TxmaEvent";
import * as Validations from "../../../utils/Validations";

let sessionRequestProcessor: SessionRequestProcessor;
const mockBavService = mock<BavService>();
const mockKmsJwtAdapter = mock<KmsJwtAdapter>();
const logger = mock<Logger>();
const metrics = mock<Metrics>();

const decodedJwtFactory = ():Jwt => {
	return {
		header: {
			alg: "mock",
		},
		payload: {
			govuk_signin_journey_id: "abcdef",
			shared_claims:{
				name:[
					{
					   nameParts:[
						  {
							 value:"John",
							 type:"GivenName",
						  },
						  {
							 value:"Joseph",
							 type:"GivenName",
						  },
						  {
							 value:"Testing",
							 type:"FamilyName",
						  },
					   ],
					},
				],
			},
		},
		signature: "signature",
	};
};

const decryptedJwtPayloadFactory = ():JWTPayload => {
	return {
		iss: "mock",
		sub: "mock",
		aud: "mock",
		jti: "mock",
		nbf: 1234,
		exp: 5678,
		iat: 1234,		
	};
};

describe("SessionRequestProcessor", () => {
	beforeEach(() => {
		jest.spyOn(TxmaEventUtils, "buildCoreEventFields");

		jest.useFakeTimers();
		jest.setSystemTime(new Date(1585695600000)); // == 2020-03-31T23:00:00.000Z
		sessionRequestProcessor = new SessionRequestProcessor(logger, metrics);
		// @ts-expect-error private access manipulation used for testing
		sessionRequestProcessor.BavService = mockBavService;
		// @ts-expect-error private access manipulation used for testing
		sessionRequestProcessor.kmsDecryptor = mockKmsJwtAdapter;
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.resetAllMocks();
		jest.restoreAllMocks();
	});

	it("should throw error where client config cannot be processed", async () => {
		jest.spyOn(envVarUtils, "checkEnvironmentVariable").mockReturnValue("test");
		sessionRequestProcessor = new SessionRequestProcessor(logger, metrics);

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.SERVER_ERROR);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"Invalid or missing client configuration table",
			expect.objectContaining({
				messageCode: MessageCodes.MISSING_CONFIGURATION,
			}),
		);
	});

	it("should throw error where there is unrecognised client", async () => {
		const response = await sessionRequestProcessor.processRequest(SESSION_WITH_INVALID_CLIENT);

		expect(response.statusCode).toBe(HttpCodesEnum.BAD_REQUEST);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"Unrecognised client in request",
			expect.objectContaining({
				messageCode: MessageCodes.UNRECOGNISED_CLIENT,
			}),
		);
	});

	it("should throw error where there is a JWE decryption failure", async () => {
		mockKmsJwtAdapter.decrypt.mockRejectedValue("error");

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messageCode: "FAILED_DECRYPTING_JWE",
			}),
		);
	});

	it("should throw error where there is a failure to decode JWT", async () => {
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockImplementation(() => {
			throw Error("Error");
		});

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messageCode: "FAILED_DECODING_JWT",
			}),
		);
	});

	it("should throw error where there is a JWT verification failure", async () => {
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(null);

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledWith(
			"Failed to verify JWT",
			expect.objectContaining({
				messageCode: MessageCodes.FAILED_VERIFYING_JWT,
			}),
		);
	});

	it("should throw error where there is an unexpected error verifying JWT", async () => {
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockRejectedValue({});

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"Invalid request: Could not verify JWT",
			expect.objectContaining({
				error: {},
				messageCode: MessageCodes.FAILED_VERIFYING_JWT,
			}),
		);
	});

	it("should throw error where there is a JWT validation failure", async () => {
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("errors");

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messageCode: MessageCodes.FAILED_VALIDATING_JWT,
			}),
		);
	});

	it("should return unauthorized when person details from shared claims are invalid", async () => {
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonNameValid").mockReturnValue(false);

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Missing GivenName or FamilyName from shared claims data",
				messageCode: MessageCodes.INVALID_PERSONAL_DETAILS,
			}),
		);
	});

	it("generates a session ID and appends it to the logs", async () => {
		mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonNameValid").mockReturnValue(true);

		await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(logger.appendKeys).toHaveBeenCalledWith({ govuk_signin_journey_id: "abcdef" });
		expect(logger.appendKeys).toHaveBeenCalledWith({ sessionId: "mock-session-id" });
	});

	describe("sends BAV_CRI_START event to txma", () => {
		it("when no headers are included defaults are used", async () => {
			mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
			mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
			mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
			mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
			jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
			jest.spyOn(Validations, "isPersonNameValid").mockReturnValue(true);

			const sessionWithOutHeaders = JSON.parse(JSON.stringify(VALID_SESSION));
			delete sessionWithOutHeaders.headers;

			await sessionRequestProcessor.processRequest(sessionWithOutHeaders);

			expect(TxmaEventUtils.buildCoreEventFields).toHaveBeenCalledWith(
				expect.anything(),
				"https://XXX-c.env.account.gov.uk",
				sessionWithOutHeaders.requestContext.identity?.sourceIp,
			);
			expect(mockBavService.sendToTXMA).toHaveBeenCalledWith(
				process.env.TXMA_QUEUE_URL,
				{
					event_name: "BAV_CRI_START",
					component_id: "https://XXX-c.env.account.gov.uk",
					timestamp: 1585695600000 / 1000,
					event_timestamp_ms: 1585695600000,
					user: {
						govuk_signin_journey_id: "abcdef",
						ip_address: sessionWithOutHeaders.requestContext.identity?.sourceIp,
						session_id: "mock-session-id",
						user_id: "",
					},
				},
				undefined,
			);
		});

		it("when headers are empty defaults are used", async () => {
			mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
			mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
			mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
			mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
			jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
			jest.spyOn(Validations, "isPersonNameValid").mockReturnValue(true);

			await sessionRequestProcessor.processRequest({ ...VALID_SESSION, headers: {} });

			expect(TxmaEventUtils.buildCoreEventFields).toHaveBeenCalledWith(
				expect.anything(),
				"https://XXX-c.env.account.gov.uk",
				VALID_SESSION.requestContext.identity?.sourceIp,
			);
			expect(mockBavService.sendToTXMA).toHaveBeenCalledWith(
				process.env.TXMA_QUEUE_URL,
				{
					event_name: "BAV_CRI_START",
					component_id: "https://XXX-c.env.account.gov.uk",
					timestamp: 1585695600000 / 1000,
					event_timestamp_ms: 1585695600000,
					user: {
						govuk_signin_journey_id: "abcdef",
						ip_address: VALID_SESSION.requestContext.identity?.sourceIp,
						session_id: "mock-session-id",
						user_id: "",
					},
				},
				undefined,
			);
		});

		it("ip_address is X_FORWARDED_FOR if header is present", async () => {
			mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
			mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
			mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
			mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
			jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
			jest.spyOn(Validations, "isPersonNameValid").mockReturnValue(true);
			const xForwardedFor = "x-forwarded-for";

			await sessionRequestProcessor.processRequest({
				...VALID_SESSION,
				headers: { ...VALID_SESSION.headers, [Constants.X_FORWARDED_FOR]: xForwardedFor },
			});

			expect(TxmaEventUtils.buildCoreEventFields).toHaveBeenCalledWith(
				expect.anything(),
				"https://XXX-c.env.account.gov.uk",
				xForwardedFor,
			);
			expect(mockBavService.sendToTXMA).toHaveBeenCalledWith(
				process.env.TXMA_QUEUE_URL,
				{
					event_name: "BAV_CRI_START",
					component_id: "https://XXX-c.env.account.gov.uk",
					timestamp: 1585695600000 / 1000,
					event_timestamp_ms: 1585695600000,
					user: {
						govuk_signin_journey_id: "abcdef",
						ip_address: xForwardedFor,
						session_id: "mock-session-id",
						user_id: "",
					},
				},
				VALID_SESSION.headers[Constants.ENCODED_AUDIT_HEADER],
			);
		});
	});


	it("successful response is returned if all processing has passed", async () => {
		mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonNameValid").mockReturnValue(true);

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(logger.info).toHaveBeenCalledWith("Session created successfully. Returning 200OK");
		expect(response).toEqual({
			statusCode: HttpCodesEnum.OK,
  		headers: SECURITY_HEADERS,
  		body: JSON.stringify({
  			session_id: "mock-session-id",
			}),
		});
	});
});
