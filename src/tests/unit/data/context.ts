import { Context } from "aws-lambda";

export const CONTEXT: Context = {
	awsRequestId: "",
	callbackWaitsForEmptyEventLoop: false,
	functionName: "BAV",
	functionVersion: "",
	invokedFunctionArn: "",
	logGroupName: "",
	logStreamName: "",
	memoryLimitInMB: "",
	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
	done(error?: Error, result?: any): void {
	},
	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
	fail(error: Error | string): void {
	},
	getRemainingTimeInMillis(): number {
		return 0;
	},
	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
	succeed(messageOrObject: any, object?: any): void {
	},
};
