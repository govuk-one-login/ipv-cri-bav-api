import { ParameterType } from "@aws-sdk/client-ssm";
import { createSsmClient, GetParameterCommand, PutParameterCommand } from "./SSMClient";

export const getParameter = async (path: string): Promise<string> => {
	const client = createSsmClient();
	const command = new GetParameterCommand({ Name: path });
	const response = await client.send(command);

	if (!response.Parameter) throw new Error("Parameter not found");

	if (!response.Parameter?.Value) throw new Error("Parameter value is empty");
	return response.Parameter?.Value;
};

export const putParameter = async (parameterName: string, parameterValue: string, description: string): Promise<void | undefined> => {
	const client = createSsmClient();
	const input = { 
		Name: parameterName, 
		Type: ParameterType.STRING,
		Description: description,
		Value: parameterValue,
		Overwrite: true,
	  };
	  const command = new PutParameterCommand(input);
	  await client.send(command);
};
