#!/usr/bin/env bash
set -euo pipefail

SERVICES=(
  "system-service:3001"
  "storage-service:3002"
  "user-service:3003"
  "ai-config-service:3004"
  "ai-content-service:3005"
  "ai-analytics-service:3006"
  "music-service:3007"
  "api-gateway:8080"
)

TIMEOUT=${SMOKE_TIMEOUT:-5}
MAX_WAIT=${SMOKE_MAX_WAIT:-60}
PASSED=0
FAILED=0
FAILURES=()

log() { printf "\033[1m[smoke]\033[0m %s\n" "$1"; }
ok()  { printf "\033[32m  ✓ %s\033[0m\n" "$1"; }
fail(){ printf "\033[31m  ✗ %s\033[0m\n" "$1"; }

wait_for_service() {
  local name=$1 port=$2 elapsed=0
  while [ $elapsed -lt "$MAX_WAIT" ]; do
    if curl -sf --max-time "$TIMEOUT" "http://localhost:${port}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

check_health() {
  local name=$1 port=$2
  local status
  status=$(curl -sf --max-time "$TIMEOUT" -o /dev/null -w "%{http_code}" "http://localhost:${port}/health" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    ok "${name} (port ${port}) — HTTP ${status}"
    PASSED=$((PASSED + 1))
    return 0
  else
    fail "${name} (port ${port}) — HTTP ${status}"
    FAILED=$((FAILED + 1))
    FAILURES+=("${name}:${port}")
    return 1
  fi
}

log "Starting smoke tests for ${#SERVICES[@]} services"
log "Timeout: ${TIMEOUT}s per request, Max wait: ${MAX_WAIT}s per service"
echo ""

if [ "${1:-}" = "--wait" ]; then
  log "Waiting for services to become healthy..."
  for entry in "${SERVICES[@]}"; do
    IFS=: read -r name port <<< "$entry"
    if wait_for_service "$name" "$port"; then
      ok "${name} is ready"
    else
      fail "${name} did not start within ${MAX_WAIT}s"
    fi
  done
  echo ""
fi

log "Checking health endpoints..."
for entry in "${SERVICES[@]}"; do
  IFS=: read -r name port <<< "$entry"
  check_health "$name" "$port" || true
done

echo ""
log "Results: ${PASSED} passed, ${FAILED} failed out of ${#SERVICES[@]} services"

if [ ${FAILED} -gt 0 ]; then
  log "Failed services: ${FAILURES[*]}"
  exit 1
fi

log "All services healthy"
exit 0
