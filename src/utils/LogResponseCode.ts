import { Metrics, MetricUnits } from "@aws-lambda-powertools/metrics";

export const logResponseCode = (warningsErrors: Array<{ responseType: string; responseCode: string; responseMessage: string }>, logger: any, metrics: Metrics): any => {

	if (warningsErrors) {
		warningsErrors.forEach((warningError) => {
			logger.info(`Response code: ${warningError?.responseCode}, Response message: ${warningError?.responseMessage}`);
			metrics.addMetric("Response-Code-" + warningError?.responseCode, MetricUnits.Count, 1);
	  });
	}
};
