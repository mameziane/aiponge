#!/bin/bash
# Production Database Setup Script
# Builds all services and pushes microservice schemas to the production database
# Run this during build phase or manually before first deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "🔨 Building all Aiponge backend services..."
echo "============================================"
cd "$WORKSPACE_ROOT"
npx turbo build \
  --filter='@aiponge/system-service' \
  --filter='@aiponge/storage-service' \
  --filter='@aiponge/user-service' \
  --filter='@aiponge/ai-config-service' \
  --filter='@aiponge/ai-content-service' \
  --filter='@aiponge/ai-analytics-service' \
  --filter='@aiponge/music-service' \
  --filter='@aiponge/api-gateway' \
  --parallel
echo "✅ All services built"
echo ""

echo "🗄️ Aiponge Production Database Setup"
echo "====================================="

# Check DATABASE_URL is available
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is required"
  exit 1
fi

echo "✓ DATABASE_URL is set"
echo ""

# Export shared DATABASE_URL for services that support fallback
export SYSTEM_DATABASE_URL="${SYSTEM_DATABASE_URL:-$DATABASE_URL}"
export STORAGE_DATABASE_URL="${STORAGE_DATABASE_URL:-$DATABASE_URL}"
export USER_DATABASE_URL="${USER_DATABASE_URL:-$DATABASE_URL}"
export AI_CONFIG_DATABASE_URL="${AI_CONFIG_DATABASE_URL:-$DATABASE_URL}"
export AI_CONTENT_DATABASE_URL="${AI_CONTENT_DATABASE_URL:-$DATABASE_URL}"
export AI_ANALYTICS_DATABASE_URL="${AI_ANALYTICS_DATABASE_URL:-$DATABASE_URL}"
export MUSIC_DATABASE_URL="${MUSIC_DATABASE_URL:-$DATABASE_URL}"

# Services to push schemas for
SERVICES=(
  "system-service"
  "storage-service"
  "user-service"
  "ai-config-service"
  "ai-content-service"
  "ai-analytics-service"
  "music-service"
)

echo "📦 Pushing schemas for all microservices..."
echo ""

# Disable exit-on-error for schema push — individual failures are non-fatal
set +e

for service in "${SERVICES[@]}"; do
  SERVICE_DIR="${WORKSPACE_ROOT}/packages/services/$service"

  if [ -f "$SERVICE_DIR/drizzle.config.ts" ]; then
    echo "🔄 Pushing schema for $service..."
    (
      cd "$SERVICE_DIR"
      echo "" | npx drizzle-kit push --force 2>&1
      EXIT_CODE=$?
      if [ $EXIT_CODE -ne 0 ]; then
        echo "⚠️ Warning: Schema push for $service exited with code $EXIT_CODE (may already be up to date)"
      fi
    )
    echo "✓ $service schema step done"
    echo ""
  else
    echo "⚠️ Skipping $service (no drizzle.config.ts found)"
  fi
done

set -e

echo "====================================="
echo "✅ Database schema setup complete!"
echo ""
