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
    ) {
    	const params = {
    		header: {
			  tenantId: uuid,
			  requestType: "BAVConsumer-Standard",
    		},
    		account: { accountNumber, sortCode },
    		subject: { name },
		  };
		  
    	const headers = {
    		"User-Agent": Constants.EXPERIAN_USER_AGENT,
    		"Authorization": `Bearer ${token}`,
    		"Content-Type":"application/json",
    		"Accept":"application/json",
    	};

    	let retryCount = 0;
    	let exponentialBackOffPeriod = this.backoffPeriodMs;
    	while (retryCount <= this.maxRetries) {
			
    		try {

    			const endpoint = `${this.experianBaseUrl}/${Constants.EXPERIAN_VERIFY_ENDPOINT_PATH}`;
    			this.logger.info("Sending verify request to Experian", { uuid, endpoint, retryCount });
    			const { data } = await axios.post(endpoint, params, { headers });
    			const decisionElements = data?.clientResponsePayload?.decisionElements;

    			this.logger.debug({
    				message: "Recieved response from Experian verify request",
    				eventType: decisionElements[1].auditLogs[0].eventType,
    				eventOutcome: decisionElements[1].auditLogs[0].eventOutcome,
    			});

    			let personalDetailsScore;

    			if (decisionElements[0] && decisionElements[0].warningsErrors && decisionElements[0].warningsErrors[0] && decisionElements[0].warningsErrors[0].responseCode) {
    				switch (decisionElements[0].warningsErrors[0].responseCode) {
    					case 2:
						  personalDetailsScore = 1;
						  this.logger.debug("Modulus check algorithm is unavailable for these account details and therefore Bank Wizard cannot confirm the details are valid");
						  break;
    					case 3:
						  personalDetailsScore = 1;
						  this.logger.debug("Account number does not use a modulus check algorithm and therefore Bank Wizard cannot confirm the details are valid");
						  break;
    					case 6:
						  personalDetailsScore = 1;
						  this.logger.debug("Bank or branch code is not in use");
						  break;
    					case 7:
						  personalDetailsScore = 1;
						  this.logger.debug("Modulus check has failed. Although the formats of the supplied fields are correct, one or more of them are incorrect");
						  break;
    					case 11:
						  personalDetailsScore = 1;
						  this.logger.debug("Sort Code has been closed");
						  break;
    					case 12:
						  personalDetailsScore = 1;
						  this.logger.debug("Branch has been transferred and the accounts have been redirected to another branch");
						  break;
    					default:
						  this.logger.debug("No error");
						  break;
					  }
    			} else {
    				personalDetailsScore = decisionElements[2].scores[0].score;
    			}

    			return personalDetailsScore;
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
    			this.logger.error({ message: "An error occurred when generating Experian token", statusCode: error?.response?.status, messageCode: MessageCodes.FAILED_GENERATING_EXPERIAN_TOKEN });

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
