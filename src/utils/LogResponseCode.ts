export const logResponseCode = (responseCode: string, logger: any): any => {
	switch (responseCode) {
		case "2":
			logger.warn({ message: `Response code ${responseCode}: Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid` });
			break;
		case "3":
			logger.warn({ message: `Response code ${responseCode}: Account number does not use a modulus check algorithm and therefore Bank Wizard cannot confirm the details are valid` });
			break;
		case "6":
			logger.error({ message: `Response code ${responseCode}: Bank or branch code is not in use` });
			break;
		case "7":
			logger.error({ message: `Response code ${responseCode}: Modulus check has failed. Although the formats of the supplied fields are correct, one or more of them are incorrect` });
			break;
		case "11":
			logger.error({ message: `Response code ${responseCode}: Sort Code has been closed` });
			break;
		case "12":
			logger.error({ message: `Response code ${responseCode}: Branch has been transferred and the accounts have been redirected to another branch` });
			break;
		default:
			logger.debug({ message: "No error" });
			break;
	}
};
