import { Logger } from "@aws-lambda-powertools/logger";
import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Constants, EnvironmentVariables } from "./utils/Constants";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { MessageCodes } from "./models/enums/MessageCodes";
import { AppError } from "./utils/AppError";
import { HmrcTokenRequestProcessor } from "./services/HmrcTokenRequestProcessor";
import { getParameter } from "./utils/Config";
import { checkEnvironmentVariable } from "./utils/EnvironmentVariables";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.HMRC_TOKEN_LOGGER_SVC_NAME } = process.env;
export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});
export const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

let HMRC_CLIENT_ID: string;

let HMRC_CLIENT_SECRET: string;


class HmrcTokenHandler implements LambdaInterface {
	private readonly HMRC_CLIENT_ID_SSM_PATH = checkEnvironmentVariable(EnvironmentVariables.HMRC_CLIENT_ID_SSM_PATH, logger);
	private readonly HMRC_CLIENT_SECRET_SSM_PATH = checkEnvironmentVariable(EnvironmentVariables.HMRC_CLIENT_SECRET_SSM_PATH, logger);

	async handler(): Promise<void> {
		logger.setPersistentLogAttributes({});
		
		try {
			logger.info("Generating a new HMRC token");
			if (!HMRC_CLIENT_ID) {
				logger.debug({ message: "Fetching HMRC client_id key from SSM" });
				try {
					HMRC_CLIENT_ID = await getParameter(this.HMRC_CLIENT_ID_SSM_PATH);
				} catch (error) {
					logger.error(`failed to get param from ssm at ${this.HMRC_CLIENT_ID_SSM_PATH}`, {
						messageCode: MessageCodes.MISSING_CONFIGURATION,
						error,
					});
					throw new Error("An error has occurred while fetching SSM parameter.");
				}
			}
			if (!HMRC_CLIENT_SECRET) {
				logger.debug({ message: "Fetching HMRC client_secret key from SSM" });
				try {
					HMRC_CLIENT_SECRET = await getParameter(this.HMRC_CLIENT_SECRET_SSM_PATH);
				} catch (error) {
					logger.error(`failed to get param from ssm at ${this.HMRC_CLIENT_SECRET_SSM_PATH}`, {
						messageCode: MessageCodes.MISSING_CONFIGURATION,
						error,
					});
					throw new Error("An error has occurred while fetching SSM parameter.");
				}
			}
			await HmrcTokenRequestProcessor.getInstance(logger, metrics, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET).processRequest();

		} catch (error: any) {
			logger.error({ message: "An error has occurred.", error, messageCode: MessageCodes.SERVER_ERROR });
			if (error instanceof  AppError) {
				throw new Error(error.message);
			}
			throw new Error("Server Error");
		}
	}	
}

export const handlerClass = new HmrcTokenHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
