import { randomUUID } from "crypto";
import { isValidStrings, isPersonNameValid, isValidUUID, eventToSubjectIdentifier } from "../../../utils/Validations";
import { KmsJwtAdapter } from "../../../utils/KmsJwtAdapter";
import { APIGatewayProxyEvent } from "aws-lambda";
import { AppError } from "../../../utils/AppError";
import { HttpCodesEnum } from "../../../models/enums/HttpCodesEnum";
import { absoluteTimeNow } from "../../../utils/DateTimeUtils";
import { MockKmsJwtAdapter } from "./MockJwtVerifierSigner";

jest.mock("../../../utils/KmsJwtAdapter");
const passingKmsJwtAdapterFactory = (_signingKeys: string) => new MockKmsJwtAdapter(true);
const failingKmsJwtAdapterFactory = (_signingKeys: string) => new MockKmsJwtAdapter(false);

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
});
