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
	birthDate: [
		{
		  value: "1960-02-02",
		},
	  ],
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
