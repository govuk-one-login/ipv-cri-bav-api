import { getNameByType } from "../../../utils/PersonIdentityUtils";

describe("PersonIdentityUtils", () => {
	describe("#getNameByType", () => {
		it("returns all full name if no name type provided", () => {
			const result = getNameByType([{ nameParts: [
				{ type: "GivenName", value: "First" },
				{ type: "GivenName", value: "Middle" },
				{ type: "FamilyName", value: "Last" },
			] }]);
			expect(result).toBe("First Middle Last");
		});

		it("returns name based on type - GivenName", () => {
			const result = getNameByType([{ nameParts: [
				{ type: "GivenName", value: "First" },
				{ type: "GivenName", value: "Middle" },
				{ type: "FamilyName", value: "Last" },
			] }], "GivenName");
			expect(result).toBe("First Middle");
		});

		it("returns name based on type - FamilyName", () => {
			const result = getNameByType([{ nameParts: [
				{ type: "GivenName", value: "First" },
				{ type: "GivenName", value: "Middle" },
				{ type: "FamilyName", value: "Last" },
			] }], "FamilyName");
			expect(result).toBe("Last");
		});

	});
});
