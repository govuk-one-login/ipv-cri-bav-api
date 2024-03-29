import express from "express";
import asyncify from "express-asyncify";
import { lambdaHandler } from "../../../UserInfoHandler";
import { APIGatewayProxyEvent } from "aws-lambda";
import { convertIncomingHeadersToAPIGatewayHeaders, eventRequest } from "../utils/ApiRequestUtils";
import { Constants } from "../utils/Constants";

process.env.SESSION_TABLE = "session-table";
process.env.TXMA_QUEUE_URL = "txma-queue";
process.env.USE_MOCKED = "true";
process.env.KMS_KEY_ARN = "kid";
process.env.PERSON_IDENTITY_TABLE_NAME = "person-identity-table";
process.env.ISSUER = "dummyBavComponentId";
process.env.DNSSUFFIX = "dns";

export const userInfoRouter = asyncify(express.Router());

// eslint-disable-next-line @typescript-eslint/no-misused-promises
userInfoRouter.post("/", async (req, res) => {
	const event: APIGatewayProxyEvent = eventRequest;
	event.headers = convertIncomingHeadersToAPIGatewayHeaders(req.headers);	
		
	const userInfoResponse = await lambdaHandler(event, {});
	res.status(userInfoResponse.statusCode);
	res.setHeader(Constants.HTTP_CONTENT_TYPE_HEADER, Constants.JSON_CONTENT_TYPE);
	res.send(userInfoResponse.body);
});

