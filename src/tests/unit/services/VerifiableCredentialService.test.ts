/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { mock } from "jest-mock-extended";
import { Logger } from "@aws-lambda-powertools/logger";
import { ISessionItem } from "../../../models/ISessionItem";
import { VerifiableCredentialService } from "../../../services/VerifiableCredentialService";
import { KmsJwtAdapter } from "../../../utils/KmsJwtAdapter";
import { CopCheckResult } from "../../../models/enums/CopCheckResult";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { AppError } from "../../../utils/AppError";
import { Constants } from "../../../utils/Constants";

const mockKmsJwtAdapter = mock<KmsJwtAdapter>();
const mockLogger = mock<Logger>();

function getMockSessionItem(): ISessionItem {
	const sess: ISessionItem = {
		sessionId: "sdfsdg",
		clientId: "ipv-core-stub",
		accessToken: "AbCdEf123456",
		clientSessionId: "testJourneyId",
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
		attemptCount: 1,
		authSessionState: "BAV_ACCESS_TOKEN_ISSUED",
		copCheckResult: "FULL_MATCH",
		hmrcUuid: "testId",
	};
	return sess;
}

const hmrcUuid = "testId";
const successBlock = {
	type: Constants.IDENTITY_CHECK,
	txn: hmrcUuid,
	strengthScore: 3,
	validityScore: 2,
	checkDetails: [
		{
			checkMethod: "data",
			identityCheckPolicy: "none",
		},
	],
};
const failureBlock = {
	type: Constants.IDENTITY_CHECK,
	txn: hmrcUuid,
	strengthScore: 3,
	validityScore: 0,
	failedCheckDetails: [
		{
			checkMethod: "data",
			identityCheckPolicy: "none",
		},
	],
	ci: [
		"D15",
	],
};

describe("VerifiableCredentialService", () => {
	const mockIssuer = "mockIssuer";
	let service: VerifiableCredentialService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new VerifiableCredentialService( mockKmsJwtAdapter, mockIssuer, mockLogger);
	});

	describe("getInstance", () => {
		it("should create a new instance if not already created", () => {
			const newInstance = VerifiableCredentialService.getInstance( mockKmsJwtAdapter, mockIssuer, mockLogger);
			expect(newInstance).toBeDefined();
		});

		it("should return the same instance of VerifiableCredentialService when called multiple times", () => {
			const firstInstance = VerifiableCredentialService.getInstance( mockKmsJwtAdapter, mockIssuer, mockLogger);
			const secondInstance = VerifiableCredentialService.getInstance( mockKmsJwtAdapter, mockIssuer, mockLogger);
			expect(firstInstance).toBe(secondInstance);
		});
	});

	describe("evidence block generation", () => {
		it("should return a success evidence block correctly", () => {
			const hmrcUuid = "testId";
			const evidenceBlock = service.getSuccessEvidenceBlock(hmrcUuid);
			expect(evidenceBlock).toEqual(expect.objectContaining({
				txn: hmrcUuid,
				strengthScore: 3,
				validityScore: 2,
			}));
		});

		it("should return a failure evidence block correctly", () => {
			const hmrcUuid = "testId";
			const evidenceBlock = service.getFailureEvidenceBlock(hmrcUuid);
			expect(evidenceBlock).toEqual(expect.objectContaining({
				txn: hmrcUuid,
				strengthScore: 3,
				validityScore: 0,
				ci: expect.arrayContaining(["D15"]),
			}));
		});
	});

	describe("generateSignedVerifiableCredentialJwt", () => {
		const mockSessionItem = getMockSessionItem();
		const mockNameParts = [
			{ type: "GivenName", value: "FRED" },
			{ type: "GivenName", value: "NICK" },
			{ type: "FamilyName", value: "Flintstone" },
		];
		const mockBankAccountInfo = {
			sortCode: "112233",
			accountNumber: "10293435",
		};
		const mockNow = () => 1234567890;

		it("should generate a signed JWT for a full match result", async () => {
			const signedJWT = "mockSignedJwt";
			mockKmsJwtAdapter.sign.mockResolvedValue(signedJWT);

			const result = await service.generateSignedVerifiableCredentialJwt(
				mockSessionItem, mockNameParts, mockBankAccountInfo, mockNow,
			);

			expect(result).toEqual({ signedJWT, evidenceInfo: successBlock });
			expect(mockKmsJwtAdapter.sign).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith("Generated VerifiableCredential jwt", { jti: expect.any(String) });
		});

		it("should generate a signed JWT for a non-full match result", async () => {
			mockSessionItem.copCheckResult = CopCheckResult.PARTIAL_MATCH;
			const signedJWT = "mockSignedJwtPartial";
			mockKmsJwtAdapter.sign.mockResolvedValue(signedJWT);

			const result = await service.generateSignedVerifiableCredentialJwt(
				mockSessionItem, mockNameParts, mockBankAccountInfo, mockNow,
			);

			expect(result).toEqual({ signedJWT, evidenceInfo: failureBlock });
			expect(mockKmsJwtAdapter.sign).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith("Generated VerifiableCredential jwt", { jti: expect.any(String) });
		});

		it("should throw an error when KMS signing fails", async () => {
			const signError = new Error("KMS signing failed");
			mockKmsJwtAdapter.sign.mockRejectedValue(signError);

			await expect(
				service.generateSignedVerifiableCredentialJwt(mockSessionItem, mockNameParts, mockBankAccountInfo, mockNow),
			).rejects.toThrow(AppError);

			expect(mockLogger.error).toHaveBeenCalledWith("Error generating signed verifiable credential jwt", {
				error: signError,
				messageCode: MessageCodes.ERROR_SIGNING_VC,
			});
		});
	});
});
