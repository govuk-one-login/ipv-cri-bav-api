 
import { randomUUID } from "crypto";
import { isValidStrings, isPersonNameValid, isValidUUID, eventToSubjectIdentifier, getSessionIdHeaderErrors } from "../../../utils/Validations";
import { KmsJwtAdapter } from "../../../utils/KmsJwtAdapter";
import { AppError } from "../../../utils/AppError";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { VALID_USERINFO, MISSING_AUTH_HEADER_USERINFO } from "../data/userInfo-events";
import { Constants } from "../../../utils/Constants";
import { Logger } from "@aws-lambda-powertools/logger";
import { mock } from "jest-mock-extended";

jest.mock("../../../utils/KmsJwtAdapter");
const logger = mock<Logger>();

describe("Validations", () => {
	describe("#isValidStrings", () => {
		it("returns true if all strings provided are valid", () => {
			const result = isValidStrings(["hi", "hello"]);
			expect(result).toBe(true);
		});

		it("returns true if any strings provided are valid", () => {
			const result = isValidStrings([undefined, "hello"]);
			expect(result).toBe(true);
		});

		it("returns false if all strings provided are valid", () => {
			const result = isValidStrings([undefined]);
			expect(result).toBe(false);
		});
	});

	describe("#isPersonNameValid", () => {
		it("returns true if given and family names are valid", () => {
			const result = isPersonNameValid([{ nameParts: [
				{ type: "GivenName", value: "Test" },
				{ type: "FamilyName", value: "Testing" },
			] }]);
			expect(result).toBe(true);
		});

		it("returns false if given name is missing", () => {
			const result = isPersonNameValid([{ nameParts: [
				{ type: "FamilyName", value: "Testing" },
			] }]);
			expect(result).toBe(false);
		});

		it("returns false if family name is missing", () => {
			const result = isPersonNameValid([{ nameParts: [
				{ type: "GivenName", value: "Test" },
			] }]);
			expect(result).toBe(false);
		});
	});

	describe("#isValidUUID", () => {
		it("returns true UUID is valid", () => {
			const result = isValidUUID(randomUUID());
			expect(result).toBe(true);
		});

		it("returns false if UUID is invalid", () => {
			const result = isValidUUID(randomUUID().slice(0, -1));
			expect(result).toBe(false);
		});
	});

	describe("#eventToSubjectIdentifier", () => {
		let jwtAdapter: KmsJwtAdapter;

		beforeEach(() => {
			jwtAdapter = new KmsJwtAdapter("keys", logger);
		});

		it("throws an error if Authorization header is missing", async () => {
			await expect(eventToSubjectIdentifier(jwtAdapter, MISSING_AUTH_HEADER_USERINFO))
				.rejects.toThrow(new AppError(HttpCodesEnum.UNAUTHORIZED, "Missing header: Authorization header value is missing or invalid auth_scheme"));
		});

		it("throws an error if Authorization header is not Bearer type", async () => {
			const invalidHeaderEvent = VALID_USERINFO;
			invalidHeaderEvent.headers.Authorization = "Basic abcdefg";
			await expect(eventToSubjectIdentifier(jwtAdapter, invalidHeaderEvent))
				.rejects.toThrow(new AppError(HttpCodesEnum.UNAUTHORIZED, "Missing header: Authorization header is not of Bearer type access_token"));
		});

		it("throws an error if JWT verification fails", async () => {
			const invalidHeaderEvent = VALID_USERINFO;
			invalidHeaderEvent.headers.Authorization = "Bearer invalid-token";
			jest.spyOn(jwtAdapter, "verify").mockResolvedValue(false);
			await expect(eventToSubjectIdentifier(jwtAdapter, invalidHeaderEvent))
				.rejects.toThrow(new AppError(HttpCodesEnum.UNAUTHORIZED, "Failed to verify signature"));
		});

		it("throws an error if JWT expiration is invalid or expired", async () => {
			jest.spyOn(jwtAdapter, "verify").mockResolvedValue(true);
			jest.spyOn(jwtAdapter, "decode").mockReturnValue({
				payload: {
					sub: "SESSIONID",
					exp: 123,
				},
				header: {
					alg: "ALG",
				},
				signature: "",
			});
			await expect(eventToSubjectIdentifier(jwtAdapter, VALID_USERINFO))
				.rejects.toThrow(new AppError(HttpCodesEnum.UNAUTHORIZED, "Verification of exp failed"));
		});

		it("throws an error if sub is missing in JWT", async () => {
			jest.spyOn(jwtAdapter, "verify").mockResolvedValue(true);
			jest.spyOn(jwtAdapter, "decode").mockReturnValue({
				payload: {
					exp: 2646908639,
				},
				header: {
					alg: "ALG",
				},
				signature: "",
			});
			await expect(eventToSubjectIdentifier(jwtAdapter, VALID_USERINFO))
				.rejects.toThrow(new AppError(HttpCodesEnum.UNAUTHORIZED, "sub missing"));
		});

		it("returns sub if JWT is valid", async () => {
			jest.spyOn(jwtAdapter, "verify").mockResolvedValue(true);
			jest.spyOn(jwtAdapter, "decode").mockReturnValue({
				payload: {
					sub: "SESSIONID",
					exp: 2646908639,
				},
				header: {
					alg: "ALG",
				},
				signature: "",
			});
			const result = await eventToSubjectIdentifier(jwtAdapter, VALID_USERINFO);
			expect(result).toBe("SESSIONID");
		});
	});

	describe("#getSessionIdHeaderErrors", () => {
		it("returns error if session ID header isn't present", () => {
			const result = getSessionIdHeaderErrors({ "content-type": "application/json" });
			expect(result).toBe(`Missing header: ${Constants.X_SESSION_ID} is required`);
		});

		it("returns error if session ID header isn't a valid is", () => {
			const result = getSessionIdHeaderErrors({ [Constants.X_SESSION_ID]: "abc" });
			expect(result).toBe(`${Constants.X_SESSION_ID} header does not contain a valid uuid`);
		});

		it("returns undefined if session ID header if valid", () => {
			const result = getSessionIdHeaderErrors({ [Constants.X_SESSION_ID]: "732075c8-08e6-4b25-ad5b-d6cb865a18e5" });
			expect(result).toBeUndefined();
		});
	});
});
