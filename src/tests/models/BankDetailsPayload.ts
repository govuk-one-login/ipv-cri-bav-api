export class BankDetailsPayload {
    sort_code: string;

    account_number: string;

    constructor(sortCode: string, accountNumber: string) {
    	this.sort_code = sortCode;
    	this.account_number = accountNumber;
    }
}
