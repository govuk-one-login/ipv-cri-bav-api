import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";

export const logResponseCode = (warningsErrors: Array<{ responseType: string; responseCode: string; responseMessage: string }>, logger: any, metrics: Metrics): any => {

	if (warningsErrors && warningsErrors.length > 0) {
		const responseCodeMetric = metrics.singleMetric();
		warningsErrors.forEach((warningError) => {
			logger.info(`Response code: ${warningError?.responseCode}, Response message: ${warningError?.responseMessage}`);
			responseCodeMetric.addDimension("experian-response-code", warningError?.responseCode);
		});
		responseCodeMetric.addMetric("ResponseCodes", MetricUnits.Count, 1); 
	}
};
