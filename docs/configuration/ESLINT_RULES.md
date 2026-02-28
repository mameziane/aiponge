# ESLint Rules Strategy

## Overview
Aiponge's ESLint configuration balances code quality enforcement with development flexibility. Rules are categorized into three tiers based on their impact on correctness, runtime safety, and code maintainability.

## Rule Tiers

### Tier 1: Correctness Rules (ERROR - Block Commits)
These rules catch **real bugs** that would cause runtime errors or data corruption. They MUST remain as errors.

```javascript
'no-debugger': 'error',        // Prevents debugger statements in production
'no-undef': 'error',           // Catches undefined variable usage
'no-redeclare': 'error',       // Prevents variable redeclaration
'no-unreachable': 'error',     // Catches dead code after return/throw
'no-dupe-class-members': 'error', // Prevents duplicate class methods
'no-duplicate-imports': 'error',  // Enforces single import per module
'no-var': 'error',             // Enforces const/let over var
```

**Rationale**: These errors cause immediate runtime failures or undefined behavior. Allowing them as warnings would let production bugs slip through.

### Tier 2: Type Safety Rules (WARN/OFF - Gradual Improvement)
TypeScript-specific rules that improve type safety but require significant refactoring.

```javascript
'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
'@typescript-eslint/no-explicit-any': 'warn',
```

**Rationale**: These improve type safety but are pervasive in the codebase. Warnings allow gradual cleanup without blocking development.

### Tier 3: Code Quality Rules (WARN - Best Practices)
Style and complexity rules that improve maintainability but don't affect correctness.

```javascript
'no-unused-expressions': 'warn',
'no-case-declarations': 'warn',
'no-useless-escape': 'warn',
'no-constant-condition': 'warn',
'no-useless-catch': 'warn',
'prefer-const': 'warn',
'max-len': ['warn', { code: 120 }],
'complexity': ['warn', 15],
```

**Rationale**: These catch suboptimal patterns but don't cause runtime errors. Warnings encourage improvement without blocking feature work.

### Tier 4: Architecture Enforcement (WARN - Development Phase)
Custom rules enforcing Aiponge's microservices architecture. Currently warnings during active development.

```javascript
'local-rules/no-direct-fetch': 'warn',
'local-rules/enforce-service-layer': 'warn',
'local-rules/no-ui-in-services': 'warn',
'local-rules/enforce-typed-responses': 'warn',
'local-rules/hook-naming-convention': 'warn',
'no-restricted-imports': 'warn', // Cross-service import prevention
```

**Rationale**: These enforce architectural patterns but are warnings to allow refactoring during consolidation phase. Should become errors before production release.

## Global Configuration

### Added Globals (Node.js Runtime)
```javascript
URL: 'readonly',
URLSearchParams: 'readonly',
AbortController: 'readonly',
AbortSignal: 'readonly',
```
Prevents false `no-undef` errors for standard Web APIs available in Node.js.

### Disabled Rules
```javascript
'no-console': 'off', // Too strict for current codebase
'@typescript-eslint/no-unsafe-*': 'off', // Requires parser services (too slow)
'@typescript-eslint/explicit-*-type': 'off', // Too strict for development
```

## Future Hardening Plan

**Before Production Release:**
1. Upgrade architecture rules from `warn` to `error`
2. Fix all remaining `no-unused-vars` warnings
3. Reduce `no-explicit-any` usage to <5% of codebase
4. Consider adding `no-console` as error in services (enforce Winston)

**Metrics to Track:**
- Total ESLint warnings (target: <100 per service)
- `@typescript-eslint/no-explicit-any` count (target: <50 total)
- Architecture rule violations (target: 0)

## Quality Check Integration

The `scripts/full-quality-check.ts` runs ESLint across all packages:
- **Errors**: Block quality check (exit code 1)
- **Warnings**: Logged but don't block (exit code 0)
- **Timeout**: 120 seconds for full monorepo scan

## Workflow Impact

**Development**: Warnings visible in IDE and pre-commit hooks, but don't block commits  
**CI/CD**: Quality check must pass (no errors) before merge  
**Production**: All Tier 1 rules enforced, zero tolerance for correctness issues

## Related Documentation
- [Quality Check Guide](./QUALITY_CHECK_GUIDE.md)
- [Security Audit](./SECURITY_AUDIT.md)
- Custom ESLint rules: `eslint-local-rules.js`
