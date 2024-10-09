import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UserInfoRequestProcessorExperian } from "./services/UserInfoRequestProcessorExperian";
import { UserInfoRequestProcessorHmrc } from "./services/UserInfoRequestProcessorHmrc";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { MessageCodes } from "./models/enums/MessageCodes";
import { Response } from "./utils/Response";
import { getParameter } from "./utils/Config";
import { Constants, EnvironmentVariables } from "./utils/Constants";
import { checkEnvironmentVariable } from "./utils/EnvironmentVariables";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.USERINFO_LOGGER_SVC_NAME } = process.env;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

let CREDENTIAL_VENDOR: string;
class UserInfoHandler implements LambdaInterface {
	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })

	async handler(event: APIGatewayProxyEvent, context: any): Promise<APIGatewayProxyResult> {

		logger.setPersistentLogAttributes({});
		logger.addContext(context);

		try {
			const credentialVendorSsmPath = checkEnvironmentVariable(EnvironmentVariables.CREDENTIAL_VENDOR_SSM_PATH, logger);
			CREDENTIAL_VENDOR = await getParameter(credentialVendorSsmPath);
			if (CREDENTIAL_VENDOR === "HMRC") {
				logger.info("Starting UserInfoProcessorHmrc");
				return await UserInfoRequestProcessorHmrc.getInstance(logger, metrics).processRequest(event);
			} else {
				logger.info("Starting UserInfoProcessorExperian");
				return await UserInfoRequestProcessorExperian.getInstance(logger, metrics).processRequest(event);
			}
		} catch (error: any) {
			logger.error("An error has occurred", {
				messageCode: MessageCodes.SERVER_ERROR,
				error,
			});
			return Response(error.statusCode ?? HttpCodesEnum.SERVER_ERROR, "Server Error");
		}
	}
}

const handlerClass = new UserInfoHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
