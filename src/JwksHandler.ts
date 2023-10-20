import { Logger } from "@aws-lambda-powertools/logger";
import { AppError } from "./utils/AppError";
import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Constants, EnvironmentVariables } from "./utils/Constants";
import { Jwk, JWKSBody, Algorithm } from "./utils/IVeriCredential";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import crypto from "crypto";
import * as AWS from "@aws-sdk/client-kms";
import { HttpCodesEnum } from "./models/enums/HttpCodesEnum";
import { checkEnvironmentVariable } from "./utils/EnvironmentVariables";

const POWERTOOLS_LOG_LEVEL = process.env.POWERTOOLS_LOG_LEVEL ? process.env.POWERTOOLS_LOG_LEVEL : "DEBUG";
const POWERTOOLS_SERVICE_NAME = process.env.POWERTOOLS_SERVICE_NAME ? process.env.POWERTOOLS_SERVICE_NAME : Constants.JWKS_LOGGER_SVC_NAME;
export const logger = new Logger({
	logLevel: POWERTOOLS_LOG_LEVEL,
	serviceName: POWERTOOLS_SERVICE_NAME,
});

class JwksHandler implements LambdaInterface {
	readonly s3Client = new S3Client({
		region: process.env.REGION,
		maxAttempts: 2,
		requestHandler: new NodeHttpHandler({
			connectionTimeout: 29000,
			socketTimeout: 29000,
		}),
	});

	readonly kmsClient = new AWS.KMS({
		region: process.env.REGION,
	});

	async handler(): Promise<string> {
		const signingKeyIds = checkEnvironmentVariable(EnvironmentVariables.SIGNING_KEY_IDS, logger);
		const encryptionKeyIds = checkEnvironmentVariable(EnvironmentVariables.ENCRYPTION_KEY_IDS, logger);
		const jwksBucketName = checkEnvironmentVariable(EnvironmentVariables.JWKS_BUCKET_NAME, logger);

		const body: JWKSBody = { keys: [] };
		const kmsKeyIds = [
			...signingKeyIds.split(","),
			...encryptionKeyIds.split(","),
		];
		logger.info({ message:"Building wellknown JWK endpoint with keys" + kmsKeyIds });

		const jwks = await Promise.all(
			kmsKeyIds.map(async id => this.getAsJwk(id)),
		);
		jwks.forEach(jwk => {
			if (jwk != null) {
				body.keys.push(jwk);
			} else logger.warn({ message:"Environment contains missing keys" });
		});

		const uploadParams = {
			Bucket: jwksBucketName,
			Key: ".well-known/jwks.json",
			Body: JSON.stringify(body),
			ContentType: "application/json",
		};

		try {
			await this.s3Client.send(new PutObjectCommand(uploadParams));
		} catch (err) {
			logger.error({ message: "Error writing keys to S3 bucket" + err });
			throw new Error("Error writing keys to S3 bucket");
		}
		return JSON.stringify(body);

	}

	async getAsJwk(keyId: string): Promise<Jwk | null> {
		let kmsKey;
		try {
			kmsKey = await this.kmsClient.getPublicKey({ KeyId: keyId });
		} catch (error) {
			logger.warn({ message:"Failed to fetch key from KMS" }, { error });
		}
	
		const map = this.getKeySpecMap(kmsKey?.KeySpec);
		if (
			kmsKey != null &&
					map != null &&
					kmsKey.KeyId != null &&
					kmsKey.PublicKey != null
		) {
			const use = kmsKey.KeyUsage === "ENCRYPT_DECRYPT" ? "enc" : "sig";
			const publicKey = crypto
				.createPublicKey({
					key: kmsKey.PublicKey as Buffer,
					type: "spki",
					format: "der",
				})
				.export({ format: "jwk" });
			return {
				...publicKey,
				use,
				kid: keyId.split("/").pop(),
				alg: map.algorithm,
			} as unknown as Jwk;
		}
		logger.error({ message: "Failed to build JWK from key" + keyId }, JSON.stringify(map));
		return null;
	}
	
	getKeySpecMap(spec?: string): { keySpec: string; algorithm: Algorithm } | undefined {
		if (spec == null) return undefined;
		const conversions = [
			{
				keySpec: "ECC_NIST_P256",
				algorithm: "ES256" as Algorithm,
			},
			{
				keySpec: "RSA_2048",
				algorithm: "RS256" as Algorithm,
			},
		];
		return conversions.find(x => x.keySpec === spec);
	}
}

export const handlerClass = new JwksHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
