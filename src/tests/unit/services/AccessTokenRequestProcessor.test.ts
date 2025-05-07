/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Metrics } from "@aws-lambda-powertools/metrics";
import { mock } from "jest-mock-extended";
import { Logger } from "@aws-lambda-powertools/logger";
import { ISessionItem } from "../../../models/ISessionItem";
import { AccessTokenRequestProcessor } from "../../../services/AccessTokenRequestProcessor";
import { AuthSessionState } from "../../../models/enums/AuthSessionState";
import { MISSING_BODY_ACCESSTOKEN, VALID_ACCESSTOKEN } from "../data/accessToken-events";
import { Constants } from "../../../utils/Constants";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
import { AppError } from "../../../utils/AppError";
import { BavService } from "../../../services/BavService";
import { MockFailingKmsSigningJwtAdapter, MockKmsSigningTokenJwtAdapter } from "../utils/MockJwtVerifierSigner";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import * as envVarUtils from "../../../utils/EnvironmentVariables";
import { MessageCodes } from "../../../models/enums/MessageCodes";

let accessTokenRequestProcessorTest: AccessTokenRequestProcessor;
const mockBavService = mock<BavService>();
let mockSession: ISessionItem;
jest.mock("../../../utils/KmsJwtAdapter");
// ignored to allow mocking
/* eslint-disable @typescript-eslint/no-unused-vars */
const passingKmsJwtAdapterFactory = (_signingKeys: string) => new MockKmsSigningTokenJwtAdapter();
// ignored to allow mocking
/* eslint-disable @typescript-eslint/no-unused-vars */
const failingKmsJwtSigningAdapterFactory = (_signingKeys: string) => new MockFailingKmsSigningJwtAdapter();
const logger = mock<Logger>();
const metrics = mock<Metrics>();
const ENCODED_REDIRECT_URI = encodeURIComponent("http://localhost:8085/callback");
const AUTHORIZATION_CODE = randomUUID();
let request: APIGatewayProxyEvent;

function getMockSessionItem(): ISessionItem {
	const sess: ISessionItem = {
		sessionId: "b0668808-67ce-8jc7-a2fc-132b81612111",
		clientId: "ipv-core-stub",
		clientSessionId: "sdfssg",
		accessToken: "AbCdEf123456",
		authorizationCode: "",
		authorizationCodeExpiryDate: 123,
		redirectUri: "http://localhost:8085/callback",
		accessTokenExpiryDate: 1234,
		expiryDate: 123,
		createdDate: 123,
		state: "initial",
		subject: "sub",
		persistentSessionId: "sdgsdg",
		clientIpAddress: "127.0.0.1",
		authSessionState: AuthSessionState.BAV_AUTH_CODE_ISSUED,
	};
	return sess;
}

