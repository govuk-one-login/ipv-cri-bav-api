export interface CredentialSubject {
	name: object[];
}
export interface VerifiedCredential {
	"@context": string[];
	type: string[];
	credentialSubject: VerifiedCredentialSubject;
	evidence: VerifiedCredentialEvidence[];
}
// limit to supported algs https://datatracker.ietf.org/doc/html/rfc7518
export type Algorithm =
	"HS256" | "HS384" | "HS512" |
	"RS256" | "RS384" | "RS512" |
	"ES256" | "ES384" | "ES512" |
	"PS256" | "PS384" | "PS512" |
	"none";
	
export interface CredentialJwt {
	iat: number;
	iss: string;
	nbf: number;
	sub: string;
	aud?: string;
	exp?: number;
	jti?: string;
	vc: VerifiedCredential;
}
export interface JwtHeader {
	alg: Algorithm | string;
	typ?: string | undefined;
	kid?: string;
}
// standard claims https://datatracker.ietf.org/doc/html/rfc7519#section-4.1
export interface EvidenceRequested {
	strengthScore?: number;
	validityScore?: number;
	verificationScore?: number;
	activityHistoryScore?: number;
	identityFraudScore?: number;
}
export interface JwtPayload {
	[key: string]: any;
	iss?: string;
	sub?: string;
	aud?: string | string[];
	exp?: number | undefined;
	nbf?: number | undefined;
	iat?: number | undefined;
	jti?: string | undefined;
	evidence_requested?: EvidenceRequested | undefined;
}
export interface JWKSBody {
	keys: Jwk[];
}
export interface Jwk extends JsonWebKey {
	alg: Algorithm;
	kid: string;
	kty: "EC" | "RSA";
	use: "sig" | "enc";
}
export interface Jwks {
	keys: Jwk[];
}
export interface Jwt {
	header: JwtHeader;
	payload: JwtPayload;
	signature: string;
	jwk?: Jwk;
}

export class JarPayload implements JwtPayload {
	redirect_uri?: string;

	client_id?: string;

	response_type?: "code";

	scope?: string;

	state?: string;

	nonce?: string;
}

export class JsonWebTokenError extends Error {
	inner?: unknown;

	constructor(message: string, error?: unknown) {
		super(message);
		this.inner = error;
	}
}

export type CheckDetails = {
	checkMethod: string;
	identityCheckPolicy: string;
};

export type VerifiedCredentialEvidence = {
	type: string;
	txn: string;
	strengthScore: number;
	validityScore: number;
	checkDetails?: CheckDetails[];
	failedCheckDetails?: CheckDetails[];
	ci?: string[];
};

export type WarningsErrors = {
	responseType: string;
	responseCode: string;
	responseMessage: string;
};

export type ExperianVerifyResponse = {
	expRequestId: string;
	personalDetailsScore: number;
	warningsErrors?: WarningsErrors[];
	outcome: string;
};

export type BankAccountInfo = {
	sortCode: string;
	accountNumber: string;
};

export interface VerifiedCredentialSubject {
	name: Name[];
	birthDate?: BirthDate[];
	bankAccount: BankAccountInfo[];
}

export interface Name {
	nameParts: NamePart[];
}

export interface NamePart {
	value: string;
	type: string;
}

export interface BirthDate {
	value: string;
}
