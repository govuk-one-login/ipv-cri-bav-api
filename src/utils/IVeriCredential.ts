// limit to supported algs https://datatracker.ietf.org/doc/html/rfc7518
export type Algorithm =
	"HS256" | "HS384" | "HS512" |
	"RS256" | "RS384" | "RS512" |
	"ES256" | "ES384" | "ES512" |
	"PS256" | "PS384" | "PS512" |
	"none";

export interface JWKSBody {
	keys: Jwk[];
}
export interface Jwk extends JsonWebKey {
	alg: Algorithm;
	kid: string;
	kty: "EC" | "RSA";
	use: "sig" | "enc";
}

