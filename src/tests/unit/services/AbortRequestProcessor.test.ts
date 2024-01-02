/* eslint-disable max-lines-per-function */
import { mock } from "jest-mock-extended";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { AbortRequestProcessor } from "../../../services/AbortRequestProcessor";
import { BavService } from "../../../services/BavService";
import { ISessionItem } from "../../../models/ISessionItem";
import { AuthSessionState } from "../../../models/enums/AuthSessionState";
import { Response } from "../../../utils/Response";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";

const mockBavService = mock<BavService>();
const logger = mock<Logger>();

let abortRequestProcessor: AbortRequestProcessor;
const metrics = new Metrics({ namespace: "BAV" });
const sessionId = "session_id";
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

describe("AbortRequestProcessor", () => {
	beforeAll(() => {
		abortRequestProcessor = new AbortRequestProcessor(logger, metrics);
    		// @ts-ignore
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

		const response = await abortRequestProcessor.processRequest(sessionId);

		expect(response.statusCode).toEqual(HttpCodesEnum.UNAUTHORIZED);
		expect(response.body).toBe(`No session found with the session id: ${sessionId}`);
	});

	it("returns successful response if session has already been aborted", async () => {
		mockBavService.getSessionById.mockResolvedValueOnce({ ...session, authSessionState: AuthSessionState.BAV_SESSION_ABORTED });

		const out: Response = await abortRequestProcessor.processRequest(sessionId);

		expect(out.statusCode).toBe(HttpCodesEnum.OK);
		expect(out.body).toBe("Session has already been aborted");
		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(logger.info).toHaveBeenCalledWith("Session has already been aborted");
	});

	it("updates auth session state and returns successful response if session has not been aborted", async () => {
		mockBavService.getSessionById.mockResolvedValueOnce(session);

		const out: Response = await abortRequestProcessor.processRequest(sessionId);

		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(mockBavService.updateSessionAuthState).toHaveBeenCalledWith(sessionId, AuthSessionState.BAV_SESSION_ABORTED);
		expect(out.statusCode).toBe(HttpCodesEnum.OK);
		expect(out.body).toBe("Session has been aborted");
		expect(out.headers).toStrictEqual({ Location: encodeURIComponent(`${session.redirectUri}?error=access_denied&state=${session.state}`) });
	});

	it("Returns successful response if session has not been aborted and redirectUri contains bav id", async () => {
		const bavSessionItemClone = session;
		bavSessionItemClone.redirectUri = "http://localhost:8085/callback?id=bav";
		mockBavService.getSessionById.mockResolvedValueOnce(session);

		const out: Response = await abortRequestProcessor.processRequest(sessionId);

		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(mockBavService.updateSessionAuthState).toHaveBeenCalledWith(sessionId, AuthSessionState.BAV_SESSION_ABORTED);
		expect(out.statusCode).toBe(HttpCodesEnum.OK);
		expect(out.body).toBe("Session has been aborted");
		expect(out.headers).toStrictEqual({ Location: encodeURIComponent(`${session.redirectUri}&error=access_denied&state=${session.state}`) });
	});

	it("sends TxMA event after auth session state has been updated", async () => {
		mockBavService.getSessionById.mockResolvedValueOnce(session);

		await abortRequestProcessor.processRequest(sessionId);

		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(mockBavService.sendToTXMA).toHaveBeenCalledWith("MYQUEUE", {
			event_name: "BAV_CRI_SESSION_ABORTED",
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
	});
});
