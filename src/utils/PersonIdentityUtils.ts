import { PersonIdentityName } from "../models/PersonIdentityItem";

export const getFullName = (name: PersonIdentityName[]): string => {
	const nameParts = name[0].nameParts.reduce((nameArray: string[], { value }) => {
		nameArray.push(value);
		return nameArray;
	}, []);
	return nameParts.join(" ");
};
