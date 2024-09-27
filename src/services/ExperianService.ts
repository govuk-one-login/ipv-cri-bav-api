import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios, { AxiosRequestConfig } from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { ExperianVerifyResponse, ExperianTokenResponse } from "../models/IExperianResponse";
import { sleep } from "../utils/Sleep";

export class ExperianService {
	readonly logger: Logger;

	private static instance: ExperianService;

    readonly experianBaseUrl: string;

    readonly backoffPeriodMs: number;

    readonly maxRetries: number;

    constructor(logger: Logger, experianBaseUrl: string, backoffPeriodMs: number, maxRetries: number) {
    	this.logger = logger;
    	this.experianBaseUrl = experianBaseUrl;
    	this.backoffPeriodMs = backoffPeriodMs;
    	this.maxRetries = maxRetries;
    }

    static getInstance(logger: Logger, experianBaseUrl: string, backoffPeriodMs: number, maxRetries: number): ExperianService {
    	if (!ExperianService.instance) {
    		ExperianService.instance = new ExperianService(logger, experianBaseUrl, backoffPeriodMs, maxRetries);
    	}
    	return ExperianService.instance;
    }

    // eslint-disable-next-line max-lines-per-function
    async verify(
    	{ accountNumber, sortCode, name, uuid }: { accountNumber: string; sortCode: string; name: string; uuid: string }, token: string,
    ): Promise<any | undefined> {
    	const params = {
    		account: { accountNumber, sortCode },
    		subject: { name },
    	};
    	const headers = {
    		"User-Agent": Constants.EXPERIAN_USER_AGENT,
    		"Authorization": `Bearer ${token}`,
    		"X-Tracking-Id": uuid,
    	};

		console.log("TOKEN PRINT", token)

    	let retryCount = 0;
    	let exponentialBackOffPeriod = this.backoffPeriodMs;
    	while (retryCount <= this.maxRetries) {
    		try {
				console.log("PARAMS PRINT", params)			
    			const endpoint = `${this.experianBaseUrl}/${Constants.EXPERIAN_VERIFY_ENDPOINT_PATH}`;
				console.log("ENDPOINT PRINT", endpoint)
    			this.logger.info("Sending verify request to Experian", { uuid, endpoint, retryCount });
				const { data }: { data: ExperianVerifyResponse } = await axios.post(endpoint, params, { headers });
				console.log("DATA PRINT", data)
				const personalDetailsScore = data.clientResponsePayload.decisionElements[2].scores[0].score;
				console.log("PD SCORE", personalDetailsScore)
    			return personalDetailsScore

    		} catch (error: any) {
    			const message = "Error sending verify request to Experian";
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
    async generateToken(clientSecret: string, clientId: string): Promise<ExperianTokenResponse | undefined> {
    	this.logger.debug("generateToken", ExperianService.name);

    	let retryCount = 0;
    	while (retryCount <= this.maxRetries) {
    		this.logger.debug(`generateToken - trying to generate experianToken ${new Date().toISOString()}`, {
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
				
    			const { data }: { data: ExperianTokenResponse } = await axios.post(
    				`${this.experianBaseUrl}${Constants.EXPERIAN_TOKEN_ENDPOINT_PATH}`,
    				params,
    				config,
    			);

    			this.logger.info("Received response from Experian token endpoint");
    			return data;
    		} catch (error: any) {
    			this.logger.error({ message: "An error occurred when generating Experian token", statusCode: error?.response?.status, messageCode: MessageCodes.FAILED_GENERATING_HMRC_TOKEN });

    			if (error?.response?.status === 500 && retryCount < this.maxRetries) {
    				this.logger.error(`generateToken - Retrying to generate experianToken. Sleeping for ${this.backoffPeriodMs} ms ${ExperianService.name} ${new Date().toISOString()}`, { retryCount });
    				await sleep(this.backoffPeriodMs);
    				retryCount++;
    			} else {
    				throw new AppError(HttpCodesEnum.SERVER_ERROR, "Error generating Experian token");
    			}
    		}
    	}
    	this.logger.error(`generateToken - cannot generate experianToken even after ${this.maxRetries} retries.`);
    	throw new AppError(HttpCodesEnum.SERVER_ERROR, `Cannot generate experianToken even after ${this.maxRetries} retries.`);
    }
}

