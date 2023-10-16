import { Logger } from "@aws-lambda-powertools/logger";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { ServicesEnum } from "../models/enums/ServicesEnum";


/**
 * Class to read, store, and return environment variables used by this lambda
 */
export class EnvironmentVariables {

	private readonly ENCRYPTION_KEY_IDS = process.env.ENCRYPTION_KEY_IDS;

	private readonly SIGNING_KEY_IDS = process.env.SIGNING_KEY_IDS;

	private readonly JWKS_BUCKET_NAME = process.env.JWKS_BUCKET_NAME;


	/*
	 * This function performs validation on env variable values.
	 * If certain variables have unexpected values the constructor will throw an error and/or log an error message
	 */
	private verifyEnvVariablesByServiceType(serviceType: ServicesEnum, logger: Logger): void {
		switch (serviceType) {			
			case ServicesEnum.JWKS_SERVICE: {
				if (!this.ENCRYPTION_KEY_IDS || this.ENCRYPTION_KEY_IDS.trim().length === 0 ||
					!this.SIGNING_KEY_IDS || this.SIGNING_KEY_IDS.trim().length === 0 ||
					!this.JWKS_BUCKET_NAME || this.JWKS_BUCKET_NAME.trim().length === 0) {
					logger.error("Environment variable ENCRYPTION_KEY_IDS or SIGNING_KEY_IDS or JWKS_BUCKET_NAME is not configured");
					throw new AppError("JWKS Service handler incorrectly configured", HttpCodesEnum.SERVER_ERROR);
				}
				break;
			}			
			default:
				break;
		}
	}

	/**
	 * Constructor reads all necessary environment variables by ServiceType
	 */
	constructor(logger: Logger, serviceType: ServicesEnum) {
		this.verifyEnvVariablesByServiceType(serviceType, logger);
	}

	/**
	 * Accessor methods for env variable values
	 */

	encryptionKeyIds(): any {
		return this.ENCRYPTION_KEY_IDS;
	}

	signingKeyIds(): any {
		return this.SIGNING_KEY_IDS;
	}

	jwksBucketName(): any {
		return this.JWKS_BUCKET_NAME;
	}	

}
