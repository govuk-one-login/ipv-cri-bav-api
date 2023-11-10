import { APIGatewayProxyEvent } from "aws-lambda";
import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { MessageCodes } from "./models/enums/MessageCodes";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { VerifyAccountRequestProcessor } from "./services/VerifyAccountRequestProcessor";
import { VerifyAccountPayload } from "./type/VerifyAccountPayload";
import { AppError } from "./utils/AppError";
import { Constants } from "./utils/Constants";
import { Response } from "./utils/Response";
import { getSessionIdHeaderErrors } from "./utils/Validations";
import { getPayloadValidationErrors } from "./utils/VerifyAccountRequestValidation";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.ACCESSTOKEN_LOGGER_SVC_NAME } = process.env;

const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

export class VerifyAccount implements LambdaInterface {

	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })

	async handler(event: APIGatewayProxyEvent, context: any): Promise<Response | void> {
		logger.setPersistentLogAttributes({});
		logger.addContext(context);

		try {
			const { sessionId, body } = this.validateEvent(event);

			logger.appendKeys({ sessionId });
			logger.info("Starting VerifyAccountRequestProcessor");

			await VerifyAccountRequestProcessor.getInstance(logger, metrics).processRequest(sessionId, body);
		} catch (error: any) {
			logger.error({ message: "An error has occurred.", error, messageCode: MessageCodes.SERVER_ERROR });
			if (error instanceof AppError) {
				return new Response(error.statusCode, error.message);
			}
			return new Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
		}
	}

	validateEvent(event: APIGatewayProxyEvent): { sessionId: string; body: VerifyAccountPayload } {
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

		if (!event.body) {
			const message = "Invalid request: missing body";
			logger.error({ message, messageCode: MessageCodes.INVALID_SESSION_ID });
			throw new AppError(HttpCodesEnum.BAD_REQUEST, message);
		}

		const deserialisedRequestBody: VerifyAccountPayload = JSON.parse(event.body) as VerifyAccountPayload;
		const payloadError = getPayloadValidationErrors(deserialisedRequestBody);

		if (payloadError) {
			logger.error({ message: payloadError, messageCode: MessageCodes.INVALID_REQUEST_PAYLOAD });
			throw new AppError(HttpCodesEnum.BAD_REQUEST, payloadError);
		}

		return {
			sessionId,
			body: deserialisedRequestBody,
		};
	}
}

const handlerClass = new VerifyAccount();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
