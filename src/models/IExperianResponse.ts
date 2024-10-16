export interface ExperianTokenResponse {
	access_token: string;
	scope: string;
	expires_in: number;
	token_type: string;
}

export interface ExperianVerifyResponse {
	responseHeader: object;
	clientResponsePayload: ClientResponsePayload;
	originalRequestData: object;
}

export interface ExperianHCResponse {
	personalDataScore: number;
}

export interface ClientResponsePayload {
	decisionElements: DecisionElements[];
}

export interface DecisionElements {
	scores: Scores[];
}

export interface Scores {
	score: number;
}

export interface PartialNameSQSRecord {
	itemNumber: string;
	timeStamp: number;
	cicName: string;
	accountName: string;
	accountExists: string;
	nameMatches: string;
	sortCodeBankName?: string;
	issued_at: string;
	expires_in: string;
	token_type: string;
	access_token: string;
	refresh_token: string;
}

export interface StoredExperianToken {
	issued_at: string;
	expires_in: string;
	token_type: string;
	access_token: string;
}
