import { getFullName } from "../../../utils/PersonIdentityUtils";

describe("PersonIdentityUtils", () => {
	describe("#getFullName", () => {
		it("returns full name", () => {
			const result = getFullName([{ nameParts: [
				{ type: "GivenName", value: "First" },
				{ type: "GivenName", value: "Middle" },
				{ type: "FamilyName", value: "Last" },
			] }]);
			expect(result).toBe("First Middle Last");
		});
	});
});
