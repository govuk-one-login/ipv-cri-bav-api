import { PersonIdentityName } from "../models/PersonIdentityItem";

export const getNameByType = (name: PersonIdentityName[], targetType?: string): string => {
	const nameParts = name[0]?.nameParts
	  .filter((part) => !targetType || part.type === targetType) // Filter if targetType is provided
	  .reduce((nameArray: string[], { value }) => {
			nameArray.push(value);
			return nameArray;
	  }, []) || [];
	console.log(nameParts.join(" "));
	return nameParts.join(" ");
};
