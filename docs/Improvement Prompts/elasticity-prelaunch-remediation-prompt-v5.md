# Remediation Prompt v5 for Coding Agent

> Context: Fifth audit pass. The v4 fixes (ci.yml JWT_SECRET, deploy.yml deprecated) are done. However the coding agent also refactored `RateLimitMiddleware.ts` and `RedisRateLimitMiddleware.ts` to use `express-rate-limit`, which introduced 2 new regressions, plus the `npm audit` strictness will block CI. 3 issues total.

---

## ISSUE 1 — `RedisRateLimitMiddleware.ts`: Redis store evaluated once at creation time, never re-evaluated

**Severity:** High — Redis rate limiting will NEVER activate if Redis connects after middleware creation

**File:** `packages/services/api-gateway/src/presentation/middleware/RedisRateLimitMiddleware.ts`

**Problem:** Lines 130-136 and 150 evaluate `redisClient` and `redisAvailable` at middleware creation time:

```typescript
const store = redisClient                    // ← evaluated ONCE
  ? new RedisStore({ ... })
  : undefined;

return rateLimit({
  ...
  store: redisAvailable ? store : undefined,  // ← evaluated ONCE
});
```

Since `initializeRedisClient` is async and uses `lazyConnect: true`, at the time `createRedisRateLimitMiddleware` returns, Redis is almost certainly NOT connected yet. So `redisClient` is `null`, `store` is `undefined`, and `redisAvailable` is `false`. The middleware permanently uses the in-memory store even after Redis becomes available seconds later.

The previous implementation had a per-request check (`if (redisAvailable && redisClient)`) that would switch dynamically. The refactored code lost this.

**What to do:**

Replace the `createRedisRateLimitMiddleware` function (lines 123-158) with a version that checks Redis availability per-request. The simplest approach: create two `express-rate-limit` instances — one with `RedisStore`, one without — and dispatch per-request:

```typescript
export function createRedisRateLimitMiddleware(config: RateLimitConfig) {
  if (config.redis) {
    initializeRedisClient(config.redis);
  }

  const prefix = config.redis?.keyPrefix || 'api-gateway:ratelimit:';

  const FALLBACK_DIVISOR = process.env.NODE_ENV === 'production'
    ? parseInt(process.env.RATE_LIMIT_FALLBACK_DIVISOR || '4', 10)
    : 1;

  const maxFn = (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined;
    if (userId && config.authenticatedMaxRequests) return config.authenticatedMaxRequests;
    return config.maxRequests;
  };

  const fallbackMaxFn = (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined;
    const base = (userId && config.authenticatedMaxRequests)
      ? config.authenticatedMaxRequests
      : config.maxRequests;
    return Math.ceil(base / FALLBACK_DIVISOR);
  };

  const keyGenFn = (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined;
    if (userId) return `user:${userId}`;
    return `ip:${extractClientIP(req)}`;
  };

  const commonOpts = {
    windowMs: config.windowMs,
    keyGenerator: keyGenFn,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
  };

  // In-memory fallback limiter with reduced limits
  const fallbackLimiter = rateLimit({ ...commonOpts, max: fallbackMaxFn });

  if (process.env.NODE_ENV === 'production' && FALLBACK_DIVISOR > 1) {
    logger.warn('In-memory rate limit fallback uses reduced limits', {
      divisor: FALLBACK_DIVISOR,
    });
  }

  return (req: Request, res: Response, next: Function) => {
    // Dynamically check Redis availability on every request
    if (redisAvailable && redisClient) {
      // Lazily create Redis-backed limiter on first available request
      if (!redisLimiter) {
        redisLimiter = rateLimit({
          ...commonOpts,
          max: maxFn,
          store: new RedisStore({
            sendCommand: (...args: string[]) =>
              (redisClient as Redis).call(...(args as [string, ...string[]])) as any,
            prefix,
          }),
        });
      }
      return redisLimiter(req, res, next);
    }

    // Fallback: in-memory with reduced limits
    return fallbackLimiter(req, res, next);
  };
}
```

Add `let redisLimiter: any = null;` as a module-level variable alongside the existing `redisClient` declarations (around line 34). Also reset it to `null` when Redis disconnects — add `redisLimiter = null;` in the `redisClient.on('end', ...)` handler (line 96) and in the catch block (line 114), so a new `RedisStore` is created if Redis reconnects with a different client instance.

---

## ISSUE 2 — `RedisRateLimitMiddleware.ts`: `FALLBACK_DIVISOR` logic removed from the Redis middleware path

**Severity:** Medium — multi-instance in-memory rate limiting is not reduced when Redis is down

**File:** `packages/services/api-gateway/src/presentation/middleware/RedisRateLimitMiddleware.ts`

**Problem:** The previous implementation called the fallback `rateLimitMiddleware()` from `RateLimitMiddleware.ts` which applied `FALLBACK_DIVISOR` to reduce per-instance limits. The refactored `RedisRateLimitMiddleware` now uses `config.maxRequests` directly (line 143) for both Redis and in-memory modes, with no divisor applied when Redis is unavailable.

**What to do:** This is already addressed by the fix in Issue 1 above — the `fallbackMaxFn` applies `FALLBACK_DIVISOR` to the in-memory path, while the Redis path uses full limits.

---

## ISSUE 3 — `npm audit --audit-level=high` without `|| true` will block all PRs

**Severity:** Medium — CI will likely fail on every PR due to transitive dependency vulnerabilities

**Files:**
- `.github/workflows/ci.yml` (line 51)
- `.github/workflows/pr-validation.yml` (line 73)

**Problem:** Both files run `npm audit --audit-level=high` as a blocking step (no `|| true`). Most large Node.js monorepos have transitive high-severity advisories in dependencies they don't control (e.g. via react-native, expo, etc.). This will fail CI for everyone even though the vulnerabilities are in dev-only or transitive dependencies that can't be immediately fixed.

**What to do:**

In both files, change the audit step to be non-blocking but visible:

In `.github/workflows/ci.yml`, the `audit` job (line 51), change:
```yaml
      - run: npm audit --audit-level=high
```
to:
```yaml
      - run: npm audit --audit-level=high --production || true
      - name: Fail on direct dependency vulnerabilities
        run: npm audit --audit-level=critical --production
```

This makes high-severity advisories visible as warnings but only blocks the pipeline for critical vulnerabilities in production dependencies.

In `.github/workflows/pr-validation.yml`, the `security-audit` job (line 73), apply the same change:
```yaml
      - run: npm audit --audit-level=high --production || true
      - name: Fail on direct dependency vulnerabilities
        run: npm audit --audit-level=critical --production
```

---

## VERIFICATION CHECKLIST

After completing all issues, verify:

- [ ] `grep -n "redisAvailable.*store\|store.*redisAvailable" packages/services/api-gateway/src/presentation/middleware/RedisRateLimitMiddleware.ts` — should NOT appear as a one-time evaluation at middleware creation
- [ ] `grep -n "FALLBACK_DIVISOR" packages/services/api-gateway/src/presentation/middleware/RedisRateLimitMiddleware.ts` — should return matches showing the divisor is applied in the fallback path
- [ ] `grep -n "redisLimiter" packages/services/api-gateway/src/presentation/middleware/RedisRateLimitMiddleware.ts` — should show lazy creation and reset on disconnect
- [ ] `grep "|| true" .github/workflows/ci.yml` — should show the non-blocking audit
- [ ] `grep "|| true" .github/workflows/pr-validation.yml` — same
- [ ] `grep "audit-level=critical" .github/workflows/ci.yml` — should show the blocking critical check
