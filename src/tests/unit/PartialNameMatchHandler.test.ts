 
import { SQSEvent } from "aws-lambda";
import { s3Client, lambdaHandler } from "../../PartialNameMatchHandler";
import { CONTEXT } from "./data/context";

jest.useFakeTimers().setSystemTime(new Date("2020-01-01"));

jest.mock("@aws-sdk/client-s3", () => ({
	S3Client: jest.fn().mockImplementation(() => ({
		send: jest.fn(),
	})),
	ServerSideEncryption: {
		aws_kms: "aws:kms"
	},
	PutObjectCommand: jest.fn().mockImplementation((args) => args),
}));

describe("PartialNameMatchHandler", () => {
	process.env.PARTIAL_MATCHES_BUCKET = "BUCKET_NAME";
	process.env.PARTIAL_MATCHES_BUCKET_KEY = "BUCKET_KEY";
	
	const event = {
		"Records": [
			{
				"messageId": "e37a7d34-659f-4899-b968-2026151905b8",
				"receiptHandle": "AQEBjgm6tWjsgiSUZbPYO1/lj6YIV9BHk9qGwtR5GogpHm+kZk8r4vGFP8v+ccAH6SSFPlbveJogCZgbKu6IMwC5k8E7rwM5nuGHeCqNgP+Zj2fXNW6hZk+R/ajr86C6pqnnaLWeCTttSfwcO7ClXLyL3/IhQChBX0neKxVZF1QkPoQLcZ2CyalR6S7xGGSCuAy+JPM6G/6igMqMYd11l9EoDKGiLb0VaaSsdCiWL+kcfgzluUfclTrne09DbIl+oP6Z5bw/nSfa4OOd/TOluPZQZpbQC0FczVbyCq4qy+CUiK2Wf1IMFRO3ecRvZmBKfkeLixgcd4zYLDFA00/xLI9gVohT9i4bobxQ2zN0Mc5tXAt4pHKJL7TuH/9PIBWQKj/PbuT0JWynCfJXPs4fqBDr4VzQIp4nRVnUR170DC+tUegTxO+3Aelw2NG0kcI8L2mVigS85rVUIOryEfnCgZEYCw==",
				"body": "{\"itemNumber\":\"8356a38c-f8e5-49cc-9639-6a1655e53c69\",\"timeStamp\":1705409058,\"cicName\":\"Yasmine Palmer\",\"accountExists\":\"yes\",\"nameMatches\":\"partial\"}",
				"attributes": {
					"ApproximateReceiveCount": "1",
					"AWSTraceHeader": "Root=1-65a67a22-5d3cca3e0bf0fe4e3b34d596;Parent=c5ad3f53ab93eba6;Sampled=1;Lineage=f12a867a:0",
					"SentTimestamp": "1705409066994",
					"SenderId": "AROAYMR33DD4SR3XMIVSD:BAV-verify-account-bav-cri-api-viveakvpartial1",
					"ApproximateFirstReceiveTimestamp": "1705409066998",
				},
				"messageAttributes": {},
				"md5OfBody": "88df22c30499643fbb07a8e6147ff183",
				"eventSource": "aws:sqs",
				"eventSourceARN": "arn:aws:sqs:eu-west-2:576724867321:bav-cri-api-viveakvpartial1-PartialMatchesQueue-RhPpeHVPA1D3",
				"awsRegion": "eu-west-2",
			},
		],
	};

	it("Saves SQS message to S3 given a valid event payload", async () => {
		await lambdaHandler(event as SQSEvent, CONTEXT);
		jest.spyOn(s3Client, "send").mockReturnValueOnce();
		expect(s3Client.send).toHaveBeenCalledWith({"Body": "{\"itemNumber\":\"8356a38c-f8e5-49cc-9639-6a1655e53c69\",\"timeStamp\":1705409058,\"cicName\":\"Yasmine Palmer\",\"accountExists\":\"yes\",\"nameMatches\":\"partial\"}", "Bucket": "BUCKET_NAME", "ContentType": "application/json", "Key": "1577836800-e37a7d34-659f-4899-b968-2026151905b8.json", "SSEKMSKeyId": "BUCKET_KEY", "ServerSideEncryption": "aws:kms"});
	});

});
