import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { Constants, EnvironmentVariables } from "../utils/Constants";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { HmrcService } from "./HmrcService";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { putParameter } from "../utils/Config";

export class HmrcTokenRequestProcessor {
	private static instance: HmrcTokenRequestProcessor;

	readonly logger: Logger;

	private readonly metrics: Metrics;

	private readonly hmrcBaseUrl: string;

	private readonly hmrcService: HmrcService;

	constructor(logger: Logger, metrics: Metrics, HMRC_CLIENT_ID: string, HMRC_CLIENT_SECRET: string) {
		this.logger = logger;
		this.metrics = metrics;
		this.hmrcBaseUrl = checkEnvironmentVariable(EnvironmentVariables.HMRC_BASE_URL, logger);
		this.hmrcService = HmrcService.getInstance(this.logger, this.hmrcBaseUrl, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET);
	}

	static getInstance(logger: Logger, metrics: Metrics, HMRC_CLIENT_ID: string, HMRC_CLIENT_SECRET: string): HmrcTokenRequestProcessor {
		if (!HmrcTokenRequestProcessor.instance) {
			HmrcTokenRequestProcessor.instance = new HmrcTokenRequestProcessor(logger, metrics, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET);
		}
		return HmrcTokenRequestProcessor.instance;
	}

	async processRequest(): Promise<void> {		
		this.logger.info("Generating a new hmrc access token ");
		try {
			const data = await this.hmrcService.generateToken();
			
			if (!data) {
				throw new AppError(HttpCodesEnum.SERVER_ERROR, "Failed generating hmrc access token");
			}

			// Validating expires_in 
			if (data.expires_in !== Constants.HMRC_EXPECTED_TOKEN_EXPIRES_IN) {
				this.logger.error(`expires_in doesnt match the expected value, received ${data.expires_in} instead of ${Constants.HMRC_EXPECTED_TOKEN_EXPIRES_IN}`);
			}

			this.logger.info("Storing the HMRC access token to SSM");
			await putParameter(Constants.HMRC_TOKEN_SSM_PATH, data.access_token, "String", "HMRC Access token");
			this.logger.info("Successfully Stored the HMRC token to SSM");
		} catch (error) {
			this.logger.error("Server Error", { error });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC access token");
		}
		
	}
}
