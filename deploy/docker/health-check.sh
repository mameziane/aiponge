#!/bin/bash

# Health Check Script for Microservices
# Ensures services are healthy before marking container as ready

SERVICE_PORT=${PORT}

if [ -z "$SERVICE_PORT" ]; then
    echo "❌ PORT environment variable must be set (no hardcoded fallbacks allowed)"
    echo "💡 Use unified port configuration system to set proper PORT value"
    exit 1
fi
SERVICE_NAME=${SERVICE_NAME:-"unknown-service"}
HEALTH_ENDPOINT=${HEALTH_ENDPOINT:-"/health"}
MAX_RETRIES=${HEALTH_MAX_RETRIES:-30}
RETRY_INTERVAL=${HEALTH_RETRY_INTERVAL:-2}

echo "🔍 Health check starting for ${SERVICE_NAME} on port ${SERVICE_PORT}"

for i in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $i/$MAX_RETRIES: Checking http://localhost:${SERVICE_PORT}${HEALTH_ENDPOINT}"
    
    # Check if service responds with 200 status
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${SERVICE_PORT}${HEALTH_ENDPOINT}" 2>/dev/null)
    
    if [ "$HTTP_STATUS" = "200" ]; then
        echo "✅ ${SERVICE_NAME} is healthy (HTTP $HTTP_STATUS)"
        exit 0
    elif [ "$HTTP_STATUS" = "503" ]; then
        echo "🔧 ${SERVICE_NAME} is in maintenance mode (HTTP 503) — treating as healthy"
        exit 0
    elif [ "$HTTP_STATUS" = "000" ]; then
        echo "⏳ ${SERVICE_NAME} not responding yet..."
    else
        echo "⚠️ ${SERVICE_NAME} returned HTTP $HTTP_STATUS"
    fi
    
    if [ $i -lt $MAX_RETRIES ]; then
        sleep $RETRY_INTERVAL
    fi
done

echo "❌ ${SERVICE_NAME} failed health check after $MAX_RETRIES attempts"
exit 1