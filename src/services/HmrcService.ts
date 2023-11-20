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

    readonly HMRC_CLIENT_ID: string | undefined;

    readonly HMRC_CLIENT_SECRET: string | undefined;

    constructor(logger: Logger, HMRC_BASE_URL: string, HMRC_CLIENT_ID?: string, HMRC_CLIENT_SECRET?: string) {
    	this.logger = logger;
    	this.HMRC_BASE_URL = HMRC_BASE_URL;
    	this.HMRC_CLIENT_ID = HMRC_CLIENT_ID;
    	this.HMRC_CLIENT_SECRET = HMRC_CLIENT_SECRET;
    }

    static getInstance(
    	logger: Logger,
    	HMRC_BASE_URL: string,
    	HMRC_CLIENT_ID?: string,
    	HMRC_CLIENT_SECRET?: string,
    ): HmrcService {
    	if (!HmrcService.instance) {
    		HmrcService.instance = new HmrcService(logger, HMRC_BASE_URL, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET);
    	}
    	return HmrcService.instance;
    }

    // eslint-disable-next-line max-lines-per-function
    async verify(
    	{ accountNumber, sortCode, name }: { accountNumber: string; sortCode: string; name: string }, token: string,
    ): Promise<HmrcVerifyResponse> {

    	const params = {
    		account: { accountNumber, sortCode },
    		subject: { name },
    	};
    	const headers = {
    		"User-Agent": Constants.HMRC_USER_AGENT,
    		"Authorization": `Bearer ${token}`,
    	};

    	try {
    		const endpoint = `${this.HMRC_BASE_URL}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`;
    		this.logger.info("Sending COP verify request to HMRC", { endpoint });
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
    		this.logger.error({ message, messageCode: MessageCodes.FAILED_VERIFYING_ACOUNT });
    		throw new AppError(HttpCodesEnum.UNAUTHORIZED, message);
    	}
    }
}
