import { GetParameterCommand, PutParameterCommand, PutParameterCommandOutput, SSMClient } from "@aws-sdk/client-ssm";

export async function getParameter(path: string): Promise<string> {
	const client = new SSMClient({ region: process.env.REGION });
	const command = new GetParameterCommand({ Name: path });
	const response = await client.send(command);

	if (response.Parameter == null) { throw new Error("Parameter not found"); }
	if (response.Parameter.Value == null) { throw new Error("Parameter is null"); }
	return response.Parameter.Value;
}

export async function putParameter(parameterName: string, parameterValue: string, type: string, description: string): Promise<void | undefined> {
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
}
