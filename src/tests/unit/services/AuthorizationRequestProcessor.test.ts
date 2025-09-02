 
 
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import { AuthSessionState } from "../../../models/enums/AuthSessionState";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { ISessionItem } from "../../../models/ISessionItem";
import { AuthorizationRequestProcessor } from "../../../services/AuthorizationRequestProcessor";
import { BavService } from "../../../services/BavService";

let authorizationRequestProcessorTest: AuthorizationRequestProcessor;
const metrics = new Metrics({ namespace: "BAV" });
const sessionId = "session_id";
const authorizationCode = "12345678";
const session: ISessionItem = {
	sessionId,
	clientId: "ipv-core-stub",
	accessToken: "AbCdEf123456",
	clientSessionId: "sdfssg",
	authorizationCode: "",
	authorizationCodeExpiryDate: 0,
	redirectUri: "http://localhost:8085/callback",
	accessTokenExpiryDate: 0,
	expiryDate: 221848913376,
	createdDate: 1675443004,
	state: "Y@atr",
	subject: "sub",
	persistentSessionId: "sdgsdg",
	clientIpAddress: "127.0.0.1",
	authSessionState: AuthSessionState.BAV_DATA_RECEIVED,
};
const authResponse = {
	authorizationCode: {
		value: authorizationCode,
	},
	redirect_uri: session.redirectUri,
	state: session.state,
};

const mockBavService = mock<BavService>();
const logger = mock<Logger>();
jest.mock("crypto", () => ({
	...jest.requireActual("crypto"),
	randomUUID: () => authorizationCode,
}));

describe("AuthorizationRequestProcessor", () => {
	beforeAll(() => {
		authorizationRequestProcessorTest = new AuthorizationRequestProcessor(logger, metrics);
		// @ts-expect-error private access manipulation used for testing
		authorizationRequestProcessorTest.BavService = mockBavService;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(new Date(1585695600000));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("throws error if session cannot be found", async () => {
		mockBavService.getSessionById.mockResolvedValue(undefined);

		const response = await authorizationRequestProcessorTest.processRequest(sessionId);

		expect(response.statusCode).toEqual(HttpCodesEnum.UNAUTHORIZED);
		expect(response.body).toBe(`No session found with the session id: ${sessionId}`);
	});

	it("throws error if session is in the wrong state", async () => {
		mockBavService.getSessionById.mockResolvedValue({ ...session, authSessionState: "UNKNOWN" });

		const response = await authorizationRequestProcessorTest.processRequest(sessionId);

		expect(response.statusCode).toEqual(HttpCodesEnum.UNAUTHORIZED);
		expect(response.body).toBe("Session is in the wrong state: UNKNOWN");
	});

	it("logs warning and creates a new auth code if authSessionState is BAV_AUTH_CODE_ISSUED", async () => {
		mockBavService.getSessionById.mockResolvedValue({ ...session, authSessionState: AuthSessionState.BAV_AUTH_CODE_ISSUED });

		const response = await authorizationRequestProcessorTest.processRequest(sessionId);

		expect(authorizationRequestProcessorTest.logger.info).toHaveBeenCalledWith(`Session is in state ${AuthSessionState.BAV_AUTH_CODE_ISSUED}, generating a new auth code`);
		expect(mockBavService.setAuthorizationCode).toHaveBeenCalledWith(sessionId, authorizationCode);
		expect(response.statusCode).toEqual(HttpCodesEnum.OK);
		expect(response.body).toBe(JSON.stringify(authResponse));
	});

	it("saves auth code, sends message to txma and returns response", async () => {
		mockBavService.getSessionById.mockResolvedValue(session);

		const response = await authorizationRequestProcessorTest.processRequest(sessionId);

		expect(mockBavService.setAuthorizationCode).toHaveBeenCalledWith(sessionId, authorizationCode);
		expect(response.statusCode).toEqual(HttpCodesEnum.OK);
		expect(response.body).toBe(JSON.stringify(authResponse));
	});
});
