#!/bin/bash

# Wait for Dependencies Script
# Ensures required services are available before starting this service

set -e

SERVICE_NAME=${SERVICE_NAME:-"unknown-service"}
DEPENDENCIES=${DEPENDENCIES:-""}

echo "🚀 Starting dependency check for ${SERVICE_NAME}"

if [ -z "$DEPENDENCIES" ]; then
    echo "✅ No dependencies specified for ${SERVICE_NAME}"
    exit 0
fi

echo "📋 Dependencies to check: $DEPENDENCIES"

# Function to wait for a single service
wait_for_service() {
    local service_host=$1
    local service_port=$2
    local service_name=$3
    local max_attempts=60
    local attempt=1
    
    echo "⏳ Waiting for ${service_name} at ${service_host}:${service_port}..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z "$service_host" "$service_port" 2>/dev/null; then
            echo "✅ ${service_name} is ready"
            return 0
        fi
        
        echo "🔄 Attempt $attempt/$max_attempts: ${service_name} not ready yet..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ ${service_name} is not available after $max_attempts attempts"
    return 1
}

# Parse and check each dependency
IFS=',' read -ra DEPS <<< "$DEPENDENCIES"
for dep in "${DEPS[@]}"; do
    IFS=':' read -ra SERVICE_INFO <<< "$dep"
    host=${SERVICE_INFO[0]}
    port=${SERVICE_INFO[1]}
    name=${SERVICE_INFO[2]:-$host}
    
    wait_for_service "$host" "$port" "$name"
done

echo "🎉 All dependencies are ready for ${SERVICE_NAME}"
echo "🚀 Starting ${SERVICE_NAME}..."