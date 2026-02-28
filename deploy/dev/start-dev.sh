#!/bin/bash
# Startup script with proper cleanup and signal handling

SSH_TUNNEL_PID=""

cleanup() {
  echo "Shutting down aiponge..."
  pkill -TERM -f "ngrok" 2>/dev/null || true
  pkill -TERM -f "concurrently" 2>/dev/null || true
  pkill -TERM -f "turbo dev" 2>/dev/null || true
  pkill -TERM -f "tsx.*watch" 2>/dev/null || true
  pkill -TERM -f "expo start" 2>/dev/null || true
  pkill -TERM -f "ssh.*localhost.run" 2>/dev/null || true
  [ -n "$SSH_TUNNEL_PID" ] && kill "$SSH_TUNNEL_PID" 2>/dev/null || true
  sleep 3
  pkill -9 -f "ngrok" 2>/dev/null || true
  pkill -9 -f "concurrently" 2>/dev/null || true
  pkill -9 -f "turbo dev" 2>/dev/null || true
  pkill -9 -f "tsx.*watch" 2>/dev/null || true
  pkill -9 -f "expo start" 2>/dev/null || true
  pkill -9 -f "ssh.*localhost.run" 2>/dev/null || true
  for port in 8080 8082 3001 3002 3003 3004 3005 3006 3007 4040 4041; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
  done
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

pkill -TERM -f "ngrok" 2>/dev/null || true
pkill -TERM -f "concurrently" 2>/dev/null || true
pkill -TERM -f "turbo dev" 2>/dev/null || true
pkill -TERM -f "tsx.*watch" 2>/dev/null || true
pkill -TERM -f "tsx src/" 2>/dev/null || true
pkill -TERM -f "expo start" 2>/dev/null || true
pkill -TERM -f "ssh.*localhost.run" 2>/dev/null || true
sleep 3
pkill -9 -f "ngrok" 2>/dev/null || true
pkill -9 -f "expo start" 2>/dev/null || true
pkill -9 -f "ssh.*localhost.run" 2>/dev/null || true
pkill -9 -f "tsx src/" 2>/dev/null || true

# Force-release service ports so no EADDRINUSE on restart
for port in 8080 8082 3001 3002 3003 3004 3005 3006 3007 4040 4041; do
  fuser -k ${port}/tcp 2>/dev/null || true
done
sleep 1

export NODE_OPTIONS="--max-old-space-size=2048 --conditions=development"
export EXPO_TOKEN="${EXPO_TOKEN}"
export ENTRY_ENCRYPTION_KEY="${ENTRY_ENCRYPTION_KEY}"

if [ -f ".env" ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    key=$(echo "$key" | xargs)
    [[ -z "$key" || "$key" == \#* ]] && continue
    if [ -z "${!key}" ]; then
      export "$key=$value"
    fi
  done < .env
fi

export LOG_LEVEL=info

npx tsx scripts/codegen/generate-port-env.ts 2>/dev/null || true
[ -f ".env.ports" ] && source .env.ports

export API_GATEWAY_PORT=${API_GATEWAY_PORT:-8080}
export SYSTEM_SERVICE_PORT=${SYSTEM_SERVICE_PORT:-3001}
export STORAGE_SERVICE_PORT=${STORAGE_SERVICE_PORT:-3002}
export USER_SERVICE_PORT=${USER_SERVICE_PORT:-3003}
export AI_CONFIG_SERVICE_PORT=${AI_CONFIG_SERVICE_PORT:-3004}
export AI_CONTENT_SERVICE_PORT=${AI_CONTENT_SERVICE_PORT:-3005}
export AI_ANALYTICS_SERVICE_PORT=${AI_ANALYTICS_SERVICE_PORT:-3006}
export MUSIC_SERVICE_PORT=${MUSIC_SERVICE_PORT:-3007}

redis-server --daemonize yes --port 6379 --dir /tmp 2>/dev/null || true
export REDIS_URL=${REDIS_URL:-redis://localhost:6379}

# Ensure ngrok authtoken is configured for Expo tunnel (v2 + v3 paths)
if [ -n "$NGROK_AUTHTOKEN" ]; then
  mkdir -p "$HOME/.ngrok2"
  echo "authtoken: $NGROK_AUTHTOKEN" > "$HOME/.ngrok2/ngrok.yml"
  mkdir -p "$HOME/.config/ngrok"
  printf "version: \"2\"\nauthtoken: %s\n" "$NGROK_AUTHTOKEN" > "$HOME/.config/ngrok/ngrok.yml"
elif [ ! -f "$HOME/.ngrok2/ngrok.yml" ] && [ ! -f "$HOME/.config/ngrok/ngrok.yml" ]; then
  echo "⚠️  NGROK_AUTHTOKEN not set — tunnel may fail"
fi

# Ensure ngrok v3 binary is in place (v2 is rejected by ngrok service)
bash patches/apply-patches.sh

# Clear stale Metro bundler cache to prevent deserialization errors on restart
rm -rf /tmp/metro-cache 2>/dev/null || true

# ── API Gateway SSH tunnel (localhost.run, no auth required) ──────────────────
# Opens a public HTTPS URL → localhost:8080 so the iPhone can reach the gateway.
# The URL is written to apps/aiponge/.env before Expo bundles.
echo "🔗 Opening API gateway tunnel via localhost.run..."
rm -f /tmp/lhr-gateway.log
ssh -o StrictHostKeyChecking=no \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=5 \
    -o ConnectTimeout=15 \
    -R 80:localhost:8080 nokey@localhost.run \
    > /tmp/lhr-gateway.log 2>&1 &
SSH_TUNNEL_PID=$!

GATEWAY_URL=""
for i in $(seq 1 20); do
  sleep 1
  GATEWAY_URL=$(grep -oP 'https://\S+\.lhr\.life' /tmp/lhr-gateway.log 2>/dev/null | head -1 || echo "")
  if [ -n "$GATEWAY_URL" ]; then
    echo "✅ API gateway tunnel: $GATEWAY_URL"
    sed -i "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=$GATEWAY_URL|" apps/aiponge/.env
    export EXPO_PUBLIC_API_URL="$GATEWAY_URL"
    break
  fi
done

if [ -z "$GATEWAY_URL" ]; then
  echo "⚠️  Could not get tunnel URL — iPhone may not reach API gateway"
  echo "   Fallback EXPO_PUBLIC_API_URL: $EXPO_PUBLIC_API_URL"
  cat /tmp/lhr-gateway.log 2>/dev/null | tail -5
fi
# ─────────────────────────────────────────────────────────────────────────────

FILTER="$(dirname "$0")/log-filter.sh"

# ── Phase 1: Start backend services ──────────────────────────────────────────
echo "🚀 Starting backend services..."
npx turbo dev \
  --filter='@aiponge/*-service' \
  --filter='@aiponge/api-gateway' \
  --ui=stream \
  --no-update-notifier \
  2>&1 | "$FILTER" &
BACKEND_PID=$!

# ── Phase 2: Wait for all services to be healthy ──────────────────────────────
echo "⏳ Waiting for all backend services to be healthy before starting Expo..."
MAX_WAIT=120
ELAPSED=0
ALL_HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))

  RESULT=$(curl -s http://localhost:8080/health/services 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    s = d.get('summary', {})
    print(s.get('healthy', 0), s.get('total', 0), s.get('healthPercentage', 0))
except:
    print('0 0 0')
" 2>/dev/null || echo "0 0 0")

  H=$(echo $RESULT | awk '{print $1}')
  T=$(echo $RESULT | awk '{print $2}')
  P=$(echo $RESULT | awk '{print $3}')

  if [ "$P" = "100" ] && [ "${T:-0}" -gt 0 ] 2>/dev/null; then
    echo "✅ All $T services healthy after ${ELAPSED}s — starting Expo now"
    ALL_HEALTHY=true
    break
  fi

  echo "  ⏳ Services: ${H:-0}/${T:-0} healthy (${ELAPSED}s elapsed)..."
done

if [ "$ALL_HEALTHY" != "true" ]; then
  echo "⚠️  Services not fully healthy after ${MAX_WAIT}s — starting Expo anyway"
fi

# Re-check tunnel URL (it may have changed during wait)
CURRENT_TUNNEL=$(grep -oP 'https://\S+\.lhr\.life' /tmp/lhr-gateway.log 2>/dev/null | head -1 || echo "")
if [ -n "$CURRENT_TUNNEL" ] && [ "$CURRENT_TUNNEL" != "$GATEWAY_URL" ]; then
  echo "🔄 Tunnel URL updated: $CURRENT_TUNNEL"
  sed -i "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=$CURRENT_TUNNEL|" apps/aiponge/.env
fi

# ── Phase 3: Start Expo ───────────────────────────────────────────────────────
echo "📱 Starting Expo (API ready at $EXPO_PUBLIC_API_URL)..."
cd apps/aiponge && npx expo start --port 8082 --tunnel --go &
EXPO_PID=$!

# Keep script alive — wait for both processes
wait $BACKEND_PID $EXPO_PID
