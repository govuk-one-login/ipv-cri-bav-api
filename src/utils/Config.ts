import { GetParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

export const getParameter = async (path: string): Promise<string> => {
	const client = new SSMClient({ region: process.env.REGION });
	const command = new GetParameterCommand({ Name: path });
	const response = await client.send(command);

	if (!response.Parameter) throw new Error("Parameter not found");
	if (!response.Parameter?.Value) throw new Error("Parameter value is empty");
	return response.Parameter?.Value;
};

export const  putParameter = async (parameterName: string, parameterValue: string, type: string, description: string): Promise<void | undefined> => {
	const client = new SSMClient({ region: process.env.REGION });
	const input = { 
		Name: parameterName, 
		Type: type,
		Description: description,
		Value: parameterValue,
		Overwrite: true,
	  };
	  const command = new PutParameterCommand(input);
	  await client.send(command);
};