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
};

export const personIdentityOutputRecord = {
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
