import { convertAthenaResultsToListOfRecords } from "../../../utils/ConvertAthenaResultToListOfRecords";
import { Row } from "@aws-sdk/client-athena";

const mockAthenaOutputTwoColumns: Row[] = [
  {
    Data: [
      {
        VarCharValue: "column1",
      },
      {
        VarCharValue: "column2",
      },
    ],
  },
  {
    Data: [
      {
        VarCharValue: "value1",
      },
      {
        VarCharValue: "value2",
      },
    ],
  },
];
const mockAthenaOutputOneColumn: Row[] = [
  {
    Data: [
      {
        VarCharValue: "column1",
      },
    ],
  },
  {
    Data: [
      {
        VarCharValue: "value1",
      },
    ],
  },
];

describe("ConvertAthenaResultsToListOfMaps", () => {
  it("should return an empty list", async () => {
    expect(convertAthenaResultsToListOfRecords([])).toEqual([]);
  });

  it("should convert a two-column result set to a list of records", async () => {
    expect(
			convertAthenaResultsToListOfRecords(mockAthenaOutputTwoColumns)
    ).toEqual([
      {
				column1: "value1",
				column2: "value2",
			},
		]);
  });

  it("should convert a one-column result set to a list of records", async () => {
    expect(
			convertAthenaResultsToListOfRecords(mockAthenaOutputOneColumn)
    ).toEqual([
			{
				column1: "value1",
			},
		]);
  });
});
