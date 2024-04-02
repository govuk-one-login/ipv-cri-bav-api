import {lambdaHandler, logger} from "../../AthenaQueryHandler";
import {APIGatewayProxyEvent} from "aws-lambda";
import {mockClient} from "aws-sdk-client-mock";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
  StartQueryExecutionCommand
} from "@aws-sdk/client-athena";
import 'aws-sdk-client-mock-jest';

const athenaMock = mockClient(AthenaClient);

jest.mock("@aws-lambda-powertools/logger", () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setPersistentLogAttributes: jest.fn(),
    addContext: jest.fn(),
  })),
}));

jest.mock("@aws-lambda-powertools/metrics", () => ({
  Metrics: jest.fn().mockImplementation(() => ({
    logMetrics: jest.fn(),
  }))
}))

describe("AthenaQueryHandler", () => {

  const lambdaProxyEvent = {
    queryStringParameters: {
      "min-timestamp": "1234",
      "name-prefix": "ABCD",
    },
  };

  beforeEach(() => {
    athenaMock.reset();
  })

  const context = {};

  it("should return an empty list if no rows are found", async () => {

    // ARRANGE
    athenaMock.on(StartQueryExecutionCommand).resolves({
      QueryExecutionId: "1234",
    })
    athenaMock.on(GetQueryExecutionCommand).resolves({
      QueryExecution: {
        Status: {
          State: QueryExecutionState.SUCCEEDED,
        },
      },
    });
    athenaMock.on(GetQueryResultsCommand).resolves({
      ResultSet: {
        Rows: [],
      },
    });

    // ACT
    const result = await lambdaHandler(lambdaProxyEvent as unknown as APIGatewayProxyEvent, context);

    // ASSERT
    expect(result).toEqual({
      body: JSON.stringify([]),
      statusCode: 200,
    });

  })

  it("should pass the query parameters in to the constructed SQL query", async () => {

    // ARRANGE
    athenaMock.on(StartQueryExecutionCommand).resolves({
      QueryExecutionId: "1234",
    })
    athenaMock.on(GetQueryExecutionCommand).resolves({
      QueryExecution: {
        Status: {
          State: QueryExecutionState.SUCCEEDED,
        },
      },
    });
    athenaMock.on(GetQueryResultsCommand).resolves({
      ResultSet: {
        Rows: [],
      },
    });

    // ACT
    await lambdaHandler(lambdaProxyEvent as unknown as APIGatewayProxyEvent, context);

    // ASSERT
    expect(athenaMock).toHaveReceivedCommandWith(StartQueryExecutionCommand, {
      ExecutionParameters: [
        "1234",
        "ABCD%",
      ]
    })

  })

  it("should return a result set", async () => {

    // ARRANGE
    athenaMock.on(StartQueryExecutionCommand).resolves({
      QueryExecutionId: "1234",
    })
    athenaMock.on(GetQueryExecutionCommand).resolves({
      QueryExecution: {
        Status: {
          State: QueryExecutionState.SUCCEEDED,
        },
      },
    });
    // [{"Data":[{"VarCharValue":"itemnumber"}]},{"Data":[{"VarCharValue":"2853f0c6-082b-4020-8d60-7f713d7a3baa"}]}]
    athenaMock.on(GetQueryResultsCommand).resolves({
      ResultSet: {
        Rows: [
          {
            Data: [
              {
                VarCharValue: "itemnumber",
              }
            ]
          },
          {
            Data: [
              {
                VarCharValue: "12345678-1234-1234-1234-123456789012",
              }
            ]
          }
        ],
      },
    });

    // ACT
    const result = await lambdaHandler(lambdaProxyEvent as unknown as APIGatewayProxyEvent, context);

    // ASSERT
    expect(JSON.parse(result.body)).toEqual([
        {
          itemnumber: "12345678-1234-1234-1234-123456789012",
        }
    ]);
    expect(result.statusCode).toEqual(200);
  })

  // it("should wait until the query has finished running")
  // it("should return 500 if the query is cancelled")
  // it("should return 500 if the query failed")
  // it("should return 500 if an unknown query state is encountered")
})
