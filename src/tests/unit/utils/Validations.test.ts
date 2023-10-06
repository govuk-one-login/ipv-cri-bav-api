import { isValidStrings, isPersonDetailsValid } from "../../../utils/Validations";

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

	describe("#isPersonDetailsValid", () => {
		it("returns error message if email is not provided", () => {
			const result = isPersonDetailsValid("", [{ nameParts: [{ type: "GivenName", value: "Test" }, { type: "FamilyName", value: "Testing" }] }]);
			expect(result).toBe("Missing emailAddress");
		});

		it("returns error message if given name is not valid", () => {
			const result = isPersonDetailsValid("test@est.com", [{ nameParts: [{ type: "FamilyName", value: "Testing" }] }]);
			expect(result).toBe("Missing person's GivenName or FamilyName");
		});

		it("returns error message if family name is not valid", () => {
			const result = isPersonDetailsValid("test@est.com", [{ nameParts: [{ type: "GivenName", value: "Test" }] }]);
			expect(result).toBe("Missing person's GivenName or FamilyName");
		});

		it("returns empty string if personal details are valid", () => {
			const result = isPersonDetailsValid("test@est.com", [{ nameParts: [{ type: "GivenName", value: "Test" }, { type: "FamilyName", value: "Testing" }] }]);
			expect(result).toBe("");
		});
	});
});
