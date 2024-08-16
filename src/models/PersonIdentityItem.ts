export interface PersonIdentityNamePart {
	type: string;
	value: string;
}

export interface PersonIdentityName {
	nameParts: PersonIdentityNamePart[];
}

export interface PersonIdentityBirthDate {
	value: string;
}


export interface PersonIdentityItem {
	sessionId: string;
	name: PersonIdentityName[];
	birthDate?: PersonIdentityBirthDate[];
	expiryDate: number;
	createdDate: number;
	sortCode?: string;
	accountNumber?: string;
}

export interface SharedClaimsPersonIdentity {
	sessionId: string;
	name: PersonIdentityName[];
	birthDate: PersonIdentityBirthDate[];
}
