/* eslint-disable max-lines-per-function */
import { UserInfoRequestProcessor } from "../../../services/UserInfoRequestProcessor";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { mock } from "jest-mock-extended";
import { Logger } from "@aws-lambda-powertools/logger";
import { MISSING_AUTH_HEADER_USERINFO, VALID_USERINFO } from "../data/userInfo-events";
import { BavService } from "../../../services/BavService";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { ISessionItem } from "../../../models/ISessionItem";
import { PersonIdentityItem } from "../../../models/PersonIdentityItem";
import { absoluteTimeNow } from "../../../utils/DateTimeUtils";
import { MockKmsJwtAdapter } from "../utils/MockJwtVerifierSigner";
import * as Validations from "../../../utils/Validations";
import { APIGatewayProxyResult } from "aws-lambda";

/* eslint @typescript-eslint/unbound-method: 0 */
/* eslint jest/unbound-method: error */

let userInforequestProcessorTest: UserInfoRequestProcessor;
const mockBavService = mock<BavService>();
let mockSession: ISessionItem;
let mockPerson: PersonIdentityItem;
const passingKmsJwtAdapterFactory = (_signingKeys: string) => new MockKmsJwtAdapter(true);
const failingKmsJwtAdapterFactory = (_signingKeys: string) => new MockKmsJwtAdapter(false);


const logger = mock<Logger>();
const metrics = new Metrics({ namespace: "BAV" });
const credentialVendor = "EXPERIAN";

function getMockSessionItem(): ISessionItem {
	const sess: ISessionItem = {
		sessionId: "sdfsdg",
		clientId: "ipv-core-stub",
		accessToken: "AbCdEf123456",
		clientSessionId: "sdfssg",
		authorizationCode: "",
		authorizationCodeExpiryDate: 123,
		redirectUri: "http",
		accessTokenExpiryDate: 1234,
		expiryDate: 123,
		createdDate: 123,
		state: "initial",
		subject: "sub",
		persistentSessionId: "sdgsdg",
		clientIpAddress: "127.0.0.1",
		authSessionState: "BAV_ACCESS_TOKEN_ISSUED",
		copCheckResult: "FULL_MATCH",
		attemptCount: 1,
		vendorUuid: "1c756b7e-b5b8-4f33-966d-4aeee9bb0000",
	};
	return sess;
}

function getMockPersonItem(): PersonIdentityItem {
	const person: PersonIdentityItem = {
		sessionId: "sdfsdg",
		sortCode: "111111",
		accountNumber: "10199283",
		name: [{
			nameParts: [
				{ type: "GivenName", value: "FRED" },
				{ type: "GivenName", value: "NICK" },
				{ type: "FamilyName", value: "Flintstone" },
			],
		}],
		birthDate: [{
			value: "12-01-1986",
		}],
		expiryDate: 123,
		createdDate: 0,
	};
	return person;
}

