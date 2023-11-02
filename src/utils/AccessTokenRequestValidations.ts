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

	if (!redirectUri) throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid request: Missing redirect_uri parameter");
	if (!code) throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid request: Missing code parameter");

	if (!grant_type || grant_type !== Constants.AUTHORIZATION_CODE) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "Invalid grant_type parameter");
	}

	if (!isValidUUID(code)) {
		throw new AppError(HttpCodesEnum.UNAUTHORIZED, "AuthorizationCode must be a valid uuid");
	}

	return { grant_type, code, redirectUri };
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
