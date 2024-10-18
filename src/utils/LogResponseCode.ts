export const logResponseCode = (responseCodeObject: any, logger: any): any => {
	const responseCode = responseCodeObject.responseCode;
	const responseMessage = responseCodeObject.responseMessage;
	switch (responseCode) {
		case "2":
			logger.warn({ message: `Response code ${responseCode}: ${responseMessage}` });
			break;
		case "3":
			logger.warn({ message: `Response code ${responseCode}: ${responseMessage}` });
			break;
		case "6":
			logger.error({ message: `Response code ${responseCode}: ${responseMessage}` });
			break;
		case "7":
			logger.error({ message: `Response code ${responseCode}: ${responseMessage}` });
			break;
		case "11":
			logger.error({ message: `Response code ${responseCode}: ${responseMessage}` });
			break;
		case "12":
			logger.error({ message: `Response code ${responseCode}: ${responseMessage}` });
			break;
		default:
			logger.debug({ message: "No error" });
			break;
	}
};
