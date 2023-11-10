/* eslint-disable max-lines-per-function */
import { randomUUID } from "crypto";
import { isValidStrings, isPersonNameValid, isValidUUID, getSessionIdHeaderErrors } from "../../../utils/Validations";
import { Constants } from "../../../utils/Constants";

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

	describe("#getSessionIdHeaderErrors", () => {
		it("returns error if headers are empty", () => {
			const result = getSessionIdHeaderErrors(null);
			expect(result).toBe("Empty headers");
		});

		it("returns error if session ID header isn't present", () => {
			const result = getSessionIdHeaderErrors({ "content-type": "application/json" });
			expect(result).toBe(`Missing header: ${Constants.SESSION_ID} is required`);
		});

		it("returns error if session ID header isn't a valid is", () => {
			const result = getSessionIdHeaderErrors({ [Constants.SESSION_ID]: "abc" });
			expect(result).toBe(`${Constants.SESSION_ID} header does not contain a valid uuid`);
		});

		it("returns undefined if session ID header if valid", () => {
			const result = getSessionIdHeaderErrors({ [Constants.SESSION_ID]: "732075c8-08e6-4b25-ad5b-d6cb865a18e5" });
			expect(result).toBeUndefined();
		});
	});
});
