export class BankDetailsPayload {
    sortCode: string;
    accountNumber: string;

    public constructor(sortCode: string, accountNumber: string) {
        this.sortCode = sortCode;
        this.accountNumber = accountNumber;
    }
}