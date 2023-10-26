/* eslint-disable @typescript-eslint/unbound-method */
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
	attemptCount: 1,
	authSessionState: AuthSessionState.BAV_DATA_RECEIVED,
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
		// @ts-ignore
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

	it("saves auth code, sends message to txma and returns response", async () => {
		mockBavService.getSessionById.mockResolvedValue(session);
		const authResponse = {
			authorizationCode: {
				value: authorizationCode,
			},
			redirect_uri: session.redirectUri,
			state: session.state,
		};

		const response = await authorizationRequestProcessorTest.processRequest(sessionId);

		expect(mockBavService.setAuthorizationCode).toHaveBeenCalledWith(sessionId, authorizationCode);
		expect(mockBavService.sendToTXMA).toHaveBeenCalledWith("MYQUEUE", {
			event_name: "BAV_CRI_AUTH_CODE_ISSUED",
			client_id: session.clientId,
			component_id: "https://XXX-c.env.account.gov.uk",
			timestamp: 1585695600,
			user: {
			  ip_address: session.clientIpAddress,
			  persistent_session_id: session.persistentSessionId,
			  session_id: sessionId,
			  user_id: session.subject,
			},
		});
		expect(response.statusCode).toEqual(HttpCodesEnum.OK);
		expect(response.body).toBe(JSON.stringify(authResponse));
	});
});
