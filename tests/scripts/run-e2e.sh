#!/bin/bash
set -e

echo "🚀 Running E2E Tests"
echo "===================="
echo ""

SCRIPT_DIR="$(dirname "$0")"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
E2E_DIR="$ROOT_DIR/tests/e2e"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Backend services not running${NC}"
  echo "   Start services with: npm run dev"
  echo ""
  exit 1
fi

echo -e "${GREEN}✅ Backend services detected${NC}"
echo ""

cd "$E2E_DIR"

echo "🧪 Running E2E test suites..."
echo ""

if npx jest --config jest.config.js --verbose; then
  echo ""
  echo -e "${GREEN}✅ All E2E tests passed!${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some E2E tests failed${NC}"
  exit 1
fi
