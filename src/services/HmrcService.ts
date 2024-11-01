import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios, { AxiosRequestConfig } from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { HmrcVerifyResponse, HmrcTokenResponse } from "../models/IHmrcResponse";
import { sleep } from "../utils/Sleep";

export class HmrcService {
	readonly logger: Logger;

	private static instance: HmrcService;

    readonly hmrcBaseUrl: string;

    readonly backoffPeriodMs: number;

    readonly maxRetries: number;

    constructor(logger: Logger, hmrcBaseUrl: string, backoffPeriodMs: number, maxRetries: number) {
    	this.logger = logger;
    	this.hmrcBaseUrl = hmrcBaseUrl;
    	this.backoffPeriodMs = backoffPeriodMs;
    	this.maxRetries = maxRetries;
    }

    static getInstance(logger: Logger, hmrcBaseUrl: string, backoffPeriodMs: number, maxRetries: number): HmrcService {
    	if (!HmrcService.instance) {
    		HmrcService.instance = new HmrcService(logger, hmrcBaseUrl, backoffPeriodMs, maxRetries);
    	}
    	return HmrcService.instance;
    }

    // eslint-disable-next-line max-lines-per-function
    async verify(
    	{ accountNumber, sortCode, name, uuid }: { accountNumber: string; sortCode: string; name: string; uuid: string }, token: string,
    ): Promise<HmrcVerifyResponse | undefined> {
    	const params = {
    		account: { accountNumber, sortCode },
    		subject: { name },
    	};
    	const headers = {
    		"User-Agent": Constants.HMRC_USER_AGENT,
    		"Authorization": `Bearer ${token}`,
    		"X-Tracking-Id": uuid,
    	};

    	let retryCount = 0;
    	let exponentialBackOffPeriod = this.backoffPeriodMs;
    	while (retryCount <= this.maxRetries) {
    		try {
    			const endpoint = `${this.hmrcBaseUrl}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`;
    			this.logger.info("Sending COP verify request to HMRC", { uuid, endpoint, retryCount });
    			const { data }: { data: HmrcVerifyResponse } = await axios.post(endpoint, params, { headers });

    			this.logger.debug({
    				message: "Recieved reponse from HMRC COP verify request",
    				accountNumberIsWellFormatted: data.accountNumberIsWellFormatted,
    				accountExists: data.accountExists,
    				nameMatches: data.nameMatches,
    				nonStandardAccountDetailsRequiredForBacs: data.nonStandardAccountDetailsRequiredForBacs,
    				sortCodeIsPresentOnEISCD: data.sortCodeIsPresentOnEISCD,
    				sortCodeSupportsDirectDebit: data.sortCodeSupportsDirectDebit,
    				sortCodeSupportsDirectCredit: data.sortCodeSupportsDirectCredit,
    			});

    			return data;
    		} catch (error: any) {
    			const message = "Error sending COP verify request to HMRC";
    			this.logger.error({ message, messageCode: MessageCodes.FAILED_VERIFYING_ACCOUNT, statusCode: error?.response?.status });

    			if ((error?.response?.status === 500 || error?.response?.status === 429) && retryCount < this.maxRetries) {
    				this.logger.error(`Sleeping for ${exponentialBackOffPeriod} ms before retrying verification`, { retryCount });
    				await sleep(exponentialBackOffPeriod);
    				retryCount++;
    				exponentialBackOffPeriod = exponentialBackOffPeriod * 2;
    			} else {
    				throw new AppError(HttpCodesEnum.SERVER_ERROR, message);
    			}
    		}
    	}
    }

    // eslint-disable-next-line max-lines-per-function
    async generateToken(clientSecret: string, clientId: string): Promise<HmrcTokenResponse | undefined> {
    	this.logger.debug("generateToken", HmrcService.name);

    	let retryCount = 0;
    	while (retryCount <= this.maxRetries) {
    		this.logger.debug(`generateToken - trying to generate hmrcToken ${new Date().toISOString()}`, {
    			retryCount,
    		});
    		try {
    			const params = {
    				client_secret : clientSecret,
    				client_id : clientId,
    				grant_type : "client_credentials",
    			};
    			const config: AxiosRequestConfig<any> = {
    				headers: {
    					"Content-Type": "application/x-www-form-urlencoded",
    				},
    			};
				
    			const { data }: { data: HmrcTokenResponse } = await axios.post(
    				`${this.hmrcBaseUrl}${Constants.HMRC_TOKEN_ENDPOINT_PATH}`,
    				params,
    				config,
    			);

    			this.logger.info("Received response from HMRC token endpoint");
    			return data;
    		} catch (error: any) {
    			this.logger.error({ message: "An error occurred when generating HMRC token", statusCode: error?.response?.status, messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN });

    			if (error?.response?.status === 500 && retryCount < this.maxRetries) {
    				this.logger.error(`generateToken - Retrying to generate hmrcToken. Sleeping for ${this.backoffPeriodMs} ms ${HmrcService.name} ${new Date().toISOString()}`, { retryCount });
    				await sleep(this.backoffPeriodMs);
    				retryCount++;
    			} else {
    				throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating HMRC token");
    			}
    		}
    	}
    	this.logger.error(`generateToken - cannot generate hmrcToken even after ${this.maxRetries} retries.`);
    	throw new AppError(HttpCodesEnum.SERVER_ERROR, `Cannot generate hmrcToken even after ${this.maxRetries} retries.`);
    }
}

