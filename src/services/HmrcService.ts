import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios, { AxiosRequestConfig } from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { HmrcTokenResponse } from "../models/IHmrcResponse";

export class HmrcService {
	readonly logger: Logger;

	private static instance: HmrcService;

    readonly HMRC_BASE_URL: string;

    readonly HMRC_CLIENT_ID: string;

    readonly HMRC_CLIENT_SECRET: string;

    constructor(logger: Logger, HMRC_CLIENT_ID: string, HMRC_CLIENT_SECRET: string, HMRC_BASE_URL: string) {
		this.logger = logger;
        this.HMRC_BASE_URL = HMRC_BASE_URL;
        this.HMRC_CLIENT_ID = HMRC_CLIENT_ID;
        this.HMRC_CLIENT_SECRET = HMRC_CLIENT_SECRET;
	}

	static getInstance(
		logger: Logger,
        HMRC_CLIENT_ID: string,
        HMRC_CLIENT_SECRET:string,
		HMRC_BASE_URL: string,
	): HmrcService {
		if (!HmrcService.instance) {
			HmrcService.instance = new HmrcService(logger, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET, HMRC_BASE_URL);
		}
		return HmrcService.instance;
	}

    async generateToken(): Promise<HmrcTokenResponse|undefined> {
        
        try {
            const params = {
                client_secret : this.HMRC_CLIENT_SECRET,
                client_id : this.HMRC_CLIENT_ID,
                grant_type : "client_credentials",
            }
            const config: AxiosRequestConfig<any> = {
                headers: {
                    Accept: "application/x-www-form-urlencoded",
                },
            };
            this.logger.debug("Token input params ", {tokenParams: params});
            
			const { data } = await axios.post(
				`${this.HMRC_BASE_URL}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
				params,
                config
            );

			this.logger.info("Received response from HMRC token endpoint", {TokenResponse: data});
            return data;
		} catch (error: any) {
			this.logger.error({ message: "An error occurred when generating HMRC token", hmrcErrorMessage: error.message, hmrcErrorCode: error.code, messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN });
			throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC token");
		}
    }
}
