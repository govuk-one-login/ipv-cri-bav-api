import { EvidenceRequested } from "./IVeriCredential";

export type CopCheckResult =
	"FULL_MATCH" | 
	"PARTIAL_MATCH" | 
	"NO_MATCH" |
	"MATCH_ERROR";

export type ExperianCheckResult =
	"FULL_MATCH" |
	"NO_MATCH" |
	undefined;

export interface IBAVSession {
	given_names?: string[];
	family_names?: string[];
	date_of_birth?: string;
}

export interface ISessionItem extends IBAVSession {
	sessionId: string;
	clientId: string;
	clientSessionId: string;
	authorizationCode?: string;
	authorizationCodeExpiryDate?: number;
	redirectUri: string;
	accessToken?: string;
	accessTokenExpiryDate?: number;
	expiryDate: number;
	createdDate: number;
	state: string;
	subject: string;
	persistentSessionId: string;
	clientIpAddress: string;
	authSessionState: string;
	evidence_requested?: EvidenceRequested;
	copCheckResult?: CopCheckResult;
	experianCheckResult?: ExperianCheckResult;
	vendorUuid?: string;
	attemptCount?: number;
}