describe("UserInfoRequestProcessor", () => {
	beforeAll(() => {
		mockSession = getMockSessionItem();
		mockPerson = getMockPersonItem();
		userInforequestProcessorTest = new UserInfoRequestProcessor(logger, metrics, credentialVendor);
		// @ts-ignore
		userInforequestProcessorTest.BavService = mockBavService;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		// @ts-ignore
		userInforequestProcessorTest.kmsJwtAdapter = passingKmsJwtAdapterFactory();
		mockSession = getMockSessionItem();
		mockPerson = getMockPersonItem();
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(new Date(1585695600000));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("Return successful response with 200 OK when user data is found for an accessToken", async () => {
		mockBavService.getSessionById.mockResolvedValue(mockSession);
		mockBavService.getPersonIdentityBySessionId.mockResolvedValue(mockPerson);
		// @ts-ignore
		userInforequestProcessorTest.verifiableCredentialService.kmsJwtAdapter = passingKmsJwtAdapterFactory();
		jest.spyOn(Validations, "eventToSubjectIdentifier").mockResolvedValueOnce("sessionId");

		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);
		expect(mockBavService.getSessionById).toHaveBeenCalledTimes(1);
		expect(mockBavService.getPersonIdentityBySessionId).toHaveBeenCalledTimes(1);
		expect(mockBavService.updateSessionAuthState).toHaveBeenCalledTimes(1);
		expect(mockBavService.updateSessionAuthState).toHaveBeenCalledWith("sdfsdg", "BAV_CRI_VC_ISSUED");
		expect(mockBavService.sendToTXMA).toHaveBeenNthCalledWith(1, "MYQUEUE", {
			"component_id":"https://XXX-c.env.account.gov.uk",
			"event_name":"BAV_CRI_VC_ISSUED",
			"restricted":{
				"name":[
					{
						"nameParts":[
							{
								"type":"GivenName",
								"value":"FRED",
							},
							{
								"type":"GivenName",
								"value":"NICK",
							},
							{
								"type":"FamilyName",
								"value":"Flintstone",
							},
						],
					},
				],
				"birthDate": [{
					"value": "12-01-1986",
				}],
				"bankAccount": [
					{
						"sortCode": "111111",
						"accountNumber": "10199283",
					},
				],
			},
			"timestamp":1585695600,
			"event_timestamp_ms":1585695600000,
			"user":{
				"ip_address":"127.0.0.1",
				"govuk_signin_journey_id": "sdfssg",
				"session_id":"sdfsdg",
				"user_id":"sub",
			},
		 "extensions": {
				"evidence": [
					 {
						"txn": "1c756b7e-b5b8-4f33-966d-4aeee9bb0000",
						"strengthScore": 3,
						"validityScore": 2,
						"attemptNum": 1,
						"ci": undefined,
						"ciReasons": [
							{
								"ci": undefined,
								"reason": "FULL_MATCH",
							},
						],
					 },
				],
		 },
		});
		expect(mockBavService.sendToTXMA).toHaveBeenNthCalledWith(2, "MYQUEUE", {
			"component_id":"https://XXX-c.env.account.gov.uk",
			"event_name":"BAV_CRI_END",
			"timestamp":1585695600,
			"event_timestamp_ms":1585695600000,
			"user":{
				"ip_address":"127.0.0.1",
				"session_id":"sdfsdg",
				"govuk_signin_journey_id": "sdfssg",
				"user_id":"sub",
			},
		});
		expect(out.body).toEqual(JSON.stringify({
			sub: "sub",
			"https://vocab.account.gov.uk/v1/credentialJWT": ["signedJwt-test"],
		}));
		expect(out.statusCode).toBe(HttpCodesEnum.OK);
		expect(logger.info).toHaveBeenCalledTimes(2);
		expect(logger.appendKeys).toHaveBeenCalledWith({
			govuk_signin_journey_id: "sdfssg",
		});
		expect(logger.appendKeys).toHaveBeenCalledWith({
			sessionId: "sessionId",
		});
	});

	it("Return 401 when Authorization header is missing in the request", async () => {
		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(MISSING_AUTH_HEADER_USERINFO);

		// @ts-ignore
		expect(out.body).toBe("Error Validating Token");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"Error validating Authentication Access token from headers: ",
			expect.objectContaining({
				messageCode: "INVALID_AUTH_CODE",
			}),
		);
	});

	it("Return 401 when access_token JWT validation fails", async () => {
		// @ts-ignore
		userInforequestProcessorTest.kmsJwtAdapter = failingKmsJwtAdapterFactory();
		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);

		// @ts-ignore
		expect(out.body).toBe("Error Validating Token");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"Error validating Authentication Access token from headers: ",
			expect.objectContaining({
				messageCode: "INVALID_AUTH_CODE",
			}),
		);
	});

	it("Return 401 when sub is missing from JWT access_token", async () => {
		// @ts-ignore
		userInforequestProcessorTest.kmsJwtAdapter.mockJwt.payload.sub = null;
		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);

		// @ts-ignore
		expect(out.body).toBe("Error Validating Token");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"Error validating Authentication Access token from headers: ",
			expect.objectContaining({
				messageCode: "INVALID_AUTH_CODE",
			}),
		);
	});

	it("Return 401 when we receive expired JWT access_token", async () => {
		// @ts-ignore
		userInforequestProcessorTest.kmsJwtAdapter.mockJwt.payload.exp = absoluteTimeNow() - 500;
		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);

		// @ts-ignore
		expect(out.body).toBe("Error Validating Token");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"Error validating Authentication Access token from headers: ",
			expect.objectContaining({
				messageCode: "INVALID_AUTH_CODE",
			}),
		);
	});

	it("Return 401 when session (based upon sub) was not found in the DB", async () => {
		jest.spyOn(Validations, "eventToSubjectIdentifier").mockResolvedValueOnce("sessionId");
		mockBavService.getSessionById.mockResolvedValue(undefined);

		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);

		expect(mockBavService.getSessionById).toHaveBeenCalledTimes(1);
		expect(out.body).toContain("No Session Found");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messageCode: "SESSION_NOT_FOUND",
			}),
		);
	});

	it("Return 401 when person (based upon sub) was not found in the DB", async () => {
		jest.spyOn(Validations, "eventToSubjectIdentifier").mockResolvedValueOnce("sessionId");
		mockBavService.getSessionById.mockResolvedValue(mockSession);
		mockBavService.getPersonIdentityBySessionId.mockResolvedValue(undefined);

		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);

		expect(mockBavService.getPersonIdentityBySessionId).toHaveBeenCalledTimes(1);
		expect(out.body).toContain("Missing Person Identity");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messageCode: "PERSON_NOT_FOUND",
			}),
		);
	});

	it("Return error when person names are missing", async () => {
		jest.spyOn(Validations, "eventToSubjectIdentifier").mockResolvedValueOnce("sessionId");
		mockBavService.getSessionById.mockResolvedValue(mockSession);
		// @ts-ignore
		mockPerson.name[0].nameParts = [];
		mockBavService.getPersonIdentityBySessionId.mockResolvedValue(mockPerson);

		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);
		expect(mockBavService.getSessionById).toHaveBeenCalledTimes(1);
		expect(mockBavService.getPersonIdentityBySessionId).toHaveBeenCalledTimes(1);

		expect(out.body).toBe("Bad Request");
		expect(out.statusCode).toBe(HttpCodesEnum.BAD_REQUEST);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.appendKeys).toHaveBeenCalledWith({
			govuk_signin_journey_id: "sdfssg",
		});
		expect(logger.appendKeys).toHaveBeenCalledWith({
			sessionId: "sessionId",
		});
		expect(logger.error).toHaveBeenCalledWith(
			"Missing required fields to generate BAV VC",
			{
				messageCode: "MISSING_PERSONAL_DETAILS",
			},
			{
				accountNumber: true,
				names: false,
				sortCode: true,
			},
		);
	});

	it("Return 401 when AuthSessionState is not BAV_ACCESS_TOKEN_ISSUED", async () => {
		jest.spyOn(Validations, "eventToSubjectIdentifier").mockResolvedValueOnce("sessionId");
		mockBavService.getSessionById.mockResolvedValue(mockSession);
		mockSession.authSessionState = "BAV_AUTH_CODE_ISSUED";
		const out: APIGatewayProxyResult = await userInforequestProcessorTest.processRequest(VALID_USERINFO);

		expect(mockBavService.getSessionById).toHaveBeenCalledTimes(1);
		expect(out.body).toContain("Invalid Session State");
		expect(out.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.appendKeys).toHaveBeenCalledWith({
			govuk_signin_journey_id: "sdfssg",
		});
		expect(logger.appendKeys).toHaveBeenCalledWith({
			sessionId: "sessionId",
		});
		expect(logger.error).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messageCode: "INCORRECT_SESSION_STATE",
			}),
		);
	});
});
