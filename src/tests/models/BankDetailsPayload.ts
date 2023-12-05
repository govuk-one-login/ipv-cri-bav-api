export class BankDetailsPayload {
    sortCode: string;

    accountNumber: string;

    constructor(sortCode: string, accountNumber: string) {
    	this.sortCode = sortCode;
    	this.accountNumber = accountNumber;
    }
}
