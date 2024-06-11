import {lambdaHandler} from "../../AthenaQueryHandler";
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

  const athenaGetQueryResultsMockResponse = {
    ResultSet: {
      Rows: [
        {
          Data: [
            {
              VarCharValue: "itemnumber",
            },
          ],
        },
        {
          Data: [
            {
              VarCharValue: "12345678-1234-1234-1234-123456789012",
            },
          ],
        },
      ],
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
    athenaMock.on(GetQueryResultsCommand).resolves(athenaGetQueryResultsMockResponse);

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

  it("should wait until the query has finished running", async () => {

    // ARRANGE
    athenaMock.on(StartQueryExecutionCommand).resolves({
      QueryExecutionId: "1234",
    })
    athenaMock
      .on(GetQueryExecutionCommand)
      .resolvesOnce({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.QUEUED,
          },
        },
      })
      .resolvesOnce({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.RUNNING,
          },
        },
      })
      .resolves({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.SUCCEEDED,
          },
        },
      });
    athenaMock.on(GetQueryResultsCommand).resolves(athenaGetQueryResultsMockResponse);

    // ACT
    const result = await lambdaHandler(lambdaProxyEvent as unknown as APIGatewayProxyEvent, context);

    // ASSERT
    expect(result.statusCode).toEqual(200);
    expect(athenaMock).toHaveReceivedCommandTimes(GetQueryExecutionCommand, 3);

  });

  it("should return 500 if the query is cancelled", async () => {

    // ARRANGE
    athenaMock.on(StartQueryExecutionCommand).resolves({
      QueryExecutionId: "1234",
    })
    athenaMock
      .on(GetQueryExecutionCommand)
      .resolvesOnce({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.QUEUED,
          },
        },
      })
      .resolves({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.CANCELLED,
          },
        },
      });

    // ACT
    const result = await lambdaHandler(lambdaProxyEvent as unknown as APIGatewayProxyEvent, context);

    // ASSERT
    expect(result.statusCode).toEqual(500);

  });

  it("should return 500 if the query failed", async () => {

    // ARRANGE
    athenaMock.on(StartQueryExecutionCommand).resolves({
      QueryExecutionId: "1234",
    })
    athenaMock
      .on(GetQueryExecutionCommand)
      .resolvesOnce({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.QUEUED,
          },
        },
      })
      .resolves({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.FAILED,
          },
        },
      });

    // ACT
    const result = await lambdaHandler(lambdaProxyEvent as unknown as APIGatewayProxyEvent, context);

    // ASSERT
    expect(result.statusCode).toEqual(500);

  });

  it("should return 500 if an unknown query state is encountered", async () => {

    // ARRANGE
    athenaMock.on(StartQueryExecutionCommand).resolves({
      QueryExecutionId: "1234",
    })
    athenaMock
      .on(GetQueryExecutionCommand)
      .resolvesOnce({
        QueryExecution: {
          Status: {
            State: QueryExecutionState.QUEUED,
          },
        },
      })
      .resolves({
        QueryExecution: {
          Status: {
            // @ts-ignore
            State: "UNKNOWN_STATE",
          },
        },
      });

    // ACT
    const result = await lambdaHandler(lambdaProxyEvent as unknown as APIGatewayProxyEvent, context);

    // ASSERT
    expect(result.statusCode).toEqual(500);

  })

})
