#!/bin/bash
# Clean restart script for Aiponge development environment

echo "🛑 Stopping all running processes..."

# Kill processes in order (children first, parents last)
pkill -TERM -f "expo start" 2>/dev/null || true
pkill -TERM -f "turbo dev" 2>/dev/null || true
pkill -TERM -f "concurrently" 2>/dev/null || true
pkill -TERM -f "api-gateway" 2>/dev/null || true
pkill -TERM -f "music-service" 2>/dev/null || true
pkill -TERM -f "tsx" 2>/dev/null || true

# Wait for processes to stop
sleep 2

# Force kill any stragglers
pkill -9 -f "turbo daemon" 2>/dev/null || true

echo "✅ All processes stopped"
echo "🚀 Starting development environment..."

# Start the dev environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/start-dev.sh"
