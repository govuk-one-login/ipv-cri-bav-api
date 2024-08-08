import { Logger } from "@aws-lambda-powertools/logger";
import { BankAccountInfo, VerifiedCredential, VerifiedCredentialEvidence } from "../models/IVeriCredential";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";
import { ISessionItem } from "../models/ISessionItem";
import { PersonIdentityNamePart } from "../models/PersonIdentityItem";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { Constants } from "../utils/Constants";
import { randomUUID } from "crypto";
import { CopCheckResult } from "../models/enums/CopCheckResult";
import { MessageCodes } from "../models/enums/MessageCodes";
import { mockCI, mockVcClaims } from "../tests/contract/mocks/VerifiableCredential";

export class VerifiableCredentialService {
	readonly logger: Logger;

	readonly issuer: string;

	readonly dnsSuffix: string;	

	private readonly kmsJwtAdapter: KmsJwtAdapter;

	private static instance: VerifiableCredentialService;

	constructor(kmsJwtAdapter: KmsJwtAdapter, issuer: string, logger: Logger, dnsSuffix: string) {
		this.issuer = issuer;
		this.logger = logger;
		this.kmsJwtAdapter = kmsJwtAdapter;
		this.dnsSuffix = dnsSuffix;
	}

	static getInstance(kmsJwtAdapter: KmsJwtAdapter, issuer: string, logger: Logger, dnsSuffix: string): VerifiableCredentialService {
		if (!VerifiableCredentialService.instance) {
			VerifiableCredentialService.instance = new VerifiableCredentialService(kmsJwtAdapter, issuer, logger, dnsSuffix);
		}
		return VerifiableCredentialService.instance;
	}

	getSuccessEvidenceBlock(hmrcUuid: string): VerifiedCredentialEvidence {
		return {
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
	}

	getFailureEvidenceBlock(hmrcUuid: string): VerifiedCredentialEvidence {
		return {
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
			ci: process.env.USE_MOCKED ? mockCI : [
				"D15",
			],
		};
	}
	

	async generateSignedVerifiableCredentialJwt(
		sessionItem: ISessionItem, nameParts: PersonIdentityNamePart[], dateOfBirth: string, bankAccountInfo: BankAccountInfo, getNow: () => number): Promise<{ signedJWT: string; evidenceInfo: VerifiedCredentialEvidence }> {
		const now = getNow();
		const subject = sessionItem.subject;
		const evidenceInfo = sessionItem.copCheckResult === CopCheckResult.FULL_MATCH ?
			this.getSuccessEvidenceBlock(sessionItem.hmrcUuid!) : this.getFailureEvidenceBlock(sessionItem.hmrcUuid!);
		const verifiedCredential: VerifiedCredential = new VerifiableCredentialBuilder(nameParts, dateOfBirth, bankAccountInfo, evidenceInfo)
			.build();
		let result;
		if (process.env.USE_MOCKED) {
			this.logger.info("VcService: USING MOCKED");
			result = {
				...mockVcClaims,
				iss: this.issuer,
				sub: subject,
				vc: verifiedCredential,
			};
		} else {
				 result = {
				sub: subject,
				nbf: now,
				iss: this.issuer,
				iat: now,
				jti: Constants.URN_UUID_PREFIX + randomUUID(),
				vc: verifiedCredential,
			};
		}

		this.logger.info("Generated VerifiableCredential jwt", { jti: result.jti });

		try {
			const signedJWT = await this.kmsJwtAdapter.sign(result, this.dnsSuffix);
			return { signedJWT, evidenceInfo };
		} catch (error) {
			this.logger.error("Error generating signed verifiable credential jwt", {
				error,
				messageCode: MessageCodes.ERROR_SIGNING_VC,
			});
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Server Error");
		}
	}
}

class VerifiableCredentialBuilder {
	private readonly credential: VerifiedCredential;

	constructor(nameParts: PersonIdentityNamePart[], dateOfBirth: string, bankAccountInfo: BankAccountInfo, evidenceInfo: VerifiedCredentialEvidence) {
		this.credential = {
			"@context": [
				Constants.W3_BASE_CONTEXT,
				Constants.DI_CONTEXT,
			],
			type: [
				Constants.VERIFIABLE_CREDENTIAL,
				Constants.IDENTITY_CHECK_CREDENTIAL,
			],
			credentialSubject: {
				name: [
					{
						nameParts,
					},
				],
				dateOfBirth: dateOfBirth,
				bankAccount: [
					bankAccountInfo,
				],
			},
			evidence: [
				evidenceInfo,
			],
		};
	}

	build(): VerifiedCredential {
		return this.credential;
	}
}
