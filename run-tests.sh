#!/usr/bin/env bash

set -eu

remove_quotes () {
  echo "$1" | tr -d '"'
}

declare error_code
# shellcheck disable=SC2154
# The CFN variables seem to include quotes when used in tests these must be removed before assigning them.
CFN_BAVBackendURL_NoQuotes=$(remove_quotes "$CFN_BAVBackendURL")
export DEV_CRI_BAV_API_URL=$(echo ${CFN_BAVBackendURL_NoQuotes%/})
export DEV_IPV_BAV_STUB_URL=$(remove_quotes $CFN_BAVIPVStubExecuteURL)
export DEV_BAV_TEST_HARNESS_URL=$(remove_quotes "$CFN_BAVTestHarnessURL")
export DEV_BAV_SESSION_TABLE_NAME=$(remove_quotes "$CFN_SessionTableName")
export DEV_BAV_PERSONAL_IDENTITY_TABLE_NAME=$(remove_quotes "$CFN_PersonIdentityTableName")
export VC_SIGNING_KEY_ID=$(remove_quotes "$CFN_VcSigningKeyId")
export DNS_SUFFIX=$(remove_quotes "$CFN_DNSSuffix")

# disabling error_check to allow report generation for successful + failed tests
set +e
cd /src; npm run test:api 
error_code=$?
cp -rf results $TEST_REPORT_ABSOLUTE_DIR
if [ $error_code -ne 0 ]
then
  exit $error_code
fi

sleep 2m

set -e
apt-get install jq -y
cd /src; npm run test:pii
error_code=$?

exit $error_code
