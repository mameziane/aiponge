#!/bin/bash
# Run EAS CLI commands from the monorepo root.
# All EAS commands must target apps/aiponge where app.json lives.
#
# Usage examples:
#   ./eas.sh build --platform ios --profile development
#   ./eas.sh build --platform android --profile preview
#   ./eas.sh submit --platform ios
#   ./eas.sh credentials

set -e
cd "$(dirname "$0")/apps/aiponge"
exec eas "$@"
