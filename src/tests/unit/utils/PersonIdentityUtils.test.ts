import { getFirstName, getMiddleNames, getLastName, getFullName } from "../../../utils/PersonIdentityUtils";

describe("PersonIdentityUtils", () => {

	it("returns all full name", () => {
		const result = getFullName([{ nameParts: [
			{ type: "GivenName", value: "First" },
			{ type: "GivenName", value: "Middle" },
			{ type: "FamilyName", value: "Last" },
		] }]);
		expect(result).toBe("First Middle Last");
	});

	it("returns first name", () => {
		const result = getFirstName([{ nameParts: [
			{ type: "GivenName", value: "First" },
			{ type: "GivenName", value: "Middle" },
			{ type: "FamilyName", value: "Last" },
		] }]);
		expect(result).toBe("First");
	});

	it("returns middle names", () => {
		const result = getMiddleNames([{ nameParts: [
			{ type: "GivenName", value: "First" },
			{ type: "GivenName", value: "MiddleOne" },
			{ type: "GivenName", value: "MiddleTwo" },
			{ type: "FamilyName", value: "Last" },
		] }]);
		expect(result).toBe("MiddleOne MiddleTwo");
	});

	it("returns last name", () => {
		const result = getLastName([{ nameParts: [
			{ type: "GivenName", value: "First" },
			{ type: "GivenName", value: "MiddleOne" },
			{ type: "GivenName", value: "MiddleTwo" },
			{ type: "FamilyName", value: "Last" },
		] }]);
		expect(result).toBe("Last");
	});

});
