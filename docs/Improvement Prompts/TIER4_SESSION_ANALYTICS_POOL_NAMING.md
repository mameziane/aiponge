# Final Fix — Analytics Pool Env Var Naming Consistency

## Single Issue

**File:** `packages/services/ai-analytics-service/src/infrastructure/database/TimescaleDBManager.ts` (line 71)

The TimescaleDBManager reads `ANALYTICS_DATABASE_POOL_MAX` but the rest of the codebase uses the `AI_ANALYTICS_` prefix convention:

- Platform-core factory generates `AI_ANALYTICS_DATABASE_POOL_MAX` (from serviceName `ai-analytics-service`)
- `docs/.env.production.example` line 22 documents `AI_ANALYTICS_DATABASE_POOL_MAX`
- But line 230 of the same file has the old name `ANALYTICS_DATABASE_POOL_MAX`

**Fix 1 — TimescaleDBManager.ts line 71:**

Change:

```typescript
max: config.maxConnections || parseInt(process.env.ANALYTICS_DATABASE_POOL_MAX || (process.env.NODE_ENV === 'production' ? '50' : '10')),
```

To:

```typescript
max: config.maxConnections || parseInt(process.env.AI_ANALYTICS_DATABASE_POOL_MAX || process.env.DATABASE_POOL_MAX || '50'),
```

**Fix 2 — docs/.env.production.example line 230:**

Change:

```env
ANALYTICS_DATABASE_POOL_MAX=50
```

To:

```env
AI_ANALYTICS_DATABASE_POOL_MAX=50
```

## Verification

- [ ] TimescaleDBManager reads `AI_ANALYTICS_DATABASE_POOL_MAX`
- [ ] `docs/.env.production.example` has only `AI_ANALYTICS_DATABASE_POOL_MAX` (no `ANALYTICS_DATABASE_POOL_MAX`)
- [ ] No TypeScript compilation errors
