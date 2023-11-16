/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import axios from "axios";
import { mock } from "jest-mock-extended";
import { hmrcVerifyResponse } from "../data/hmrcEvents";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { MessageCodes } from "../../../models/enums/MessageCodes";
import { HmrcService } from "../../../services/HmrcService";
import { Constants } from "../../../utils/Constants";

const HMRC_BASE_URL = process.env.HMRC_BASE_URL!;
const HMRC_CLIENT_ID = process.env.HMRC_CLIENT_ID!;
const HMRC_CLIENT_SECRET = process.env.HMRC_CLIENT_SECRET!;
let hmrcServiceTest: HmrcService;
const logger = mock<Logger>();

describe("HMRC Service", () => {
	beforeAll(() => {
		hmrcServiceTest = new HmrcService(logger, HMRC_BASE_URL, HMRC_CLIENT_ID, HMRC_CLIENT_SECRET);
	});

	describe("#verify", () => {
		const accountNumber = "12345678";
		const sortCode = "123456";
		const name = "Test Testing";
		const hmrcTokenSsmPath = "dev/HMRC/TOKEN";

		it("calls HMRC verify endpoint with correct params and headers", async () => {
			jest.spyOn(axios, "post").mockResolvedValueOnce({ data: hmrcVerifyResponse });

			const response = await hmrcServiceTest.verify({ accountNumber, sortCode, name }, hmrcTokenSsmPath);

			expect(logger.info).toHaveBeenCalledWith("Sending COP verify request to HMRC");
			expect(axios.post).toHaveBeenCalledWith(
				`${hmrcServiceTest.HMRC_BASE_URL}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`,
				{
					account: { accountNumber, sortCode },
					subject: { name },
				},
				{ 
					headers: {
						"User-Agent": Constants.HMRC_USER_AGENT,
						"Authorization": "Bearer dev/HMRC/TOKEN",
					},
				},
			);
			expect(logger.debug).toHaveBeenCalledWith({
				message: "Recieved reponse from HMRC COP verify request",
				accountNumberIsWellFormatted: hmrcVerifyResponse.accountNumberIsWellFormatted,
				accountExists: hmrcVerifyResponse.accountExists,
				nameMatches: hmrcVerifyResponse.nameMatches,
				nonStandardAccountDetailsRequiredForBacs: hmrcVerifyResponse.nonStandardAccountDetailsRequiredForBacs,
				sortCodeIsPresentOnEISCD: hmrcVerifyResponse.sortCodeIsPresentOnEISCD,
				sortCodeSupportsDirectDebit: hmrcVerifyResponse.sortCodeSupportsDirectDebit,
				sortCodeSupportsDirectCredit: hmrcVerifyResponse.sortCodeSupportsDirectCredit,
			});
			expect(response).toEqual(hmrcVerifyResponse);
		});

		it("returns error if HMRC verify call fails", async () => {
			jest.spyOn(axios, "post").mockRejectedValueOnce("Error!");

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			await expect(hmrcServiceTest.verify({ accountNumber, sortCode, name }, hmrcTokenSsmPath))
				.rejects.toThrow(expect.objectContaining({
					statusCode: HttpCodesEnum.UNAUTHORIZED,
					message: "Error sending COP verify request to HMRC",
				}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Error sending COP verify request to HMRC", messageCode: MessageCodes.FAILED_VERIFYING_ACOUNT });
		});
	});
});
