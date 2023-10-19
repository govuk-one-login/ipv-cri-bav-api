import { isValidStrings, isPersonNameValid } from "../../../utils/Validations";

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
});