describe("AccessTokenRequestProcessor", () => {
	beforeAll(() => {
		mockSession = getMockSessionItem();
		accessTokenRequestProcessorTest = new AccessTokenRequestProcessor(logger, metrics);
		// @ts-expect-error private access manipulation used for testing
		accessTokenRequestProcessorTest.bavService = mockBavService;
		request = VALID_ACCESSTOKEN;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		// @ts-expect-error private access manipulation used for testing
		accessTokenRequestProcessorTest.kmsJwtAdapter = passingKmsJwtAdapterFactory();
		// Setting the request body with a valid params
		// pragma: allowlist nextline secret
		request.body = `code=${AUTHORIZATION_CODE}&grant_type=authorization_code&redirect_uri=${ENCODED_REDIRECT_URI}&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer&client_assertion=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ijg2NTRmYmMxLTExMjEtNGIzOC1iMDM2LTAxM2RmODRjYmNlYyJ9.eyJzdWIiOiIyOTk4NmRkNS0wMWVjLTQyMzYtYWMyMS01ODQ1ZmRhZmQ5YjUiLCJyZWRpcmVjdF91cmkiOiJodHRwczovL2lwdnN0dWIucmV2aWV3LWMuZGV2LmFjY291bnQuZ292LnVrL3JlZGlyZWN0IiwicmVzcG9uc2VfdHlwZSI6ImNvZGUiLCJnb3Z1a19zaWduaW5fam91cm5leV9pZCI6Ijg4Y2UxNmUxZTU5MTkxZjE0YzlkMzU3MDk4M2JiYTg3IiwiYXVkIjoiaHR0cHM6Ly9jaWMtY3JpLWZyb250LnJldmlldy1jLmRldi5hY2NvdW50Lmdvdi51ayIsImlzcyI6Imh0dHBzOi8vaXB2LmNvcmUuYWNjb3VudC5nb3YudWsiLCJjbGllbnRfaWQiOiI1QzU4NDU3MiIsInN0YXRlIjoiZGYyMjVjNzdlN2MzOWU4ODJjM2FhNzc0NjcyMGM0NjUiLCJpYXQiOjE3NDM1OTg3MTksIm5iZiI6MTc0MzU5ODcxOCwiZXhwIjo0ODk3MTk4NzE5LCJzaGFyZWRfY2xhaW1zIjp7Im5hbWUiOlt7Im5hbWVQYXJ0cyI6W3sidmFsdWUiOiJGcmVkZXJpY2siLCJ0eXBlIjoiR2l2ZW5OYW1lIn0seyJ2YWx1ZSI6Ikpvc2VwaCIsInR5cGUiOiJHaXZlbk5hbWUifSx7InZhbHVlIjoiRmxpbnRzdG9uZSIsInR5cGUiOiJGYW1pbHlOYW1lIn1dfV0sImJpcnRoRGF0ZSI6W3sidmFsdWUiOiIxOTYwLTAyLTAyIn1dLCJlbWFpbCI6ImV4YW1wbGVAdGVzdGVtYWlsLmNvbSJ9fQ.7M7WQqMK1cp8zin6Rb2ZBxmxvsjc3vWTjdHpKYJApvzdXo6S1lxRK52l-rJR3AeBW7QS-28j6PW4LhgkX6O1mA`;
		mockSession = getMockSessionItem();
		mockBavService.getSessionByAuthorizationCode.mockResolvedValue(mockSession);
	});

	// it("Return bearer access token response when grant_type, code, redirect_uri, client_assertion_type and client_assertion parameters correctly are provided", async () => {
	// 	mockBavService.getSessionByAuthorizationCode.mockResolvedValue(mockSession);

	// 	const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);
	// 	// eslint-disable-next-line @typescript-eslint/unbound-method
	// 	expect(mockBavService.getSessionByAuthorizationCode).toHaveBeenCalledTimes(1);

	// 	expect(out.body).toEqual(JSON.stringify({
	// 		"access_token": "ACCESS_TOKEN",
	// 		"token_type": Constants.BEARER,
	// 		"expires_in": Constants.TOKEN_EXPIRY_SECONDS,
	// 	}));
	// 	expect(out.statusCode).toBe(HttpCodesEnum.OK);

	// 	expect(logger.appendKeys).toHaveBeenCalledWith({ govuk_signin_journey_id: mockSession.clientSessionId });
	// 	expect(logger.appendKeys).toHaveBeenCalledWith({ sessionId: mockSession.sessionId });
	// });

	// it("should throw error where client config cannot be processed", async () => {
	// 	jest.spyOn(envVarUtils, "checkEnvironmentVariable").mockReturnValue("test");
	// 	const response: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

	// 	expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	// 	expect(logger.error).toHaveBeenCalledTimes(1);
	// 	expect(logger.error).toHaveBeenCalledWith(
	// 		"Invalid or missing client configuration table",
	// 		expect.objectContaining({
	// 			messageCode: MessageCodes.MISSING_CONFIGURATION,
	// 		}),
	// 	);
	// });

	it("Returns 401 Unauthorized response when body is missing", async () => {
		const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(MISSING_BODY_ACCESSTOKEN);

		expect(out.body).toBe("Invalid request: missing body");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	});

	it.each([
		[`grant_type=authorization_code&redirect_uri=${ENCODED_REDIRECT_URI}`, "Invalid request: Missing code parameter"],
		[`code=${AUTHORIZATION_CODE}&redirect_uri=${ENCODED_REDIRECT_URI}`, "Invalid grant_type parameter"],
		[`code=${AUTHORIZATION_CODE}&grant_type=authorization_code`, "Invalid request: Missing redirect_uri parameter"],
	])("When parameters are not provided in the body, it returns 401 Unauthorized response", async (body, errMsg) => {
		request.body = body;
		const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

		expect(out.body).toBe(errMsg);
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);

	});

	it("Returns 401 Unauthorized response when grant_type parameter is not equal to 'authorization_code'", async () => {
		request.body = `code=${AUTHORIZATION_CODE}&grant_type=WRONG_CODE&redirect_uri=${ENCODED_REDIRECT_URI}`;
		const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

		expect(out.body).toBe("Invalid grant_type parameter");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	});

	it("Returns 401 Unauthorized response when code parameter is not a valid UUID", async () => {
		request.body = `code=1234&grant_type=authorization_code&redirect_uri=${ENCODED_REDIRECT_URI}`;
		const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

		expect(out.body).toBe("AuthorizationCode must be a valid uuid");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	});

	it("Return 401 Unauthorized response when AuthSessionState is not BAV_AUTH_CODE_ISSUED", async () => {
		mockSession.authSessionState = AuthSessionState.BAV_ACCESS_TOKEN_ISSUED;
		mockBavService.getSessionByAuthorizationCode.mockResolvedValue(mockSession);
		const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

		expect(out.body).toBe("Session is in the wrong state: BAV_ACCESS_TOKEN_ISSUED");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	});

	// it("Returns 401 Unauthorized response when redirect_uri parameter does not match the value in SessionTable", async () => {
	// 	request.body = `code=${AUTHORIZATION_CODE}&grant_type=authorization_code&redirect_uri=TEST_REDIRECT_URI`;
	// 	const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

	// 	expect(out.body).toBe("Invalid request: redirect uri TEST_REDIRECT_URI does not match configuration uri http://localhost:8085/callback");
	// 	expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	// });

	// it("Return 401 Unauthorized response when session was not found in the DB for a authorizationCode", async () => {
	// 	mockBavService.getSessionByAuthorizationCode.mockResolvedValue(undefined);

	// 	const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

	// 	expect(out.body).toBe("No session found by authorization code: " + AUTHORIZATION_CODE);
	// 	expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	// });

	// it("Return 500 Server Error when Failed to sign the access token Jwt", async () => {
	// 	// @ts-expect-error private access manipulation used for testing
	// 	accessTokenRequestProcessorTest.kmsJwtAdapter = failingKmsJwtSigningAdapterFactory();
	// 	const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

	// 	expect(out.body).toContain("Failed to sign the accessToken Jwt");
	// 	expect(out.statusCode).toBe(HttpCodesEnum.SERVER_ERROR);
	// });

	it("Return 401 when getting session from dynamoDB errors", async () => {
		mockBavService.getSessionByAuthorizationCode.mockImplementation(() => {
			throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Error retrieving Session by authorization code");
		});
		const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

		expect(out.body).toContain("Error retrieving Session by authorization code");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
	});

	// it("Return 500 when updating the session returns an error", async () => {
	// 	mockBavService.updateSessionWithAccessTokenDetails.mockImplementation(() => {
	// 		throw new AppError(HttpCodesEnum.SERVER_ERROR, "updateItem - failed: got error saving Access token details");
	// 	});
	// 	const out: APIGatewayProxyResult = await accessTokenRequestProcessorTest.processRequest(request);

	// 	expect(out.body).toContain("updateItem - failed: got error saving Access token details");
	// 	expect(out.statusCode).toBe(HttpCodesEnum.SERVER_ERROR);
	// });
});
