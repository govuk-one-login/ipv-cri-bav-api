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

// describe('eventToSubjectIdentifier', () => {
//   let jwtAdapter: KmsJwtAdapter;
//   let event: APIGatewayProxyEvent;
//   beforeEach(() => {
//     jwtAdapter = new KmsJwtAdapter(); // or your mock instance
//     event = { headers: {} } as APIGatewayProxyEvent; // Create a base mock event
//   });
//   it('throws unauthorized error when authorization header is missing', async () => {
//     await expect(eventToSubjectIdentifier(jwtAdapter, event)).rejects.toThrow(AppError);
//   });
//   it('throws unauthorized error when authorization header does not start with Bearer', async () => {
//     event.headers.Authorization = 'Basic token';
//     await expect(eventToSubjectIdentifier(jwtAdapter, event)).rejects.toThrow(AppError);
//   });
//   // Add more tests here for different error cases
//   it('returns the subject identifier when JWT is valid', async () => {
//     event.headers.Authorization = 'Bearer valid.token.here';
//     // Mock the jwtAdapter.verify and decode functions to return true and a valid payload respectively
//     const sub = await eventToSubjectIdentifier(jwtAdapter, event);
//     expect(sub).toBeDefined();
//   });
//   // You should also test edge cases like an expired token, or a token without a 'sub' claim
// });
