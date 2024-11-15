export const logResponseCode = (warningsErrors: Array<{ responseType: string; responseCode: string; responseMessage: string }>, logger: any): any => {

	if (warningsErrors) {
		warningsErrors.forEach((warningError) => {
			logger.info(`Response code: ${warningError?.responseCode}, Response message: ${warningError?.responseMessage}`);
	  });
	}
};
