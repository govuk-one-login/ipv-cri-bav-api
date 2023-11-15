import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

export const getParameter = async (path: string): Promise<string | void> => {
	const client = new SSMClient({ region: process.env.REGION });
	const command = new GetParameterCommand({ Name: path });
	const response = await client.send(command);

	if (!response.Parameter) throw new Error("Parameter not found");
	if (!response.Parameter?.Value) throw new Error("Parameter value is empty");
	return response.Parameter?.Value;
};
