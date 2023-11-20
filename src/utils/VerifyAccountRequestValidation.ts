import { VerifyAccountPayload } from "../type/VerifyAccountPayload";
import { Constants } from "./Constants";

export const getPayloadValidationErrors = (body: VerifyAccountPayload): string | void => {
	const { sort_code, account_number } = body;

	if (!sort_code) return "Invalid request: Missing sort_code parameter";
	if (!account_number) return "Invalid request: Missing account_number parameter";

	if (!Constants.SORT_CODE_REGEX.test(sort_code)) {
		return "Invalid request: sort_code parameter is incorrect";
	}

	if (!Constants.ACCOUNT_NUMBER_REGEX.test(account_number)) {
		return "Invalid request: account_number parameter is incorrect";
	}
};
