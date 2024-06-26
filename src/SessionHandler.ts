import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SessionRequestProcessor } from "./services/SessionRequestProcessor";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { MessageCodes } from "./models/enums/MessageCodes";
import { Response } from "./utils/Response";
import { Constants } from "./utils/Constants";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.SESSION_LOGGER_SVC_NAME } = process.env;

const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

class Session implements LambdaInterface {
	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })

	async handler(event: APIGatewayProxyEvent, context: any): Promise<APIGatewayProxyResult> {

		logger.setPersistentLogAttributes({});
		logger.addContext(context);

		try {
			logger.info("Starting SessionRequestProcessor");
			return await SessionRequestProcessor.getInstance(logger, metrics).processRequest(event);
		} catch (error: any) {
			logger.error("An error has occurred", {
				messageCode: MessageCodes.SERVER_ERROR,
				error,
			});
			return Response(error.statusCode ?? HttpCodesEnum.SERVER_ERROR, "Server Error");
		}
	}
}

const handlerClass = new Session();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
