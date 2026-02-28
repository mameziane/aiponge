#!/bin/bash
set -e

echo "🧪 Running Unit Tests"
echo "====================="
echo ""

SCRIPT_DIR="$(dirname "$0")"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TESTS_DIR="$ROOT_DIR/tests"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

echo "📦 Running microservice unit tests..."
echo ""

SERVICES=(
  "api-gateway"
  "user-service"
  "music-service"
  "ai-content-service"
  "ai-config-service"
  "ai-analytics-service"
  "storage-service"
  "system-service"
)

for service in "${SERVICES[@]}"; do
  SERVICE_PATH="$ROOT_DIR/packages/services/$service"
  UNIT_TEST_PATH="$SERVICE_PATH/src/tests/unit"
  
  if [ -d "$UNIT_TEST_PATH" ]; then
    echo -n "  Testing $service (unit/)... "
    TOTAL=$((TOTAL + 1))
    
    if cd "$SERVICE_PATH" && npx vitest run src/tests/unit --passWithNoTests --reporter=dot 2>/dev/null; then
      echo -e "${GREEN}PASSED${NC}"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}FAILED${NC}"
      FAILED=$((FAILED + 1))
    fi
  elif [ -d "$SERVICE_PATH" ]; then
    TEST_COUNT=$(find "$SERVICE_PATH" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
    if [ "$TEST_COUNT" -gt 0 ]; then
      echo -n "  Testing $service... "
      TOTAL=$((TOTAL + 1))
      
      if cd "$SERVICE_PATH" && npx jest --passWithNoTests --silent 2>/dev/null; then
        echo -e "${GREEN}PASSED${NC}"
        PASSED=$((PASSED + 1))
      else
        echo -e "${RED}FAILED${NC}"
        FAILED=$((FAILED + 1))
      fi
    else
      echo -e "  ${YELLOW}$service - no tests${NC}"
      SKIPPED=$((SKIPPED + 1))
    fi
  fi
done

echo ""
echo "📊 Unit Test Summary"
echo "===================="
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
echo -e "  ${RED}Failed:  $FAILED${NC}"
echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
echo "  Total:   $TOTAL"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All unit tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some unit tests failed${NC}"
  exit 1
fi
