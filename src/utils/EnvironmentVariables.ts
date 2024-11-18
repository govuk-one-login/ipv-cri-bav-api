import { Logger } from "@aws-lambda-powertools/logger";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { AppError } from "../utils/AppError";

export const checkEnvironmentVariable = (variableName: string, logger: Logger): string => {
	const variableValue = process.env[variableName];
	console.log("ENVVAR", variableValue);
	if (variableValue) {
		return variableValue;
	} else {
		logger.error({
			message: `Missing ${variableName} environment variable`,
			messageCode: MessageCodes.MISSING_CONFIGURATION,
		});
		throw new AppError(HttpCodesEnum.SERVER_ERROR, "Service incorrectly configured");
		
	}
};
