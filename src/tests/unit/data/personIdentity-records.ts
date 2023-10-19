import { SharedClaimsPersonIdentity } from "../../../models/PersonIdentityItem";

export const personIdentityInputRecord: SharedClaimsPersonIdentity = {
	sessionId: "1234",
	name: [{
		nameParts: [
			{
				type: "givenName",
				value: "Frederick",
			},
			{
				type: "familyName",
				value: "Flintstone",
			},
		],
	}],
	birthDate: [{
		value: "1900-01-01",
	}],
};

export const personIdentityOutputRecord = {
	birthDate: [{
		value: "1900-01-01",
	}],
	name: [{
		nameParts: [
			{
				type: "givenName",
				value: "Frederick",
			},
			{
				type: "familyName",
				value: "Flintstone",
			},
		],
	}],
};
