import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import { EnvironmentVariables } from "../utils/Constants";
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
		this.hmrcService = HmrcService.getInstance(this.logger, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET, this.hmrcBaseUrl);
	}

	static getInstance(logger: Logger, metrics: Metrics, HMRC_CLIENT_ID: string, HMRC_CLIENT_SECRET: string): HmrcTokenRequestProcessor {
		if (!HmrcTokenRequestProcessor.instance) {
			HmrcTokenRequestProcessor.instance = new HmrcTokenRequestProcessor(logger, metrics, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET);
		}
		return HmrcTokenRequestProcessor.instance;
	}

	async processRequest(): Promise<void> {		
		this.logger.info("Generating a new hmrc token ");
		try{
			const data = await this.hmrcService.generateToken();
			if(!data){
				throw new AppError(HttpCodesEnum.SERVER_ERROR, "Failed generating hmrc token");
			}

			this.logger.info("Storing the HMRC token to SSM");
			await putParameter("/dev/HMRC/TOKEN", data.access_token, "String", "HMRC token");
			this.logger.info("Successfully Stored the HMRC token to SSM");
		} catch(error){
			this.logger.error("Server Error", {error});
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error storing the SSM Parameter");
		}
		
	}
}
