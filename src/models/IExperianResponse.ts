// TODO

// export interface ExperianVerifyResponse {
// 	responseHeader: object;
// 	clientResponsePayload: ClientResponsePayload;
// 	originalRequestData: object;
// }

// export interface ExperianHCResponse {
// 	personalDataScore: number;
// }

// export interface ClientResponsePayload {
// 	decisionElements: DecisionElements[];
// }

// export interface DecisionElements {
// 	scores: Scores[];
// }

// export interface Scores {
// 	score: number;
// }

export interface ExperianTokenResponse {
	issued_at: string;
	access_token: string;
	expires_in: string;
	token_type: string;
	refresh_token: string;
}

export interface StoredExperianToken {
	issued_at: string;
	expires_in: string;
	token_type: string;
	access_token: string;
}
