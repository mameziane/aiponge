# aiponge Development Tools

This directory contains all development tools, scripts, and configurations for the aiponge platform, organized into logical categories.

## Directory Structure

### `eslint/`
ESLint configuration and custom rules for API architecture enforcement.

- `eslint.config.js` - Main ESLint configuration
- `eslint-local-rules.js` - Custom rule plugin loader
- `eslint-rules/` - Custom ESLint rules directory
  - `api-architecture.js` - API architecture compliance rules
  - `index.js` - Rule exports

### `deployment/`
Production deployment and infrastructure management scripts.

- `deploy-production.ts` - Production deployment orchestration
- `deployment-manager.ts` - Deployment lifecycle management
- `rollback-deployment.ts` - Deployment rollback functionality
- `validate-deployment-config.ts` - Deployment configuration validation
- `verify-deployment-fixes.ts` - Post-deployment verification

### `validation/`
Code quality, architecture validation, and linting tools.

- `architectural-linter.js` - Architecture pattern validation
- `circular-dependency-checker.js` - Dependency cycle detection
- `configuration-validator.js` - Configuration file validation
- `eslint-plugin-microservice-architecture.js` - Microservice ESLint plugin
- `health-endpoint-checker.js` - Service health validation
- `microservice-architecture.js` - Microservice architecture validation
- `schema-contract-validator.js` - API contract validation
- `security-compliance-validator.js` - Security compliance checks
- `testing-coverage-validator.js` - Test coverage validation
- `package.json` - Validation tools dependencies

### `architecture/`
Architecture compliance and testing scripts.

- `architectural-lint.js` - Architecture linting orchestrator
- `comprehensive-architectural-check.js` - Full architecture validation
- `run-all-architectural-checks.js` - All checks runner
- `test-architectural-rules.js` - Architecture rules testing

## Usage

### ESLint Configuration
The ESLint configuration is symlinked to the project root for proper ESLint functionality:
```bash
# Lint specific files
npx eslint apps/aiponge/src/screens/
# Lint entire project
npx eslint .
```

### Deployment Scripts
```bash
# Deploy to production
npx tsx deploy/scripts/deploy-production.ts
# Validate deployment config
npx tsx deploy/scripts/validate-deployment-config.ts
```

### Architecture Validation
```bash
# Run all architecture checks
node tools/architecture/run-all-architectural-checks.js
# Run comprehensive check
node tools/architecture/comprehensive-architectural-check.js
```

### Code Validation
```bash
# Check circular dependencies
node tools/validation/circular-dependency-checker.js
# Validate API schemas
node tools/validation/schema-contract-validator.js
```