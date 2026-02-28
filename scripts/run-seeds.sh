#!/usr/bin/env bash
set -euo pipefail

SEED_OPTS="${*}"
TSX="npx tsx"
NODE_OPTS="--conditions=development"

SERVICES=(
  "user-service"
  "ai-config-service"
  "ai-content-service"
  "system-service"
)

echo ""
echo "🌱 aiponge Seed Runner — All Services"
echo "======================================="
echo ""

FAILED=()

for svc in "${SERVICES[@]}"; do
  echo "━━━ ${svc} ━━━"
  if NODE_OPTIONS="${NODE_OPTS}" ${TSX} "packages/services/${svc}/src/seeds/cli.ts" ${SEED_OPTS}; then
    echo ""
  else
    FAILED+=("${svc}")
    echo "  ⚠  ${svc} seeds failed"
    echo ""
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "❌ Failed services: ${FAILED[*]}"
  exit 1
else
  echo "✅ All services seeded successfully"
fi
