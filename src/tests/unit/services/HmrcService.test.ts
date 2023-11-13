/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@aws-lambda-powertools/logger";
import axios from "axios";
import { mock } from "jest-mock-extended";
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

		it("calls HMRC verify endpoint with correct params", async () => {
			const hmrcMockResponse = {
				"accountNumberIsWellFormatted": "no",
				"nonStandardAccountDetailsRequiredForBacs": "inapplicable",
				"sortCodeBankName": "THE ROYAL BANK OF SCOTLAND PLC",
				"sortCodeIsPresentOnEISCD": "yes",
				"sortCodeSupportsDirectDebit": "no",
				"sortCodeSupportsDirectCredit": "no",
				"iban": "GB25NWBK60080600724890",
				"accountExists": "indeterminate",
				"nameMatches": "no",
				"accountName": "Mr Peter Smith",
			};
			jest.spyOn(axios, "post").mockResolvedValueOnce(hmrcMockResponse);

			const response = await hmrcServiceTest.verify({ accountNumber, sortCode, name });

			expect(logger.info).toHaveBeenCalledWith("Sending verify request to HMRC");
			expect(axios.post).toHaveBeenCalledWith(
				`${hmrcServiceTest.HMRC_BASE_URL}/${Constants.HMRC_VERIFY_ENDPOINT_PATH}`,
				{
					account: { accountNumber, sortCode },
					subject: { name },
				},
			);
			expect(logger.debug).toHaveBeenCalledWith({
				message: "Recieved reponse from HMRC verify request",
				accountNumberIsWellFormatted: hmrcMockResponse.accountNumberIsWellFormatted,
				accountExists: hmrcMockResponse.accountExists,
				nameMatches: hmrcMockResponse.nameMatches,
				nonStandardAccountDetailsRequiredForBacs: hmrcMockResponse.nonStandardAccountDetailsRequiredForBacs,
				sortCodeIsPresentOnEISCD: hmrcMockResponse.sortCodeIsPresentOnEISCD,
				sortCodeSupportsDirectDebit: hmrcMockResponse.sortCodeSupportsDirectDebit,
				sortCodeSupportsDirectCredit: hmrcMockResponse.sortCodeSupportsDirectCredit,
			});
			expect(response).toEqual(hmrcMockResponse);
		});

		it("returns error if HMRC verify call fails", async () => {
			jest.spyOn(axios, "post").mockRejectedValueOnce("Error!");

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			await expect(hmrcServiceTest.verify({ accountNumber, sortCode, name })).rejects.toThrow(expect.objectContaining({
				statusCode: HttpCodesEnum.UNAUTHORIZED,
				message: "Error sending verify request to HMRC",
			}));
			expect(logger.error).toHaveBeenCalledWith({ message: "Error sending verify request to HMRC", messageCode: MessageCodes.FAILED_VERIFYING_ACOUNT });
		});
	});
});
