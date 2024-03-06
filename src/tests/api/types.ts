export interface Name {
	nameParts: NamePart[];
}

export interface NamePart {
	value: string;
	type: string;
}

export interface StubStartRequest {
	shared_claims: {
		name: Name[];
	};
}

export interface StubStartResponse {
	clientId: string;
	request: string;
}

export interface SessionResponse {
	session_id: string;
}

export interface VerifyAccountResponse {
	message: string;
	attemptCount: string;
}

export interface AuthorizationResponse {
	authorizationCode: { value: string };
	redirect_uri: string;
	state: string;
}

export interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: string;
}

export interface UserInfoResponse {
	sub: string;
	"https://vocab.account.gov.uk/v1/credentialJWT": string;
}

export interface WellKnownReponse {
	keys: any[];
}
