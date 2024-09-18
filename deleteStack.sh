#!/bin/bash

export AWS_REGION=eu-west-2

# Check if stack names are provided
if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <stack-name-1> <stack-name-2> ... <stack-name-n>"
  exit 1
fi

# Function to delete a CloudFormation stack and its S3 buckets
delete_stack() {
  local STACK_NAME=$1
  local LOG_FILE="delete_${STACK_NAME}.log"

  echo "Processing stack: $STACK_NAME" | tee -a $LOG_FILE

  # Query CloudFormation stack for all resources
  echo "Querying CloudFormation stack for resources..." | tee -a $LOG_FILE
  RESOURCES=$(aws cloudformation describe-stack-resources --stack-name $STACK_NAME --query "StackResources[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" --output text)

  # Check if there are any S3 buckets
  if [ -z "$RESOURCES" ]; then
    echo "No S3 buckets found in the stack." | tee -a $LOG_FILE
  else
    # Loop through each S3 bucket and delete it
    for BUCKET in $RESOURCES; do
      echo "Deleting S3 bucket: $BUCKET" | tee -a $LOG_FILE
      ./deleteBucket.sh $BUCKET | tee -a $LOG_FILE
      if [ $? -ne 0 ]; then
        echo "Failed to delete bucket: $BUCKET" | tee -a $LOG_FILE
        return 1
      fi
      echo "Successfully deleted bucket: $BUCKET" | tee -a $LOG_FILE
    done
  fi

  # Delete the CloudFormation stack
  echo "Deleting CloudFormation stack: $STACK_NAME" | tee -a $LOG_FILE
  aws cloudformation delete-stack --stack-name $STACK_NAME | tee -a $LOG_FILE

  # Wait for the stack to be deleted
  echo "Waiting for stack to be deleted..." | tee -a $LOG_FILE
  aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME | tee -a $LOG_FILE

  if [ $? -eq 0 ]; then
    echo "Successfully deleted CloudFormation stack: $STACK_NAME" | tee -a $LOG_FILE
  else
    echo "Failed to delete CloudFormation stack: $STACK_NAME" | tee -a $LOG_FILE
    return 1
  fi
}

# Export the function to be used by parallel
export -f delete_stack

# Run the delete_stack function in parallel for all provided stack names
echo "Starting deletion of CloudFormation stacks in parallel..."

# Start the parallel deletion and background the tailing of log files
parallel -j 0 delete_stack ::: "$@" &

# Tail the log files for each stack name provided
for STACK_NAME in "$@"; do
  LOG_FILE="delete_${STACK_NAME}.log"
  tail -f $LOG_FILE &
done

# Wait for all parallel deletions to complete
wait

if [ $? -eq 0 ]; then
  echo "Successfully deleted all specified CloudFormation stacks."
else
  echo "Failed to delete one or more CloudFormation stacks."
  exit 1
fi
