export interface ExperianTokenResponse {
	access_token: string;
	scope: string;
	expires_in: number;
	token_type: string;
}
export interface ExperianVerifyResponse {
	personalDataScore: number;
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
