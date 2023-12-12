import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { APIGatewayProxyEvent } from "aws-lambda";
import { PersonInfoRequestProcessor } from "./services/PersonInfoRequestProcessor";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { MessageCodes } from "./models/enums/MessageCodes";
import { getParameter } from "./utils/Config";
import { Constants, EnvironmentVariables } from "./utils/Constants";
import { AppError } from "./utils/AppError";
import { checkEnvironmentVariable } from "./utils/EnvironmentVariables";
import { Response } from "./utils/Response";
import { getSessionIdHeaderErrors } from "./utils/Validations";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.ABORT_LOGGER_SVC_NAME } = process.env;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

let PUBLIC_KEY: string;

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

export class PersonInfoHandler implements LambdaInterface {

	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })

	async handler(event: APIGatewayProxyEvent, context: any): Promise<Response> {
		logger.setPersistentLogAttributes({});
		logger.addContext(context);

		try {
			const sessionId = this.validateEvent(event);
			const publicKeyPath = checkEnvironmentVariable(EnvironmentVariables.PUBLIC_KEY_SSM_PATH, logger);
    	PUBLIC_KEY = await getParameter(publicKeyPath);

			logger.info("Starting PersonInfoRequestProcessor");
			return await PersonInfoRequestProcessor.getInstance(logger, metrics, PUBLIC_KEY).processRequest(sessionId);
		} catch (error: any) {
			logger.error({ message: "PersonInfoRequestProcessor encountered an error.", error, messageCode: MessageCodes.SERVER_ERROR });
			if (error instanceof AppError) {
				return new Response(error.statusCode, error.message);
			}
			return new Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
		}
	}

	validateEvent(event: APIGatewayProxyEvent): string {
		if (!event.headers) {
			const message = "Invalid request: missing headers";
			logger.error({ message, messageCode: MessageCodes.MISSING_HEADER });
			throw new AppError(HttpCodesEnum.BAD_REQUEST, message);
		}

		const sessionIdError = getSessionIdHeaderErrors(event.headers);
		if (sessionIdError) {
			logger.error({ message: sessionIdError, messageCode: MessageCodes.INVALID_SESSION_ID });
			throw new AppError(HttpCodesEnum.BAD_REQUEST, sessionIdError);
		}

		const sessionId = event.headers[Constants.X_SESSION_ID]!;

		return sessionId;
	}
}

const handlerClass = new PersonInfoHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
