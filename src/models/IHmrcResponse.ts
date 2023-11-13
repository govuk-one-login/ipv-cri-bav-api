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
