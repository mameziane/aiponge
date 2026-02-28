---
name: codebase-health
description: Analyze codebase quality, architecture compliance, and health metrics
---

# Codebase Health Analyzer

Run a comprehensive quality analysis of the aiponge codebase. Report findings clearly with actionable items.

## Analysis Checklist

### 1. Architecture Compliance

- Verify Clean Architecture layer boundaries in each service:
  - No imports from `infrastructure/` in `domains/`
  - No business logic in `presentation/` controllers
  - Use cases are single-purpose classes
- Check for cross-service import violations (services importing from other services instead of `@aiponge/shared-contracts`)
- Verify all inter-service calls go through typed ServiceClients

### 2. Code Quality Metrics

- Run `npm run lint` and report error/warning counts per service
- Run `npm run typecheck` and report any type errors
- Check for `console.log` usage in services (should use Winston logger)
- Look for raw `Error` throws instead of structured `BaseError` subclasses
- Identify functions exceeding complexity limits (>15 cognitive complexity, >100 lines, >6 params)

### 3. Pattern Compliance

- Content visibility: look for raw `=== CONTENT_VISIBILITY.*` comparisons in business logic (should use helpers)
- State machine: look for status changes without `assertValidTransition()`
- AI providers: look for direct API calls bypassing ProviderProxy
- Scheduling: look for raw `setInterval`/`setTimeout`/`cron` usage
- Frontend state: look for server data duplicated in Zustand stores

### 4. Naming Convention Audit

- Check database tables follow prefix conventions (usr*, mus*, cfg\_, etc.)
- Check for field name violations (coverUrl instead of coverArtworkUrl, etc.)
- Check API responses follow `{ success, data/error }` format

### 5. Security Scan

- Run `scripts/check-no-secrets.sh` if available
- Look for hardcoded API keys, tokens, or passwords in source
- Check for missing input validation on API endpoints (Zod schemas)
- Verify auth middleware on protected routes

### 6. Test Coverage Gaps

- Identify services or use cases with no test files
- Check for test files that only have placeholder/empty tests
- Report coverage gaps by service

## Output Format

Present a health report card:

```
## Codebase Health Report — [date]

### Score: [A/B/C/D/F] overall

| Category                  | Status | Issues |
|---------------------------|--------|--------|
| Architecture Compliance   | ✅/⚠️/❌ | count  |
| Code Quality              | ✅/⚠️/❌ | count  |
| Pattern Compliance        | ✅/⚠️/❌ | count  |
| Naming Conventions        | ✅/⚠️/❌ | count  |
| Security                  | ✅/⚠️/❌ | count  |
| Test Coverage             | ✅/⚠️/❌ | count  |

### Critical Issues (fix now)
- ...

### Warnings (fix soon)
- ...

### Suggestions (nice to have)
- ...
```

Include file paths and line numbers for every issue found. Be specific and actionable.
