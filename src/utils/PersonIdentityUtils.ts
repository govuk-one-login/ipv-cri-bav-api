import { PersonIdentityName } from "../models/PersonIdentityItem";

export const getFirstName = (name: PersonIdentityName[]): string => {
	return name[0]?.nameParts[0].value;
};

export const getMiddleNames = (name: PersonIdentityName[]): string => {
	const nameParts = name[0]?.nameParts
	  .filter((part) => part.type === "GivenName")
	  .slice(1)
	  .reduce((nameArray: string[], { value }) => {
			nameArray.push(value);
			return nameArray;
	  }, []) || [];
	return nameParts.join(" ");
};

export const getLastName = (name: PersonIdentityName[]): string => {
	const nameParts = name[0]?.nameParts
	  .filter((part) => part.type === "FamilyName")
	  .reduce((nameArray: string[], { value }) => {
			nameArray.push(value);
			return nameArray;
	  }, []) || [];
	return nameParts.join(" ");
};

export const getFullName = (name: PersonIdentityName[]): string => {
	const nameParts = name[0]?.nameParts
	  .reduce((nameArray: string[], { value }) => {
			nameArray.push(value);
			return nameArray;
	  }, []) || [];
	return nameParts.join(" ");
};
