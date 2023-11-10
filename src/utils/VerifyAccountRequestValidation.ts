import { VerifyAccountPayload } from "../type/VerifyAccountPayload";

export const getPayloadValidationErrors = (body: VerifyAccountPayload): string | void => {
	const { sort_code, account_number } = body;

	if (!sort_code) return "Invalid request: Missing sort_code parameter";
	if (!account_number) return "Invalid request: Missing account_number parameter";

	// TODO validate the lengths

};

