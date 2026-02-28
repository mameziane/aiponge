# Quality Check System

## Overview

The Aiponge project includes a comprehensive quality check system that validates code quality, architecture, and configuration before commits and deployments.

## Full Quality Check Script

**Location:** `scripts/full-quality-check.ts`

### What It Checks

The comprehensive quality check runs 8 validation gates:

1. **📋 Configuration Validation**
   - Config freshness (generated within 24 hours)
   - Port hardcode detection (enforces single source of truth)

2. **📦 Service Structure Validation**
   - Verifies all 9 services are properly configured
   - Checks entry points and package.json files exist

3. **📝 TypeScript Type Checking**
   - Runs `npm run typecheck` across all workspaces
   - Ensures type safety across the monorepo

4. **🔍 ESLint Validation**
   - Lints all TypeScript/JavaScript files
   - Enforces code style and best practices

5. **💅 Code Formatting Check**
   - Verifies Prettier formatting
   - Checks .ts, .tsx, .js, .jsx, .json, .md files

6. **🔒 Dependency Security Audit**
   - Runs `npm audit` for high/critical vulnerabilities
   - Non-blocking (warnings only)

7. **🧪 Test Suite Execution**
   - Runs all test suites
   - Can be skipped with `--fast` flag

8. **🔧 LSP Diagnostics Check**
   - Verifies TypeScript build cache
   - Informational only

### Usage

#### Run Full Quality Check

```bash
tsx scripts/full-quality-check.ts
```

#### Fast Mode (Skip Tests)

```bash
tsx scripts/full-quality-check.ts --fast
```

#### CI Mode (Strict - Warnings as Errors)

```bash
tsx scripts/full-quality-check.ts --ci
```

#### Verbose Mode (Show Command Output)

```bash
tsx scripts/full-quality-check.ts --verbose
```

#### Combined Flags

```bash
tsx scripts/full-quality-check.ts --fast --verbose
tsx scripts/full-quality-check.ts --ci --verbose
```

### Adding to package.json

You can manually add these scripts to your `package.json` for convenience:

```json
{
  "scripts": {
    "quality:check": "tsx scripts/full-quality-check.ts",
    "quality:check:fast": "tsx scripts/full-quality-check.ts --fast",
    "quality:check:ci": "tsx scripts/full-quality-check.ts --ci",
    "quality:check:verbose": "tsx scripts/full-quality-check.ts --verbose",
    "quality:fix": "npm run lint -- --fix && npx prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\" --ignore-path .gitignore"
  }
}
```

Then run:

```bash
npm run quality:check
npm run quality:check:fast
npm run quality:check:ci
npm run quality:fix  # Auto-fix linting and formatting issues
```

### Exit Codes

- **0**: All checks passed (or warnings in non-CI mode)
- **1**: One or more checks failed (or warnings in CI mode)

### Output Format

```
═══════════════════════════════════════════════════════════════════
  AIPONGE - COMPREHENSIVE QUALITY CHECK
═══════════════════════════════════════════════════════════════════

📋 [1/8] Configuration Validation
  ✅ Config freshness: All checks passed
  ✅ Hardcoded ports: All checks passed

📦 [2/8] Service Structure Validation
  ✅ Service structure: All checks passed

📝 [3/8] TypeScript Type Checking
  ✅ Type checking: All checks passed

🔍 [4/8] ESLint Validation
  ✅ Linting: All checks passed

💅 [5/8] Code Formatting Check
  ✅ Code formatting: All checks passed

🔒 [6/8] Dependency Security Audit
  ⚠️  Security audit: Check failed (non-blocking)

🧪 [7/8] Test Suite Execution
  ✅ Tests: All checks passed

🔧 [8/8] LSP Diagnostics Check
  ✅ Build cache verified

═══════════════════════════════════════════════════════════════════
  QUALITY CHECK SUMMARY
═══════════════════════════════════════════════════════════════════

✅ Passed:   7/8
⚠️  Warnings: 1/8

⏱️  Total Duration: 45.23s

✅ ALL QUALITY CHECKS PASSED!
   Code is ready for commit/production
```

## Individual Validation Scripts

### Config Freshness Validation

```bash
tsx scripts/validate-config-freshness.ts
```

- Checks that `apps/shared/config/generated/service-config.ts` exists
- Verifies config was generated within 24 hours
- Validates port configuration is current

### Port Hardcode Detection

```bash
tsx scripts/validate-no-hardcoded-ports.ts
```

- Scans all TypeScript files in `packages/`
- Detects hardcoded port references (localhost:3xxx)
- Ensures single source of truth for port configuration

### Service Verification

```bash
NODE_OPTIONS="--conditions=development" tsx tests/consolidated-services-verification.ts
```

- Verifies all 9 services exist and are configured
- Checks entry points and package.json files
- Reports consolidation status

### Comprehensive Test Suite

```bash
NODE_OPTIONS="--conditions=development" tsx tests/run-all-tests.ts
```

- Runs service verification
- Reports unit test status
- Provides test coverage summary

## Pre-Commit Hook

The project includes a pre-commit hook (`.husky/pre-commit`) that runs:

1. Type checking
2. Linting
3. Tests

You can replace this with the comprehensive quality check:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running comprehensive quality checks..."
tsx scripts/full-quality-check.ts --fast
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Quality Checks
  run: |
    npm install
    npm run generate:config
    tsx scripts/full-quality-check.ts --ci --verbose
```

### GitLab CI Example

```yaml
quality_check:
  script:
    - npm install
    - npm run generate:config
    - tsx scripts/full-quality-check.ts --ci --verbose
  allow_failure: false
```

## Troubleshooting

### "Config is stale" Error

```bash
npm run generate:config
```

### "Hardcoded ports detected" Error

Replace hardcoded ports with `ServiceLocator.getServiceUrl()` calls.

### Type Check Failures

```bash
npm run typecheck
```

Fix type errors in the reported files.

### Linting Failures

```bash
npm run lint -- --fix
```

Auto-fix linting issues where possible.

### Formatting Issues

```bash
npx prettier --write "**/*.{ts,tsx,js,jsx,json,md}" --ignore-path .gitignore
```

Auto-format all files.

### Test Failures

```bash
NODE_OPTIONS="--conditions=development" tsx tests/run-all-tests.ts
```

Debug individual test failures.

## Best Practices

1. **Run Before Committing**: Always run quality checks before committing

   ```bash
   tsx scripts/full-quality-check.ts --fast
   ```

2. **Run Full Check Before PR**: Run complete checks before creating pull requests

   ```bash
   tsx scripts/full-quality-check.ts
   ```

3. **CI Mode for Production**: Use CI mode for production deployments

   ```bash
   tsx scripts/full-quality-check.ts --ci
   ```

4. **Fix Issues Immediately**: Don't accumulate quality debt - fix issues as they arise

5. **Update Regularly**: Keep dependencies updated and re-run quality checks

## Future Enhancements

Planned additions to the quality check system:

- Bundle size analysis
- Unused dependency detection
- Circular dependency detection
- Performance regression tests
- API contract validation
- Database migration validation
- Docker image security scanning
- License compliance checking
