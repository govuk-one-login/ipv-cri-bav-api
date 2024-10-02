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
}
