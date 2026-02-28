#!/bin/bash
# Apply patches to node_modules after npm install
PATCHES_DIR="$(dirname "$0")"
PROJECT_DIR="$(cd "$PATCHES_DIR/.." && pwd)"
NGROK_CLIENT="$PROJECT_DIR/node_modules/@expo/ngrok/src/client.js"
NGROK_BIN="$PROJECT_DIR/node_modules/@expo/ngrok-bin-linux-x64/ngrok"

# Patch 1: Fix @expo/ngrok client.js crash on network errors
if [ -f "$PATCHES_DIR/fix-expo-ngrok-client.js" ] && [ -d "$PROJECT_DIR/node_modules/@expo/ngrok" ]; then
  cp "$PATCHES_DIR/fix-expo-ngrok-client.js" "$NGROK_CLIENT"
  echo "✅ Patched @expo/ngrok client.js"
fi

# Patch 1b: Fix @expo/ngrok index.js for ngrok v3 API compatibility
NGROK_INDEX="$PROJECT_DIR/node_modules/@expo/ngrok/index.js"
if [ -f "$PATCHES_DIR/fix-expo-ngrok-index.js" ] && [ -f "$NGROK_INDEX" ]; then
  cp "$PATCHES_DIR/fix-expo-ngrok-index.js" "$NGROK_INDEX"
  echo "✅ Patched @expo/ngrok index.js (v3 tunnel API compat)"
fi

# Patch 1c: Fix @expo/ngrok process.js for ngrok v3 CLI compatibility
NGROK_PROCESS="$PROJECT_DIR/node_modules/@expo/ngrok/src/process.js"
if [ -f "$PATCHES_DIR/fix-expo-ngrok-process.js" ] && [ -f "$NGROK_PROCESS" ]; then
  cp "$PATCHES_DIR/fix-expo-ngrok-process.js" "$NGROK_PROCESS"
  echo "✅ Patched @expo/ngrok process.js (v3 CLI compat)"
fi

# Patch 2: Replace ngrok v2 binary with v3 (v2 rejected by ngrok service since 2025)
if [ -f "$NGROK_BIN" ]; then
  CURRENT_VER=$("$NGROK_BIN" version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "0.0.0")
  MAJOR_VER=$(echo "$CURRENT_VER" | cut -d. -f1)
  if [ "$MAJOR_VER" -lt 3 ] 2>/dev/null; then
    echo "⚠️  ngrok binary is v$CURRENT_VER (too old), downloading v3..."
    curl -sSL https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz -o /tmp/ngrok-v3.tgz && \
      tar xzf /tmp/ngrok-v3.tgz -C /tmp && \
      cp /tmp/ngrok "$NGROK_BIN" && \
      chmod +x "$NGROK_BIN" && \
      echo "✅ Upgraded ngrok to $("$NGROK_BIN" version 2>/dev/null)" || \
      echo "❌ Failed to download ngrok v3"
    rm -f /tmp/ngrok-v3.tgz /tmp/ngrok
  else
    echo "✅ ngrok binary is v$CURRENT_VER (OK)"
  fi
fi
