import { Jwt, JwtPayload } from "../../../models/IVeriCredential";
import { absoluteTimeNow } from "../../../utils/DateTimeUtils";

const ACCESS_TOKEN = "ACCESS_TOKEN";

export class MockKmsJwtAdapter {
    result: boolean;

    mockJwt: Jwt;

    constructor(result: boolean, mockJwT: Jwt = {
    	header: {
    		alg: "alg",
    		typ: "typ",
    		kid: "kid",
    	},
    	payload: {
    		iss: "issuer",
    		sub: "sessionId",
    		aud: "audience",
    		exp: absoluteTimeNow() + 1000,
    	},
    	signature: "testSignature",
    },
    ) {
    	this.result = result;
    	this.mockJwt = mockJwT;
    }

	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
    verify(_urlEncodedJwt: string): boolean { return this.result; }

	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
    decode(_urlEncodedJwt: string): Jwt { return this.mockJwt; }

	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
    sign(_jwtPayload: JwtPayload): string { return "signedJwt-test"; }
}

export class MockFailingKmsSigningJwtAdapter {

	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
	sign(_jwtPayload: JwtPayload): string { throw new Error("Failed to sign Jwt"); }
}

export class MockKmsSigningTokenJwtAdapter {

	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
	sign(_jwtPayload: JwtPayload): string { return ACCESS_TOKEN; }
}

export class MockKmsJwtAdapterForVc {
    result: boolean;

    constructor(result: boolean) {
    	this.result = result;
    }

	// ignored to allow mocking
	/* eslint-disable @typescript-eslint/no-unused-vars */
    verify(_urlEncodedJwt: string): boolean { return this.result; }

    sign(jwtPayload: JwtPayload): string {
    	return JSON.stringify(jwtPayload);
    }
}
