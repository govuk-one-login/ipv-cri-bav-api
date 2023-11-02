import { Constants } from "../../../utils/Constants";

export const VALID_VC = {
	"sub": "sub",
	"nbf": 1699302815,
	"iss": "https://review-bav.dev.account.gov.uk",
	"iat": 1699302815,
	"jti": "jti",
	"vc": {
		"@context": [
			Constants.W3_BASE_CONTEXT,
			Constants.DI_CONTEXT,
		],
		"type": [
			Constants.VERIFIABLE_CREDENTIAL,
			Constants.IDENTITY_CHECK_CREDENTIAL,
		],
		"credentialSubject": {
			"name": [
				{
					"nameParts": [
						{
							"type": "GivenName",
							"value": "FRED",
						},
						{
							"type": "GivenName",
							"value": "NICK",
						},
						{
							"type": "FamilyName",
							"value": "Flintstone",
						},
					],
				},
			],
			"bankAccount": [
				{
					"sortCode": "111111",
					"accountNumber": "10199283",
				},
			],
		},
		"evidence": [
			{
				"type": "IdentityCheck",
				"txn": "txn",
				"strengthScore": 3,
				"validityScore": 2,
				"checkDetails": [
					{
						"checkMethod": "data",
						"identityCheckPolicy": "none",
					},
				],
			},
		],
	},
}
;
