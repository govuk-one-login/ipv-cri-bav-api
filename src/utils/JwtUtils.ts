import * as jose from "node-jose";
import crypto from "crypto";

export const jwtUtils = {

	// convert non-base64 string or uint8array into base64 encoded string
	base64Encode(value: string | WithImplicitCoercion<string>): string {
		return jose.util.base64url.encode(Buffer.from(value), "utf8");
	},

	// convert base64 into uint8array
	base64DecodeToUint8Array(value: string): Uint8Array {
		return new Uint8Array(jose.util.base64url.decode(value));
	},

	// convert base64 encoded string into non-base64 string
	base64DecodeToString(value: string): string {
		return Buffer.from(value, "base64url").toString();
	},

	// convert uint8array into string
	decode(value: Uint8Array): string {
		const decoder = new TextDecoder();
		return decoder.decode(value);
	},

	// convert string into uint8array
	encode(value: string): Uint8Array {
		const encoder = new TextEncoder();
		return encoder.encode(value);
	},

	getHashedKid(keyId: string): string {
		const kidBytes = Buffer.from(keyId, "utf8");
		const hash = crypto.createHash("sha256").update(kidBytes).digest();
		return Buffer.from(hash).toString("hex");
	},
};
