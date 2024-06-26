
# CloudFormation Stack and S3 Bucket Deletion Scripts

## Overview

This repository contains two Bash scripts, `deleteStack.sh` and `deleteBucket.sh`, designed to delete AWS CloudFormation stacks and their associated S3 buckets. The `deleteStack.sh` script handles the deletion of CloudFormation stacks and calls `deleteBucket.sh` to manage the deletion of any S3 buckets associated with the stacks.

## Scripts

### deleteStack.sh

This script deletes specified CloudFormation stacks and their associated S3 buckets.

#### Usage

```bash
./deleteStack.sh <stack-name-1> <stack-name-2> ... <stack-name-n>
```

#### Description

1. **Environment Configuration:**
   - Sets the AWS region to `eu-west-2`.

2. **Argument Checking:**
   - Ensures that stack names are provided as arguments.

3. **delete_stack Function:**
   - Queries the CloudFormation stack for S3 bucket resources.
   - Deletes the S3 buckets by calling `deleteBucket.sh`.
   - Deletes the CloudFormation stack and waits for the deletion to complete.

4. **Parallel Execution:**
   - Deletes the specified stacks in parallel using the `parallel` command.
   - Tails the log files for each stack to provide real-time updates.

5. **Logging:**
   - Logs are stored in the `logs` directory, with individual logs for each stack deletion.

### deleteBucket.sh

This script finds, empties, and deletes S3 buckets with a specified prefix.

#### Usage

```bash
./deleteBucket.sh bucketPrefix
```

#### Description

1. **Environment Configuration:**
   - Sets the AWS region to `eu-west-2`.

2. **Directory Setup:**
   - Creates a `logs` directory to store log files.

3. **find_buckets_with_prefix Function:**
   - Finds S3 buckets with the specified prefix.

4. **empty_bucket Function:**
   - Empties the specified S3 bucket by deleting all objects, including versioned objects and delete markers.

5. **delete_bucket Function:**
   - Deletes the specified S3 bucket.

6. **find_empty_delete_buckets Function:**
   - Finds, empties, and deletes S3 buckets with the specified prefix.
   - Logs are stored in the `logs` directory with a log file for each prefix.

## Logging

Both scripts generate log files stored in the `logs` directory:
- `deleteStack.sh` logs are named `delete_<stack-name>.log`.
- `deleteBucket.sh` logs are named `<bucketPrefix>.log`.

## Requirements

- AWS CLI
- jq
- GNU parallel

## Notes

- Ensure you have the necessary AWS permissions to delete CloudFormation stacks and S3 buckets.
- NEVER. run them in any env other than dev


