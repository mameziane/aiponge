#!/bin/bash
set -e

echo "📜 Running Contract Tests"
echo "========================="
echo ""

SCRIPT_DIR="$(dirname "$0")"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/tests/integration/contracts"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

cd "$ROOT_DIR/tests/integration"

echo "🧪 Running shared contract tests..."
echo ""

if npx jest --config jest.config.js --testPathPattern="contracts/" --verbose; then
  echo ""
  echo -e "${GREEN}✅ All contract tests passed!${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some contract tests failed${NC}"
  exit 1
fi
