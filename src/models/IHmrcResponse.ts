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

export interface PartialNameExport {
	itemNumber: string;
	timeStamp: number;
	cicName: string;
	accountName: string;
	accountExists: string;
	nameMatches: string;
}

// itemNumber: index (generated UUID)
//
// timeStamp: Timestamp when the response was received
//
// cicName: Name as received from CIC
//
// accountName: Name as received from HMRC bank account verification API
//
// accountExists: The value as received from HMRC bank account verification API
//
// nameMatches: The value as received from HMRC bank account verification API