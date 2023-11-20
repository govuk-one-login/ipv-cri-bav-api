import { APIGatewayProxyEventHeaders, APIGatewayProxyEvent } from "aws-lambda";
import { absoluteTimeNow } from "./DateTimeUtils";
import { JwtPayload } from "../models/IVeriCredential";
import { PersonIdentityName } from "../models/PersonIdentityItem";
import { KmsJwtAdapter } from "./KmsJwtAdapter";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { AppError } from "./AppError";
import { Constants } from "./Constants";

export const	isJwtValid = (jwtPayload: JwtPayload,
	requestBodyClientId: string, expectedRedirectUri: string): string => {

	if (!isJwtComplete(jwtPayload)) {
		return "JWT validation/verification failed: Missing mandatory fields in JWT payload";
	} else if ((jwtPayload.exp == null) || (absoluteTimeNow() > jwtPayload.exp)) {
		return "JWT validation/verification failed: JWT expired";
	} else if (jwtPayload.nbf == null || (absoluteTimeNow() < jwtPayload.nbf)) {
		return "JWT validation/verification failed: JWT not yet valid";
	} else if (jwtPayload.client_id !== requestBodyClientId) {
		return `JWT validation/verification failed: Mismatched client_id in request body (${requestBodyClientId}) & jwt (${jwtPayload.client_id})`;
	} else if (jwtPayload.response_type !== "code") {
		return `JWT validation/verification failed: Unable to retrieve redirect URI for client_id: ${requestBodyClientId}`;
	} else if (expectedRedirectUri !== jwtPayload.redirect_uri) {
		return `JWT validation/verification failed: Redirect uri ${jwtPayload.redirect_uri} does not match configuration uri ${expectedRedirectUri}`;
	}

	return "";
};

const isJwtComplete = (payload: JwtPayload): boolean => {
	const clientId = payload.client_id;
	const responseType = payload.response_type;
	const journeyId = payload.govuk_signin_journey_id;
	const { iss, sub, aud, exp, nbf, state } = payload;
	const mandatoryJwtValues = [iss, sub, aud, exp, nbf, state, clientId, responseType, journeyId];
	return !mandatoryJwtValues.some((value) => value === undefined);
};

export const isValidStrings = (params: Array<string | undefined>): boolean => {
	if (params.some((param) => (param && param.trim()))) {
		return true;
	}
	return false;
};

export const isPersonNameValid = (personName: PersonIdentityName[]) : boolean => {
	let isValid = true;

	if ( personName.length === 0 ) {
		isValid = false;
	} else {
		for (const name of personName) {
			const { nameParts } = name;
			const givenNames: string[] = [];
			const familyNames: string[] = [];
			if (nameParts.length === 0 ) {
				isValid = false;
			} else {
				for (const namePart of nameParts) {
					if (namePart.type === "GivenName" && isValidStrings([namePart.value])) {
						givenNames.push(namePart.value);
					}
					if (namePart.type === "FamilyName" && isValidStrings([namePart.value])) {
						familyNames.push(namePart.value);
					}
				}
				if ( givenNames.length === 0 || familyNames.length === 0 ) {
					isValid = false;
					break;
				}
			}
		}
	}
	return isValid;
};

export const isValidUUID = (code: string): boolean => {
	return Constants.REGEX_UUID.test(code);
};
export const eventToSubjectIdentifier = async (jwtAdapter: KmsJwtAdapter, event: APIGatewayProxyEvent): Promise<string> => {
	const headerValue = event.headers.authorization || event.headers.Authorization;
	if (!headerValue) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Missing header: Authorization header value is missing or invalid auth_scheme");
	}
	
	if (!headerValue.startsWith(Constants.BEARER)) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Missing header: Authorization header is not of Bearer type access_token");
	}

	const token = headerValue.replace(/^Bearer\s+/, "");

	try {
		if (!await jwtAdapter.verify(token)) {
			throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Verification of JWT failed");
		}
	} catch (err) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Failed to verify signature");
	}

	const jwt = jwtAdapter.decode(token);

	if (!jwt?.payload?.exp || jwt.payload.exp < absoluteTimeNow()) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Verification of exp failed");
	}

	if (!jwt?.payload?.sub) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "sub missing");
	}

	return jwt.payload.sub;
};

export const getSessionIdHeaderErrors = (headers: APIGatewayProxyEventHeaders): string | void => {
	const sessionId = headers[Constants.X_SESSION_ID];
	if (!sessionId) {
		return `Missing header: ${Constants.X_SESSION_ID} is required`;
	}

	if (!Constants.REGEX_UUID.test(sessionId)) {
		return `${Constants.X_SESSION_ID} header does not contain a valid uuid`;
	}
};
