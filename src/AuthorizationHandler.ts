import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { MessageCodes } from "./models/enums/MessageCodes";
import { AuthorizationRequestProcessor } from "./services/AuthorizationRequestProcessor";
import { Response } from "./utils/Response";
import { AppError } from "./utils/AppError";
import { Constants } from "./utils/Constants";

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
				
		let sessionId: string;
		try {
			logger.info("Received authorization request", { requestId: event.requestContext.requestId });

			if (!event.headers) {
				// TODO shouldn't this be caught by apiggw?
				logger.error("Empty headers", { messageCode: MessageCodes.MISSING_HEADER });
				return new Response(HttpCodesEnum.BAD_REQUEST, "Empty headers");
			}

			if (!event.headers[Constants.SESSION_ID]) {
				logger.error("Missing header: session-id is required", { messageCode: MessageCodes.MISSING_HEADER });
				return new Response(HttpCodesEnum.BAD_REQUEST, "Missing header: session-id is required");
			}

			// TODO shouldn't need this exclamation mark
			sessionId = event.headers[Constants.SESSION_ID]!;
			logger.appendKeys({ sessionId });

			if (!Constants.REGEX_UUID.test(sessionId)) {
				logger.error("Session id not not a valid uuid", { messageCode: MessageCodes.INVALID_SESSION_ID });
				return new Response(HttpCodesEnum.BAD_REQUEST, "Session id must be a valid uuid");
			}

			return await AuthorizationRequestProcessor.getInstance(logger, metrics).processRequest(sessionId);

		} catch (error: any) {
			logger.error({ message: "An error has occurred.", error, messageCode: MessageCodes.SERVER_ERROR });
			if (error instanceof  AppError) {
				return new Response(error.statusCode, error.message);
			}
			return new Response(HttpCodesEnum.SERVER_ERROR, "An error has occurred");
		}
	}

}

const handlerClass = new AuthorizationHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
