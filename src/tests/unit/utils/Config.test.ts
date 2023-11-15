import { getParameter } from "../../../utils/Config";

const path = "dev/HMRC/TOKEN";
const sendMock = jest.fn();
jest.mock("@aws-sdk/client-ssm", () => ({
	SSMClient: jest.fn().mockImplementation(() => ({
		send: sendMock,
	})),
	GetParameterCommand: jest.fn().mockImplementation((args) => args),
}));

describe("Config utils", () => {
	describe("#getParameter", () => {
		it("throws error if parameter cannot be found", async () => {
			sendMock.mockResolvedValueOnce({ Parameter: null });
			await expect(getParameter(path)).rejects.toThrow(expect.objectContaining({
				message: "Parameter not found",
			}));
			expect(sendMock).toHaveBeenCalledWith({ Name: path });
		});

		it("throws error if parameter value is empty", async () => {
			sendMock.mockResolvedValueOnce({ Parameter: { Value: null } });
			await expect(getParameter(path)).rejects.toThrow(expect.objectContaining({
				message: "Parameter value is empty",
			}));
			expect(sendMock).toHaveBeenCalledWith({ Name: path });
		});

		it("returns parameter value", async () => {
			const value = "value";
			sendMock.mockResolvedValueOnce({ Parameter: { Value: value } });
			const parameter = await getParameter(path);
			expect(parameter).toEqual(value);
			expect(sendMock).toHaveBeenCalledWith({ Name: path });
		});
	});
});
