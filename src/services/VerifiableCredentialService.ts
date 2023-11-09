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

export class VerifiableCredentialService {
	readonly logger: Logger;

	readonly issuer: string;

	private readonly kmsJwtAdapter: KmsJwtAdapter;

	private static instance: VerifiableCredentialService;

	constructor(kmsJwtAdapter: KmsJwtAdapter, issuer: any, logger: Logger) {
		this.issuer = issuer;
		this.logger = logger;
		this.kmsJwtAdapter = kmsJwtAdapter;
	}

	static getInstance(kmsJwtAdapter: KmsJwtAdapter, issuer: string, logger: Logger): VerifiableCredentialService {
		if (!VerifiableCredentialService.instance) {
			VerifiableCredentialService.instance = new VerifiableCredentialService(kmsJwtAdapter, issuer, logger);
		}
		return VerifiableCredentialService.instance;
	}

	getSuccessEvidenceBlock(journeyId: string): VerifiedCredentialEvidence {
		return {
			type: Constants.IDENTITY_CHECK,
			txn: journeyId,
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

	getFailureEvidenceBlock(journeyId: string): VerifiedCredentialEvidence {
		return {
			type: Constants.IDENTITY_CHECK,
			txn: journeyId,
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
	}
	

	async generateSignedVerifiableCredentialJwt(sessionItem: ISessionItem, nameParts: PersonIdentityNamePart[], bankAccountInfo: BankAccountInfo, getNow: () => number): Promise<string> {
		const now = getNow();
		const subject = sessionItem.subject;
		let evidenceInfo;
		evidenceInfo = sessionItem.copCheckResult === CopCheckResult.FULL_MATCH ?
			this.getSuccessEvidenceBlock(sessionItem.clientSessionId) : this.getFailureEvidenceBlock(sessionItem.clientSessionId);
		const verifiedCredential: VerifiedCredential = new VerifiableCredentialBuilder(nameParts, bankAccountInfo, evidenceInfo)
			.build();
		const result = {
			sub: subject,
			nbf: now,
			iss: this.issuer,
			iat: now,
			jti: randomUUID(),
			vc: verifiedCredential,
		};

		this.logger.info("Generated VerifiableCredential jwt", {
    		jti: result.jti,
    	});
		try {
			// Sign the VC
			return await this.kmsJwtAdapter.sign(result);
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

	constructor(nameParts: PersonIdentityNamePart[], bankAccountInfo: BankAccountInfo, evidenceInfo: VerifiedCredentialEvidence) {
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
