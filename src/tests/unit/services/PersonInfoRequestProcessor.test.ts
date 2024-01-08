/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";
import NodeRSA from "node-rsa";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { ISessionItem } from "../../../models/ISessionItem";
import { PersonIdentityItem } from "../../../models/PersonIdentityItem";
import { BavService } from "../../../services/BavService";
import { PersonInfoRequestProcessor } from "../../../services/PersonInfoRequestProcessor";

const encryptMock = jest.fn();
jest.mock("node-rsa", () => {
	return jest.fn().mockImplementation(() => ({
		encrypt: encryptMock,
	}));
});

const mockBavService = mock<BavService>();
const logger = mock<Logger>();
const metrics = new Metrics({ namespace: "BAV" });
const PUBLIC_KEY_SSM_PARAM = "argadfgadf";
const sessionId = "sessionId";
const person: PersonIdentityItem = {
	sessionId,
	name: [{
		nameParts: [{
			value: "Frederick",
			type: "GivenName",
		},
		{
			value: "Joseph",
			type: "GivenName",
		},
		{
			value: "Flintstone",
			type: "FamilyName",
		}],
	}],
	expiryDate: 123456789,
	createdDate: 123456789,
};
const session = require("../data/db_record.json") as ISessionItem;
let personInfoRequestProcessorTest: PersonInfoRequestProcessor;

describe("PersonInfoRequestProcessor", () => {
	beforeAll(() => {
		personInfoRequestProcessorTest = new PersonInfoRequestProcessor(logger, metrics, PUBLIC_KEY_SSM_PARAM);
		// @ts-ignore
		personInfoRequestProcessorTest.BavService = mockBavService;
	});

	describe("#processRequest", () => {
		it("returns error response if person identity cannot be found", async () => {
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(undefined);

			const response = await personInfoRequestProcessorTest.processRequest(sessionId);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No person found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No person found for session id", {
				messageCode: MessageCodes.PERSON_NOT_FOUND,
			});
		});

		it("returns error response if session cannot be found", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(undefined);

			const response = await personInfoRequestProcessorTest.processRequest(sessionId);

			expect(response.statusCode).toBe(HttpCodesEnum.UNAUTHORIZED);
			expect(response.body).toBe(`No session found with the session id: ${sessionId}`);
			expect(logger.error).toHaveBeenCalledWith("No session found for session id", {
				messageCode: MessageCodes.SESSION_NOT_FOUND,
			});
		});

		it("returns succesfull response with encrypted name", async () => {
			mockBavService.getPersonIdentityById.mockResolvedValueOnce(person);
			mockBavService.getSessionById.mockResolvedValueOnce(session);
			const encryptSpy = jest.spyOn(personInfoRequestProcessorTest, "encryptResponse").mockReturnValueOnce("Encrypted name");

			const response = await personInfoRequestProcessorTest.processRequest(sessionId);

			expect(response.statusCode).toBe(HttpCodesEnum.OK);
			expect(encryptSpy).toHaveBeenCalledWith({ name: "Frederick Joseph Flintstone" });
			expect(response.body).toBe("Encrypted name");
		});
	});

	describe("#encryptResponse", () => {
		it("encrypts data with public key and returns it", () => {
			const data = { name: "Frederick Joseph Flintstone" };
			encryptMock.mockReturnValueOnce("Encrypted name");

			const result = personInfoRequestProcessorTest.encryptResponse(data);

			expect(NodeRSA).toHaveBeenCalledWith(PUBLIC_KEY_SSM_PARAM);
			expect(encryptMock).toHaveBeenCalledWith(JSON.stringify(data), "base64");
			expect(result).toBe("Encrypted name");
		});
	});
});
