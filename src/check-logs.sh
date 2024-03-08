#!/usr/bin/env bash

test_data="./tests/data/exampleStubPayload.json"
firstName=$(jq -r '.shared_claims.name[0].nameParts[0].value' "$test_data")
lastName=$(jq -r '.shared_claims.name[0].nameParts[1].value' "$test_data")

query="fields @timestamp, @message, @logStream, @log | filter @message like \"$firstName\" or @message like \"$lastName\" or @message like \"123456\" or @message like \"00111111\""
echo $query

stack_name="bav-cri-api"
log_groups=(
    "/aws/lambda/BAV-Authorization-$stack_name"
    "/aws/lambda/BAV-person-info-$stack_name"
    "/aws/lambda/Access-Token-$stack_name"
    "/aws/lambda/BAV-Session-$stack_name"
    "/aws/lambda/BAV-verify-account-$stack_name"
    "/aws/lambda/BAV-Abort-$stack_name"
    "/aws/lambda/BAV-UserInfo-$stack_name"
)

current_epoch=$(date +%s)
fifteen_mins_ago_epoch=$((current_epoch - (15 * 60)))

start_time=$fifteen_mins_ago_epoch
end_time=$current_epoch

query_id=$(aws logs start-query \
    --log-group-names "${log_groups[@]}" \
    --start-time "$start_time" \
    --end-time "$end_time" \
    --query-string "$query" \
    --output text --query 'queryId')

status="Running"
while [ "$status" = "Running" ]; do
    echo "Waiting for query to complete..."
    sleep 1
    query_status=$(aws logs get-query-results --query-id "$query_id")
    status=$(echo "$query_status" | grep -o '"status": "[^"]*"' | cut -d '"' -f 4)
done

if echo "$query_status" | grep -q '"results": \[\]'; then
    echo "Query found no PII 🎉"
    exit 0
else
    echo "Query returned results:"
    echo "$query_status" | jq -r '.results[] | @json'
    exit 1
fi