import { HttpCodesEnum } from "../models/enums/HttpCodesEnum";

export const SECURITY_HEADERS = {
	"Cache-Control": "no-store",
	"Content-Type": "application/json",
	"Strict-Transport-Security": "max-age=31536000",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
};

export const Response = (
	statusCode: number,
	body: string,
	headers?: { [header: string]: boolean | number | string } | undefined,
	multiValueHeaders?: { [header: string]: Array<boolean | number | string> } | undefined,
) => {
	return {
		statusCode,
		headers: SECURITY_HEADERS,
		body,
	};
};


export const GenericServerError = {
	statusCode: HttpCodesEnum.SERVER_ERROR,
	headers: SECURITY_HEADERS,
	body: "Internal server error",
};

export const UnauthorizedResponse = {
	statusCode: HttpCodesEnum.UNAUTHORIZED,
	headers: SECURITY_HEADERS,
	body: "Unauthorized",
};
