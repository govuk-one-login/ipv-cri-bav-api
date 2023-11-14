import { mock } from "jest-mock-extended";
import { Logger } from "@aws-lambda-powertools/logger";
import { ISessionItem } from "../../../models/ISessionItem";
import { VerifiableCredentialService } from "../../../services/VerifiableCredentialService";
import { KmsJwtAdapter } from "../../../utils/KmsJwtAdapter";
import { CopCheckResult } from "../../../models/enums/CopCheckResult";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { AppError } from "../../../utils/AppError";

const mockKmsJwtAdapter = mock<KmsJwtAdapter>();
const mockLogger = mock<Logger>();

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
		attemptCount: 1,
		authSessionState: "BAV_ACCESS_TOKEN_ISSUED",
		copCheckResult: "FULL_MATCH",
	};
	return sess;
}

describe("VerifiableCredentialService", () => {
	const mockIssuer = "mockIssuer";
	let service: VerifiableCredentialService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new VerifiableCredentialService( mockKmsJwtAdapter, mockIssuer, mockLogger);
	});

	// Singleton pattern tests
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

	// Evidence block tests
	describe("evidence block generation", () => {
		it("should return a success evidence block correctly", () => {
			const journeyId = "testJourneyId";
			const evidenceBlock = service.getSuccessEvidenceBlock(journeyId);
			expect(evidenceBlock).toEqual(expect.objectContaining({
				txn: journeyId,
				strengthScore: 3,
				validityScore: 2,
			}));
		});

		it("should return a failure evidence block correctly", () => {
			const journeyId = "testJourneyId";
			const evidenceBlock = service.getFailureEvidenceBlock(journeyId);
			expect(evidenceBlock).toEqual(expect.objectContaining({
				txn: journeyId,
				strengthScore: 3,
				validityScore: 0,
				ci: expect.arrayContaining(["D15"]),
			}));
		});
	});

	// JWT generation tests
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
		const mockUUID = "mockUUID";

		it("should generate a signed JWT for a full match result", async () => {
			const expectedResult = "mockSignedJwt";
			mockKmsJwtAdapter.sign.mockResolvedValue(expectedResult);

			const jwt = await service.generateSignedVerifiableCredentialJwt(mockSessionItem, mockNameParts, mockBankAccountInfo, mockNow);

			expect(jwt).toBe(expectedResult);
			expect(mockKmsJwtAdapter.sign).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith("Generated VerifiableCredential jwt", { jti: expect.any(String) });
		});

		it("should generate a signed JWT for a non-full match result", async () => {
			mockSessionItem.copCheckResult = CopCheckResult.PARTIAL_MATCH;
			const expectedResult = "mockSignedJwtPartial";
			mockKmsJwtAdapter.sign.mockResolvedValue(expectedResult);

			const jwt = await service.generateSignedVerifiableCredentialJwt(mockSessionItem, mockNameParts, mockBankAccountInfo, mockNow);

			expect(jwt).toBe(expectedResult);
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
