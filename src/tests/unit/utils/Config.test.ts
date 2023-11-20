import { putParameter } from "../../../utils/Config";

const path = "dev/HMRC/TOKEN";
const sendMock = jest.fn();
jest.mock("@aws-sdk/client-ssm", () => ({
	SSMClient: jest.fn().mockImplementation(() => ({
		send: sendMock,
	})),
	PutParameterCommand: jest.fn().mockImplementation((args) => args),
}));

describe("Config utils", () => {
	describe("#putParameter", () => {

		it("returns successfully if putParameter stores the value to SSM Parameter", async () => {
			await putParameter(path, "token", "String", "HMRC Token");
			expect(sendMock).toHaveBeenCalledWith({ Name: path, Value: "token", Type: "String", Overwrite: true, Description: "HMRC Token"  });
		});

        it("throws error if putParameter fails to write to SSM parameter", async () => {
			sendMock.mockRejectedValueOnce(new Error("Failed to write SSM Parameter"))
			await expect(putParameter(path, "token", "String", "HMRC Token")).rejects.toThrow(expect.objectContaining({
				message: "Failed to write SSM Parameter",
			}));
			expect(sendMock).toHaveBeenCalledWith({ Name: path, Value: "token", Type: "String", Overwrite: true, Description: "HMRC Token"  });
		});

    });
});