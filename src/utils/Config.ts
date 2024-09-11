import { createSsmClient, GetParameterCommand, PutParameterCommand } from "./SSMClient";

export const getParameter = async (path: string): Promise<string> => {
	console.log("-------------------------------FAILURE HERE", path);
	const client = createSsmClient();
	console.log("-------------------------------FAILURE HERE", path);
	const command = new GetParameterCommand({ Name: path });
	console.log("-------------------------------FAILURE HERE", path);
	const response = await client.send(command);
	console.log("-------------------------------FAILURE HERE", path);


	if (!response.Parameter) throw new Error("Parameter not found");
	console.log("-------------------------------FAILURE HERE", path);

	if (!response.Parameter?.Value) throw new Error("Parameter value is empty");
	console.log("-------------------------------FAILURE HERE", path);
	return response.Parameter?.Value;
};

export const putParameter = async (parameterName: string, parameterValue: string, type: string, description: string): Promise<void | undefined> => {
	const client = createSsmClient();
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
