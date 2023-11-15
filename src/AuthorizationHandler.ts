import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { MessageCodes } from "./models/enums/MessageCodes";
import { AuthorizationRequestProcessor } from "./services/AuthorizationRequestProcessor";
import { AppError } from "./utils/AppError";
import { Constants } from "./utils/Constants";
import { Response } from "./utils/Response";
import { getSessionIdHeaderErrors } from "./utils/Validations";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.AUTHORIZATION_LOGGER_SVC_NAME } = process.env;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

export const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

class AuthorizationHandler implements LambdaInterface {

	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })
	async handler(event: APIGatewayProxyEvent, context: any): Promise<APIGatewayProxyResult> {

		logger.setPersistentLogAttributes({});
		logger.addContext(context);
				
		try {
			logger.info("Received authorization request", { requestId: event.requestContext.requestId });

			const sessionIdError = getSessionIdHeaderErrors(event.headers);
			if (sessionIdError) {
				logger.error({ message: sessionIdError, messageCode: MessageCodes.INVALID_SESSION_ID });
				throw new AppError(HttpCodesEnum.BAD_REQUEST, sessionIdError);
			}
	
			const sessionId = event.headers[Constants.X_SESSION_ID]!;

			return await AuthorizationRequestProcessor.getInstance(logger, metrics).processRequest(sessionId);

		} catch (error: any) {
			logger.error({ message: "An error has occurred.", error, messageCode: MessageCodes.SERVER_ERROR });
			if (error instanceof  AppError) {
				return new Response(error.statusCode, error.message);
			}
			return new Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
		}
	}

}

const handlerClass = new AuthorizationHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
