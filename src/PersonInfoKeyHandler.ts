import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { APIGatewayProxyEvent } from "aws-lambda";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { MessageCodes } from "./models/enums/MessageCodes";
import { getParameter } from "./utils/Config";
import { Constants, EnvironmentVariables } from "./utils/Constants";
import { checkEnvironmentVariable } from "./utils/EnvironmentVariables";
import { Response } from "./utils/Response";

const { POWERTOOLS_METRICS_NAMESPACE = Constants.BAV_METRICS_NAMESPACE, POWERTOOLS_LOG_LEVEL = "DEBUG", POWERTOOLS_SERVICE_NAME = Constants.PERSON_INFO_KEY_LOGGER_SVC_NAME } = process.env;

export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

let key: string;

const metrics = new Metrics({ namespace: POWERTOOLS_METRICS_NAMESPACE, serviceName: POWERTOOLS_SERVICE_NAME });

export class PersonInfoKeyHandler implements LambdaInterface {

	@metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })

	async handler(event: APIGatewayProxyEvent, context: any): Promise<Response> {
		logger.setPersistentLogAttributes({});
		logger.addContext(context);

		try {
			const privateKeyPath = checkEnvironmentVariable(EnvironmentVariables.PRIVATE_KEY_SSM_PATH, logger);
			logger.info({ message: "Fetching key", privateKeyPath });

    	key = await getParameter(privateKeyPath);
			return new Response(HttpCodesEnum.OK, JSON.stringify({ key }));

		} catch (error: any) {
			logger.error({ message: "Error fetching key", error, messageCode: MessageCodes.SERVER_ERROR });
			return new Response(HttpCodesEnum.SERVER_ERROR, "Server Error");
		}
	}
}

const handlerClass = new PersonInfoKeyHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
