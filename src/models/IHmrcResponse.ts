export interface HmrcTokenResponse {
	access_token: string;
	scope: string;
	expires_in: number;
	token_type: string;
}
export interface HmrcVerifyResponse {
	accountNumberIsWellFormatted: string;
	nonStandardAccountDetailsRequiredForBacs: string;
	sortCodeBankName: string;
	sortCodeIsPresentOnEISCD: string;
	sortCodeSupportsDirectDebit: string;
	sortCodeSupportsDirectCredit: string;
	iban: string;
	accountExists: string;
	nameMatches: string;
	accountName: string;
}
