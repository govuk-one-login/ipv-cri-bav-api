import { Row } from "@aws-sdk/client-athena";

export function convertAthenaResultsToListOfRecords(
	data: Row[]
): Record<string, string>[] {
	if (data.length === 0) {
		return [];
	}
	const mappedData: Record<string, string>[] = [];
	const columns: string[] = data[0].Data!.map((column) => {
    return column.VarCharValue ?? "";
	});
	data.forEach((item, i) => {
		if (i === 0) {
			return;
		}
		const mappedObject: Record<string, string> = {};
		item.Data?.forEach((value, i) => {
			mappedObject[columns[i]] = value.VarCharValue ?? "";
		});
		mappedData.push(mappedObject);
	});
	return mappedData;
}
