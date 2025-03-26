/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable max-lines-per-function */
import { mock } from "jest-mock-extended";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { AbortRequestProcessor } from "../../../services/AbortRequestProcessor";
import { BavService } from "../../../services/BavService";
import { ISessionItem } from "../../../models/ISessionItem";
import { AuthSessionState } from "../../../models/enums/AuthSessionState";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { APIGatewayProxyResult } from "aws-lambda";

const mockBavService = mock<BavService>();
const logger = mock<Logger>();

let abortRequestProcessor: AbortRequestProcessor;
const metrics = new Metrics({ namespace: "BAV" });
const sessionId = "session_id";
const encodedTxmaHeader = "ABCDEFG";
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

describe("AbortRequestProcessor", () => {
	beforeAll(() => {
		abortRequestProcessor = new AbortRequestProcessor(logger, metrics);
		// @ts-expect-error private access manipulation used for testing
		abortRequestProcessor.BavService = mockBavService;
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

		const response = await abortRequestProcessor.processRequest(sessionId, encodedTxmaHeader);

		expect(response.statusCode).toEqual(HttpCodesEnum.UNAUTHORIZED);
		expect(response.body).toBe(`No session found with the session id: ${sessionId}`);
	});

	it("returns successful response if session has already been aborted", async () => {
		mockBavService.getSessionById.mockResolvedValueOnce({ ...session, authSessionState: AuthSessionState.BAV_SESSION_ABORTED });

		const out: APIGatewayProxyResult = await abortRequestProcessor.processRequest(sessionId, encodedTxmaHeader);

		expect(out.statusCode).toBe(HttpCodesEnum.OK);
		expect(out.body).toBe("Session has already been aborted");
		expect(logger.info).toHaveBeenCalledWith("Session has already been aborted");
	});

	it("updates auth session state and returns successful response if session has not been aborted", async () => {
		mockBavService.getSessionById.mockResolvedValueOnce(session);

		const out: APIGatewayProxyResult = await abortRequestProcessor.processRequest(sessionId, encodedTxmaHeader);

		expect(mockBavService.updateSessionAuthState).toHaveBeenCalledWith(sessionId, AuthSessionState.BAV_SESSION_ABORTED);
		expect(out.statusCode).toBe(HttpCodesEnum.OK);
		expect(out.body).toBe("Session has been aborted");
		expect(out.headers?.Location).toBe(encodeURIComponent(`${session.redirectUri}?error=access_denied&state=${session.state}`));
	});

	it("Returns successful response if session has not been aborted and redirectUri contains bav id", async () => {
		const bavSessionItemClone = session;
		bavSessionItemClone.redirectUri = "http://localhost:8085/callback?id=bav";
		mockBavService.getSessionById.mockResolvedValueOnce(session);

		const out: APIGatewayProxyResult = await abortRequestProcessor.processRequest(sessionId, encodedTxmaHeader);

		expect(mockBavService.updateSessionAuthState).toHaveBeenCalledWith(sessionId, AuthSessionState.BAV_SESSION_ABORTED);
		expect(out.statusCode).toBe(HttpCodesEnum.OK);
		expect(out.body).toBe("Session has been aborted");
		expect(out.headers?.Location).toBe(encodeURIComponent(`${session.redirectUri}&error=access_denied&state=${session.state}`));
	});

	it("sends TxMA event after auth session state has been updated", async () => {
		mockBavService.getSessionById.mockResolvedValueOnce(session);

		await abortRequestProcessor.processRequest(sessionId, encodedTxmaHeader);

		expect(mockBavService.sendToTXMA).toHaveBeenCalledWith("MYQUEUE", {
			event_name: "BAV_CRI_SESSION_ABORTED",
			component_id: "https://XXX-c.env.account.gov.uk",
			timestamp: 1585695600,
			event_timestamp_ms: 1585695600000,
			user: {
			  ip_address: session.clientIpAddress,
			  session_id: sessionId,
			  user_id: session.subject,
			  govuk_signin_journey_id: session.clientSessionId,
			},
		},
		"ABCDEFG",
		);
	});
});
