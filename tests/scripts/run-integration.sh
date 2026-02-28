#!/bin/bash

# Integration Test Runner
# Runs all integration tests (API flows, service tests, contracts)

set -e

echo "🔗 Running Integration Tests"
echo "============================"
echo ""

SCRIPT_DIR="$(dirname "$0")"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INTEGRATION_DIR="$ROOT_DIR/tests/integration"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Backend services not running${NC}"
  echo "   Start services with: npm run dev"
  echo ""
  echo "   Running contract tests only (no service dependency)..."
  echo ""
  
  cd "$INTEGRATION_DIR"
  npx jest --config jest.config.js --testPathPattern="contracts/shared-contracts" --verbose
  exit $?
fi

echo -e "${GREEN}✅ Backend services detected${NC}"
echo ""

TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0
FAILED_SUITE_NAMES=()

run_test_suite() {
  local test_name="$1"
  local test_pattern="$2"
  local description="$3"
  
  echo -e "${BLUE}🧪 $test_name${NC}"
  echo "   $description"
  
  TOTAL_SUITES=$((TOTAL_SUITES + 1))
  
  if npx jest --config jest.config.js --testPathPattern="$test_pattern" --passWithNoTests 2>/dev/null; then
    echo -e "${GREEN}   ✅ PASSED${NC}"
    PASSED_SUITES=$((PASSED_SUITES + 1))
    return 0
  else
    echo -e "${RED}   ❌ FAILED${NC}"
    FAILED_SUITES=$((FAILED_SUITES + 1))
    FAILED_SUITE_NAMES+=("$test_name")
    return 1
  fi
}

cd "$INTEGRATION_DIR"

echo "🎯 Running Integration Test Suites"
echo "==================================="
echo ""

echo "📡 Service Integration Tests"
echo "-----------------------------"
run_test_suite "Service Discovery" "services/service-discovery" "Service URL resolution and fallbacks" || true
run_test_suite "Health Endpoints" "services/health-endpoints" "Service health checks" || true
run_test_suite "API Gateway Routing" "services/api-gateway" "Request routing and proxying" || true
run_test_suite "AI Content Service" "services/ai-content-service" "Content generation client" || true
run_test_suite "Error Handling" "services/error-handling" "Error and timeout handling" || true
echo ""

echo "🔄 API Flow Tests"
echo "-----------------"
run_test_suite "Auth Flow" "api/auth-flow" "Authentication workflows" || true
run_test_suite "Credit Deduction" "api/credit-deduction" "Credit system operations" || true
run_test_suite "Subscription Gating" "api/subscription-gating" "Premium feature access" || true
run_test_suite "Safety Detection" "api/safety-risk" "Safety screening flows" || true
echo ""

echo "📜 Contract Tests"
echo "-----------------"
run_test_suite "Shared Contracts" "contracts/shared-contracts" "Type contract validation" || true
run_test_suite "Live Contracts" "contracts/live" "Live API contract tests" || true
echo ""

echo ""
echo "🏁 Integration Test Summary"
echo "==========================="
echo ""

if [ $TOTAL_SUITES -gt 0 ]; then
  SUCCESS_RATE=$(( (PASSED_SUITES * 100) / TOTAL_SUITES ))
else
  SUCCESS_RATE=0
fi

echo "📊 Results:"
echo "   Total:  $TOTAL_SUITES"
echo -e "   ${GREEN}Passed: $PASSED_SUITES${NC}"
echo -e "   ${RED}Failed: $FAILED_SUITES${NC}"
echo "   Rate:   ${SUCCESS_RATE}%"
echo ""

if [ $FAILED_SUITES -eq 0 ]; then
  echo -e "${GREEN}✅ All integration tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed:${NC}"
  for suite in "${FAILED_SUITE_NAMES[@]}"; do
    echo "   • $suite"
  done
  exit 1
fi
