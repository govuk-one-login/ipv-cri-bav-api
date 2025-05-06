import { AccessRequestPayload } from "../type/AccessRequestPayload";
import { AppError } from "./AppError";
import { Constants } from "./Constants";
import { ISessionItem } from "../models/ISessionItem";
import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";
import { isValidUUID } from "./Validations";


export const isPayloadValid = (tokenRequestBody: string | null): AccessRequestPayload => {
	if (!tokenRequestBody) throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid request: missing body");
	// body is an application/x-www-form-urlencoded string
	const searchParams = new URLSearchParams(tokenRequestBody);
	const code = searchParams.get(Constants.CODE);
	const redirectUri = searchParams.get(Constants.REDIRECT_URL);
	const grant_type = searchParams.get(Constants.GRANT_TYPE);
	const client_assertion_type = searchParams.get(Constants.CLIENT_ASSERTION_TYPE);
	const client_assertion = searchParams.get(Constants.CLIENT_ASSERTION);

	if (!redirectUri) throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid request: Missing redirect_uri parameter");
	if (!code) throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid request: Missing code parameter");

	if (!grant_type || grant_type !== Constants.AUTHORIZATION_CODE) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid grant_type parameter");
	}

	if (!isValidUUID(code)) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "AuthorizationCode must be a valid uuid");
	}

	if (!client_assertion_type || client_assertion_type !== Constants.CLIENT_ASSERTION_TYPE_JWT_BEARER) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid client_assertion_type parameter");
	}

	if (!client_assertion) throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid request: Missing client_assertion parameter");

	return { grant_type, code, redirectUri, client_assertion_type, client_assertion };
};

export const validateTokenRequestToRecord = (sessionItem: ISessionItem, redirectUri: string): void => {
	// Validate the redirectUri
	const isValidRedirectUri = redirectUri.includes("/")
		? redirectUri === sessionItem.redirectUri
		: redirectUri === encodeURIComponent(sessionItem.redirectUri);

	if (!isValidRedirectUri) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED,
			`Invalid request: redirect uri ${redirectUri} does not match configuration uri ${sessionItem.redirectUri}`);
	}
};
