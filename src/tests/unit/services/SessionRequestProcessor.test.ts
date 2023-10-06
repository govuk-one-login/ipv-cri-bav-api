/* eslint @typescript-eslint/unbound-method: 0 */
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
import { KmsJwtAdapter } from "../../../utils/KmsJwtAdapter";
import { SECURITY_HEADERS } from "../../../utils/Response";
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
				birthDate:[
					{
					   "value":"1960-02-02",
					},
				],
				address: [
					{
						addressCountry: "GB",
						buildingName: "Sherman",
						subBuildingName: "Flat 5",
						uprn: 123456789,
						streetName: "Wallaby Way",
						postalCode: "F1 1SH",
						buildingNumber: "32",
						addressLocality: "Sidney",
					},
				],
				emailAddress:"test.user@digital.cabinet-office.gov.uk",
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
	beforeAll(() => {
		sessionRequestProcessor = new SessionRequestProcessor(logger, metrics);
		// @ts-ignore
		sessionRequestProcessor.BavService = mockBavService;
		// @ts-ignore
		sessionRequestProcessor.kmsDecryptor = mockKmsJwtAdapter;
	});

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(1585695600000)); // == 2020-03-31T23:00:00.000Z
		process.env.AUTH_SESSION_TTL_SECS = "950400";
		process.env.ISSUER = "https://XXX-c.env.account.gov.uk";
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.resetAllMocks();
	});

	it("should throw error where there is unrecognised client", async () => {
		const response = await sessionRequestProcessor.processRequest(SESSION_WITH_INVALID_CLIENT);

		expect(response.statusCode).toBe(HttpCodesEnum.BAD_REQUEST);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			expect.anything(),
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
			"Invalid request: Could not verify jwt",
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
		const errorMessage = "Missing emailAddress";
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonDetailsValid").mockReturnValue(errorMessage);

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				message: `${errorMessage} from shared claims data`,
				messageCode: MessageCodes.INVALID_PERSONAL_DETAILS,
			}),
		);
	});

	it("throws error if AUTH_SESSION_TTL_SECS is not set", async () => {
		process.env.AUTH_SESSION_TTL_SECS = "";
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonDetailsValid").mockReturnValue("");

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.SERVER_ERROR);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Missing AUTH_SESSION_TTL_SECS environment variable",
				messageCode: MessageCodes.MISSING_CONFIGURATION,
			}),
		);
	});

	it("generates a session ID and appends it to the logs", async () => {
		mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonDetailsValid").mockReturnValue("");

		await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(logger.appendKeys).toHaveBeenCalledWith({
			sessionId: "mock-session-id",
			govuk_signin_journey_id: "abcdef",
		});
	});

	// it("should fail to create a session", async () => {
	// 	mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
	// 	mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
	// 	mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
	// 	mockValidationHelper.isJwtValid.mockReturnValue("");
	// 	mockValidationHelper.isPersonDetailsValid.mockReturnValue({ errorMessage : "", errorMessageCode : "" });
	// 	mockValidationHelper.isAddressFormatValid.mockReturnValue({ errorMessage:"", errorMessageCode: "" });
	// 	mockBavService.getSessionById.mockResolvedValue(undefined);
	// 	mockBavService.createAuthSession.mockRejectedValue("error");

	// 	const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

	// 	expect(logger.error).toHaveBeenCalledTimes(1);
	// 	expect(logger.error).toHaveBeenCalledWith(
	// 		expect.anything(),
	// 		expect.objectContaining({
	// 			messageCode: "FAILED_CREATING_SESSION",
	// 		}),
	// 	);
	// 	expect(response.statusCode).toBe(HttpCodesEnum.SERVER_ERROR);
	// 	expect(logger.appendKeys).toHaveBeenCalledWith({
	// 		sessionId: expect.any(String),
	// 		govuk_signin_journey_id: "abcdef",
	// 	});
	// });

	it("throws error if ISSUER is not set", async () => {
		process.env.ISSUER = "";
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonDetailsValid").mockReturnValue("");

		const response = await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(response.statusCode).toBe(HttpCodesEnum.SERVER_ERROR);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Missing ISSUER environment variable",
				messageCode: MessageCodes.MISSING_CONFIGURATION,
			}),
		);
	});

	it("sends BAV_CRI_START event to txma", async () => {
		mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonDetailsValid").mockReturnValue("");

		await sessionRequestProcessor.processRequest(VALID_SESSION);

		expect(mockBavService.sendToTXMA).toHaveBeenCalledWith({
			event_name: "BAV_CRI_START",
			client_id: undefined,
			component_id: "https://XXX-c.env.account.gov.uk",
			timestamp: 1585695600000 / 1000,
			user: {
				govuk_signin_journey_id: "abcdef",
				ip_address: "",
				persistent_session_id: undefined,
				session_id: "mock-session-id",
				user_id: "",
			},
		});
	});

	it("successful response is returned if all processing ahs passed", async () => {
		mockBavService.generateSessionId.mockResolvedValue("mock-session-id");
		mockKmsJwtAdapter.decrypt.mockResolvedValue("success");
		mockKmsJwtAdapter.decode.mockReturnValue(decodedJwtFactory());
		mockKmsJwtAdapter.verifyWithJwks.mockResolvedValue(decryptedJwtPayloadFactory());
		jest.spyOn(Validations, "isJwtValid").mockReturnValue("");
		jest.spyOn(Validations, "isPersonDetailsValid").mockReturnValue("");

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
