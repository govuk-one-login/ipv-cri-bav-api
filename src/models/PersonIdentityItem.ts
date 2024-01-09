export interface PersonIdentityNamePart {
	type: string;
	value: string;
}

export interface PersonIdentityName {
	nameParts: PersonIdentityNamePart[];
}


export interface PersonIdentityItem {
	sessionId: string;
	name: PersonIdentityName[];
	expiryDate: number;
	createdDate: number;
	sortCode?: string;
	accountNumber?: string;
}

export interface SharedClaimsPersonIdentity {
	sessionId: string;
	name: PersonIdentityName[];
}
