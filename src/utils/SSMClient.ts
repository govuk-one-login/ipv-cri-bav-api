import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import AWSXRay from "aws-xray-sdk-core";
import { mockSsmClient } from "../tests/contract/mocks/ssmClient";
import { Logger } from "@aws-lambda-powertools/logger";

const logger = new Logger({
	logLevel: "INFO",
	serviceName: "SSMClient",
});

const createSsmClient = () => {
	let ssmClient: SSMClient;
	if (process.env.USE_MOCKED === "true") {
		logger.info("SSMClient: USING MOCKED");
		ssmClient = mockSsmClient as unknown as SSMClient;
	} else {
        
		AWSXRay.setContextMissingStrategy("LOG_ERROR");

		const ssmClientRaw = new SSMClient({ region: process.env.REGION });

		ssmClient = process.env.XRAY_ENABLED === "true" ? AWSXRay.captureAWSv3Client(ssmClientRaw as any) : ssmClientRaw;
	}
	return ssmClient;
};

export { createSsmClient, GetParameterCommand, PutParameterCommand };
