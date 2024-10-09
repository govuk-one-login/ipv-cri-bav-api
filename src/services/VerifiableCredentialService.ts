import { Logger } from "@aws-lambda-powertools/logger";
import { BankAccountInfo, VerifiedCredential, VerifiedCredentialEvidence } from "../models/IVeriCredential";
import { KmsJwtAdapter } from "../utils/KmsJwtAdapter";
import { ISessionItem } from "../models/ISessionItem";
import { PersonIdentityNamePart, PersonIdentityBirthDate } from "../models/PersonIdentityItem";
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

	readonly credentialVendor: string;

	private readonly kmsJwtAdapter: KmsJwtAdapter;

	private static instance: VerifiableCredentialService;

	constructor(kmsJwtAdapter: KmsJwtAdapter, issuer: string, logger: Logger, dnsSuffix: string, credentialVendor: string) {
		this.issuer = issuer;
		this.logger = logger;
		this.kmsJwtAdapter = kmsJwtAdapter;
		this.dnsSuffix = dnsSuffix;
		this.credentialVendor = credentialVendor;
	}

	static getInstance(kmsJwtAdapter: KmsJwtAdapter, issuer: string, logger: Logger, dnsSuffix: string, credentialVendor: string): VerifiableCredentialService {
		if (!VerifiableCredentialService.instance) {
			VerifiableCredentialService.instance = new VerifiableCredentialService(kmsJwtAdapter, issuer, logger, dnsSuffix, credentialVendor);
		}
		return VerifiableCredentialService.instance;
	}

	getSuccessEvidenceBlock(vendorUuid: string): VerifiedCredentialEvidence {
		return {
			type: Constants.IDENTITY_CHECK,
			txn: vendorUuid,
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

	getFailureEvidenceBlock(vendorUuid: string): VerifiedCredentialEvidence {
		return {
			type: Constants.IDENTITY_CHECK,
			txn: vendorUuid,
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
		sessionItem: ISessionItem, nameParts: PersonIdentityNamePart[], birthDate: PersonIdentityBirthDate[], bankAccountInfo: BankAccountInfo, getNow: () => number): Promise<{ signedJWT: string; evidenceInfo: VerifiedCredentialEvidence }> {
		const now = getNow();
		const subject = sessionItem.subject;
		const evidenceInfo = sessionItem.copCheckResult === CopCheckResult.FULL_MATCH ?
			this.getSuccessEvidenceBlock(sessionItem.vendorUuid!) : this.getFailureEvidenceBlock(sessionItem.vendorUuid!);
		const verifiedCredential: VerifiedCredential = new VerifiableCredentialBuilder(nameParts, birthDate, bankAccountInfo, evidenceInfo, this.credentialVendor)
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

export class VerifiableCredentialBuilder {

	private readonly credential: VerifiedCredential;

	constructor(nameParts: PersonIdentityNamePart[], birthDate: PersonIdentityBirthDate[], bankAccountInfo: BankAccountInfo, evidenceInfo: VerifiedCredentialEvidence, credentialVendor: string) {
		
		const credentialObject = {
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

		if (credentialVendor === "EXPERIAN") {
			const credentialObjectDOB = {
				...credentialObject,
				credentialSubject: {
					name: [...credentialObject.credentialSubject.name],
					birthDate,
					bankAccount: [...credentialObject.credentialSubject.bankAccount],
				},
			};
			this.credential = credentialObjectDOB;
		} else {
			this.credential = credentialObject;
		}
	}

	build(): VerifiedCredential {
		return this.credential;
	}
}
