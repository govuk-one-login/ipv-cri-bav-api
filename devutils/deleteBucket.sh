#!/bin/bash

export AWS_REGION=eu-west-2

# Create a directory for logs
mkdir -p logs

# Function to find buckets with a specific prefix
find_buckets_with_prefix() {
    local prefix=$1
    aws s3api list-buckets --query "Buckets[?starts_with(Name, '$prefix')].Name" --output text
}

# Function to empty a bucket, including versioned objects and delete markers
empty_bucket() {
    local bucket_name=$1
    echo "Emptying bucket $bucket_name..."

    # Delete all versioned objects
    while true; do
        object_versions=$(aws s3api list-object-versions --bucket "$bucket_name" --query 'Versions[].{Key: Key, VersionId: VersionId}' --output json)
        num_object_versions=$(echo "$object_versions" | jq length)
        if [ "$num_object_versions" -eq 0 ]; then
            break
        fi
        echo "Found $num_object_versions object versions in bucket $bucket_name"

        for version in $(echo "$object_versions" | jq -c '.[]'); do
            key=$(echo "$version" | jq -r '.Key')
            version_id=$(echo "$version" | jq -r '.VersionId')
            if [ -n "$version_id" ] && [ "$version_id" != "null" ]; then
                echo "Deleting object $key version $version_id from bucket $bucket_name"
                aws s3api delete-object --bucket "$bucket_name" --key "$key" --version-id "$version_id"
            fi
        done
    done

    # Delete all delete markers
    while true; do
        delete_markers=$(aws s3api list-object-versions --bucket "$bucket_name" --query 'DeleteMarkers[].{Key: Key, VersionId: VersionId}' --output json)
        num_delete_markers=$(echo "$delete_markers" | jq length)
        if [ "$num_delete_markers" -eq 0 ]; then
            break
        fi
        echo "Found $num_delete_markers delete markers in bucket $bucket_name"

        for marker in $(echo "$delete_markers" | jq -c '.[]'); do
            key=$(echo "$marker" | jq -r '.Key')
            version_id=$(echo "$marker" | jq -r '.VersionId')
            if [ -n "$version_id" ] && [ "$version_id" != "null" ]; then
                echo "Deleting delete marker $key version $version_id from bucket $bucket_name"
                aws s3api delete-object --bucket "$bucket_name" --key "$key" --version-id "$version_id"
            fi
        done
    done

    echo "Bucket $bucket_name emptied."
}

# Function to delete a bucket
delete_bucket() {
    local bucket_name=$1
    echo "Deleting bucket $bucket_name..."
    aws s3 rb s3://"$bucket_name" --force
    echo "Bucket $bucket_name deleted."
}

# Function to find, empty, and delete buckets with a specific prefix
find_empty_delete_buckets() {
    local prefix=$1
    echo "Processing prefix: $prefix"
    buckets=$(find_buckets_with_prefix "$prefix")
    echo "Buckets found for prefix $prefix: $buckets"
    for bucket in $buckets; do
        echo "Starting empty and delete for bucket: $bucket"
        empty_bucket "$bucket"
        delete_bucket "$bucket"
        echo "Finished empty and delete for bucket: $bucket"
    done
}

export -f find_buckets_with_prefix
export -f empty_bucket
export -f delete_bucket
export -f find_empty_delete_buckets

# Script to call with a bucketPrefix parameter
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 bucketPrefix"
    exit 1
fi

bucketPrefix=$1
find_empty_delete_buckets "$bucketPrefix" 2>&1 | tee logs/"$bucketPrefix".log
