import { Logger } from "@aws-lambda-powertools/logger";
import { Constants } from "../utils/Constants";
import axios from "axios";
import { AppError } from "../utils/AppError";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { HmrcVerifyResponse } from "../models/IHmrcResponse";

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

    async verify(
    	{ accountNumber, sortCode, name }: { accountNumber: string; sortCode: string; name: string },
    ): Promise<HmrcVerifyResponse> {
    	const params = {
    		account: { accountNumber, sortCode },
    		subject: { name },
    	};

    	try {
    		this.logger.info("Sending COP verify request to HMRC");
    		const response: HmrcVerifyResponse = await axios.post(`${this.HMRC_BASE_URL}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`, params);
    		this.logger.debug({
    			message: "Recieved reponse from HMRC COP verify request",
    			accountNumberIsWellFormatted: response.accountNumberIsWellFormatted,
    			accountExists: response.accountExists,
    			nameMatches: response.nameMatches,
    			nonStandardAccountDetailsRequiredForBacs: response.nonStandardAccountDetailsRequiredForBacs,
    			sortCodeIsPresentOnEISCD: response.sortCodeIsPresentOnEISCD,
    			sortCodeSupportsDirectDebit: response.sortCodeSupportsDirectDebit,
    			sortCodeSupportsDirectCredit: response.sortCodeSupportsDirectCredit,
    		});

    		return response;
    	} catch (error: any) {
    		const message = "Error sending COP verify request to HMRC";
    		this.logger.error({ message, messageCode: MessageCodes.FAILED_VERIFYING_ACOUNT });
    		throw new AppError(HttpCodesEnum.UNAUTHORIZED, message);
    	}
    }
}
