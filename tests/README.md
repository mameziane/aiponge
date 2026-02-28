# aiponge Test Suite

This directory contains all tests for the aiponge platform, organized by test type and purpose.

## Directory Structure

```
tests/
├── unit/                    # Unit tests (fast, isolated)
│   └── jest.config.js       # Unit test configuration
│
├── integration/             # Integration tests (cross-service)
│   ├── api/                 # API flow tests
│   │   ├── auth-flow.test.ts
│   │   ├── credit-deduction-flow.test.ts
│   │   ├── subscription-gating.test.ts
│   │   └── safety-risk-detection.test.ts
│   │
│   ├── services/            # Service-specific integration
│   │   ├── api-gateway/
│   │   ├── ai-content-service/
│   │   ├── health-endpoints/
│   │   ├── service-discovery/
│   │   └── error-handling/
│   │
│   ├── contracts/           # Contract validation tests
│   │   ├── shared-contracts/
│   │   └── live/
│   │
│   └── jest.config.js       # Integration test configuration
│
├── e2e/                     # End-to-end tests (full flows)
│   ├── smoke-tests/
│   ├── librarian-flows/
│   ├── entry-to-song-pipeline.test.ts
│   └── jest.config.js       # E2E test configuration
│
├── utils/                   # Shared test utilities
│   ├── setup.ts             # Test setup and fixtures
│   ├── test-credit-system.ts
│   └── verify-musicapi-config.ts
│
└── scripts/                 # Test runner scripts
    ├── run-all-tests.ts     # Main orchestrator
    ├── run-unit.sh          # Unit tests only
    ├── run-integration.sh   # Integration tests only
    ├── run-e2e.sh           # E2E tests only
    └── run-contracts.sh     # Contract tests only
```

## Test Categories

### Unit Tests

Fast, isolated tests that don't require external services. Located in each service's `src/tests/unit/` directory.

```bash
npx tsx tests/scripts/run-all-tests.ts --unit
# or
bash tests/scripts/run-unit.sh
```

### Contract Tests

Validate type contracts and API schemas between services. Don't require running services.

```bash
npx tsx tests/scripts/run-all-tests.ts --contracts
# or
bash tests/scripts/run-contracts.sh
```

### Integration Tests

Cross-service communication tests. **Require backend services running.**

```bash
npx tsx tests/scripts/run-all-tests.ts --integration
# or
bash tests/scripts/run-integration.sh
```

### E2E Tests

Full user flow tests (entry-to-song pipeline, smoke tests). **Require backend services running.**

```bash
npx tsx tests/scripts/run-all-tests.ts --e2e
# or
bash tests/scripts/run-e2e.sh
```

## Running Tests

### Run All Tests

```bash
npx tsx tests/scripts/run-all-tests.ts
```

### Quick Tests (No Services Required)

```bash
npx tsx tests/scripts/run-all-tests.ts --quick
```

### Specific Category

```bash
npx tsx tests/scripts/run-all-tests.ts --unit
npx tsx tests/scripts/run-all-tests.ts --contracts
npx tsx tests/scripts/run-all-tests.ts --integration
npx tsx tests/scripts/run-all-tests.ts --e2e
```

### Help

```bash
npx tsx tests/scripts/run-all-tests.ts --help
```

## Prerequisites

### For Unit & Contract Tests

- Node.js and npm installed
- Dependencies installed (`npm install`)

### For Integration & E2E Tests

- All of the above
- Backend services running (`npm run dev`)
- Services accessible at `http://localhost:8080`

## Test Execution Order

The main test runner executes tests in this order:

1. **Unit Tests** - Fast, isolated, run first
2. **Contract Tests** - Type validation, no services needed
3. **Integration Tests** - Cross-service, requires services
4. **E2E Tests** - Full flows, requires services

This order ensures fast feedback (unit tests fail fast) before running slower tests.

## Adding New Tests

### Unit Tests

Add to the service's `src/tests/unit/` directory:

```
packages/services/<service>/src/tests/unit/MyFeature.test.ts
```

### Integration Tests

Add to the appropriate subdirectory:

- API flows: `tests/integration/api/`
- Service-specific: `tests/integration/services/<service>/`
- Contracts: `tests/integration/contracts/`

### E2E Tests

Add to `tests/e2e/` with descriptive names.

## Configuration

Each test category has its own Jest configuration:

- `tests/unit/jest.config.js`
- `tests/integration/jest.config.js`
- `tests/e2e/jest.config.js`

Common settings:

- Preset: `ts-jest`
- Environment: `node`
- Module mappers for `@aiponge/*` packages
