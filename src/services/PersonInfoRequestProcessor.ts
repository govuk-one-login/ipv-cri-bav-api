import { Metrics } from "@aws-lambda-powertools/metrics";
import { Logger } from "@aws-lambda-powertools/logger";
import NodeRSA from "node-rsa";
import { BavService } from "./BavService";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { MessageCodes } from "../models/enums/MessageCodes";
import { EnvironmentVariables } from "../utils/Constants";
import { createDynamoDbClient } from "../utils/DynamoDBFactory";
import { checkEnvironmentVariable } from "../utils/EnvironmentVariables";
import { getFullName } from "../utils/PersonIdentityUtils";
import { Response } from "../utils/Response";
import { APIGatewayProxyResult } from "aws-lambda";

export class PersonInfoRequestProcessor {
  private static instance: PersonInfoRequestProcessor;

  private readonly logger: Logger;

  private readonly metrics: Metrics;

  private readonly BavService: BavService;

	private readonly personIdentityTableName: string;

	private readonly publicKey: string;

	constructor(logger: Logger, metrics: Metrics, publicKey: string) {
		this.publicKey = publicKey;
		this.personIdentityTableName = checkEnvironmentVariable(EnvironmentVariables.PERSON_IDENTITY_TABLE_NAME, logger);
  	const sessionTableName: string = checkEnvironmentVariable(EnvironmentVariables.SESSION_TABLE, logger);

  	this.logger = logger;
  	this.metrics = metrics;
  	this.BavService = BavService.getInstance(sessionTableName, this.logger, createDynamoDbClient());
	}

	static getInstance(logger: Logger, metrics: Metrics, publicKey: string): PersonInfoRequestProcessor {
  	if (!PersonInfoRequestProcessor.instance) {
  		PersonInfoRequestProcessor.instance = new PersonInfoRequestProcessor(logger, metrics, publicKey);
  	}
  	return PersonInfoRequestProcessor.instance;
	}

	async processRequest(sessionId: string): Promise<APIGatewayProxyResult> {
  	const session = await this.BavService.getSessionById(sessionId);
		if (!session) {
  		this.logger.error("No session found for session id", {
  			messageCode: MessageCodes.SESSION_NOT_FOUND,
  		});
  		return Response(HttpCodesEnum.UNAUTHORIZED, `No session found with the session id: ${sessionId}`);
  	}

		this.logger.appendKeys({
  		govuk_signin_journey_id: session?.clientSessionId,
  	});

  	const person = await this.BavService.getPersonIdentityById(sessionId, this.personIdentityTableName);
		if (!person) {
  		this.logger.error("No person found for session id", {
  			messageCode: MessageCodes.PERSON_NOT_FOUND,
  		});
  		return Response(HttpCodesEnum.UNAUTHORIZED, `No person found with the session id: ${sessionId}`);
  	}

  	const name = getFullName(person.name);
  	const encryptedResponseValue = this.encryptResponse({ name });

  	return Response(HttpCodesEnum.OK, encryptedResponseValue);
	}

	encryptResponse(data: { name: string }): string {
		const dataString = JSON.stringify(data);

		this.logger.info("Encrypting personal info");
		const key = new NodeRSA(this.publicKey);
		return key.encrypt(dataString, "base64");
	}
}
