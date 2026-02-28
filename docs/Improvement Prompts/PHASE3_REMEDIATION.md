# Phase 3 Remediation — 7 Remaining Issues

> **Context**: Phase 3 added read-replica routing, Redis Cluster support, SSE infrastructure, graceful shutdown, externalised config, and maintenance mode. Verification found 4/10 items fully correct and 6 with bugs. The fixes below are ordered so each is independent — apply them in any order.

---

## Issue 1 — API Gateway `package.json`: replace `redis` with `ioredis`

**Problem**: `packages/services/api-gateway/src/presentation/middleware/RedisRateLimitMiddleware.ts` now imports `ioredis` (line 14), but `packages/services/api-gateway/package.json` line 44 still lists `"redis": "^5.8.3"`. The old `redis` package is unused; `ioredis` is the one actually imported.

**Fix**:

1. Open `packages/services/api-gateway/package.json`.
2. In the `"dependencies"` block, **remove** the line `"redis": "^5.8.3"`.
3. **Add** `"ioredis": "^5.4.1"` in its place (keep alphabetical order).
4. Verify no other file inside `packages/services/api-gateway/src/` imports from `"redis"`. If any do, change them to import from `"ioredis"`.

---

## Issue 2 — `platform-core` missing `ioredis` dependency + QueueManager fixes

**Problem**: `packages/platform-core/src/scheduling/QueueManager.ts` uses `require('ioredis')` at line 46, but `packages/platform-core/package.json` does not list `ioredis` as a dependency. Additionally:

- Line 30 types `connection` as `ConnectionOptions | null` but in cluster mode it's assigned a `Redis.Cluster` instance, which is not a `ConnectionOptions`.
- Line 46 uses `require('ioredis')` instead of a top-level ESM import, which breaks tree-shaking and may fail in strict ESM mode.

**Fix**:

1. Open `packages/platform-core/package.json`. Add `"ioredis": "^5.4.1"` to the `"dependencies"` block.
2. Open `packages/platform-core/src/scheduling/QueueManager.ts`:
   a. Add a top-level import: `import Redis from 'ioredis';`
   b. Change the type on line 30 from:
   ```ts
   private connection: ConnectionOptions | null = null;
   ```
   to:
   ```ts
   private connection: ConnectionOptions | Redis | Redis.Cluster | null = null;
   ```
   c. Replace the `require('ioredis')` on line 46 with the already-imported `Redis`:
   ```ts
   // BEFORE
   const Redis = require('ioredis');
   // AFTER (delete this line — Redis is now imported at top)
   ```
   The `new Redis.Cluster(nodes, ...)` call on line 51 will use the top-level import.
3. Ensure `packages/platform-core/src/scheduling/QueueManager.ts` compiles with `tsc --noEmit`.

---

## Issue 3 — API Gateway worker: pass `server` to `setupGracefulShutdown()`

**Problem**: In `packages/services/api-gateway/src/main.ts` line 125, `setupGracefulShutdown()` is called **without** the HTTP server parameter. This means on SIGTERM the gateway worker never calls `server.close()` — the HTTP server keeps accepting new connections during shutdown.

**Fix**:

1. Open `packages/services/api-gateway/src/main.ts`.
2. The `afterStart` callback has access to the Express `app`, but needs the HTTP `server`. The `bootstrapService` utility in platform-core returns the server or provides it via callback. Check how `bootstrapService` works — it likely creates the server internally. If it exposes the server (e.g., as a return value or via a callback parameter), capture it and pass it to `setupGracefulShutdown(server)`.
3. If `bootstrapService` does not expose the server, refactor so that it does. The minimal change: have `afterStart` receive the `http.Server` as an argument, then call `setupGracefulShutdown(server)` instead of `setupGracefulShutdown()`.
4. Verify that the other services (user-service, music-service, etc.) also pass their server to `setupGracefulShutdown()` — check each `main.ts`.

---

## Issue 4 — SSE event-bus bridge: use singleton instead of `new RedisEventBusClient()`

**Problem**: `packages/services/api-gateway/src/app.ts` lines 263-290 create a **new** `RedisEventBusClient('api-gateway')` instance every time the IIFE runs. If the gateway restarts or re-initialises, this leaks Redis connections. It should reuse a singleton or the shared Redis connection.

**Fix**:

1. Open `packages/services/api-gateway/src/app.ts`.
2. Check if `@aiponge/platform-core` exports a singleton event-bus getter (e.g., `getEventBus()` or `EventBus.getInstance()`). If it does, use that instead of `new RedisEventBusClient('api-gateway')`.
3. If no singleton exists, create one in platform-core:
   ```ts
   // packages/platform-core/src/events/RedisEventBusClient.ts
   let instance: RedisEventBusClient | null = null;
   export function getEventBusClient(serviceName: string): RedisEventBusClient {
     if (!instance) {
       instance = new RedisEventBusClient(serviceName);
     }
     return instance;
   }
   ```
   Export `getEventBusClient` from the platform-core barrel (`index.ts`).
4. In `app.ts` line 267, replace:
   ```ts
   const eventBus = new RedisEventBusClient('api-gateway');
   ```
   with:
   ```ts
   const eventBus = getEventBusClient('api-gateway');
   ```
5. Register the event-bus client shutdown in the existing `registerShutdownHook` in `main.ts` so it cleans up on SIGTERM.

---

## Issue 5 — Health check types: add `'maintenance'` to `HealthCheckResponse`

**Problem**: `packages/services/api-gateway/src/types/index.ts` line 43 defines:

```ts
status: 'healthy' | 'unhealthy' | 'degraded';
```

But `health.routes.ts` line 184 assigns `status: 'maintenance' as any` — a type-unsafe cast. The readiness and detailed health endpoints also don't include `maintenance` status or the `maintenance?: boolean` field.

**Fix**:

1. Open `packages/services/api-gateway/src/types/index.ts`.
2. Change line 43 from:
   ```ts
   status: 'healthy' | 'unhealthy' | 'degraded';
   ```
   to:
   ```ts
   status: 'healthy' | 'unhealthy' | 'degraded' | 'maintenance';
   ```
3. Add an optional `maintenance` field to the `HealthCheckResponse` interface:
   ```ts
   maintenance?: boolean;
   ```
4. Open `packages/services/api-gateway/src/presentation/routes/health.routes.ts`.
5. In `basicHealthCheck` (~line 184), remove the `as any` cast — it's now a valid type.
6. In `detailedHealthCheck` (~line 208), add maintenance awareness:
   ```ts
   const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
   const response: HealthCheckResponse = {
     status: isMaintenanceMode ? 'maintenance' : overallStatus,
     maintenance: isMaintenanceMode,
     // ... rest unchanged
   };
   ```
7. In `readinessCheck` (~line 255), add maintenance awareness:
   ```ts
   const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
   // If maintenance mode, the middleware already returns 503 for /health/ready
   // but if readiness is checked internally, include the flag:
   ```
   Add `maintenance: isMaintenanceMode` to the response object.
8. In `livenessCheck` (~line 285), add `maintenance: process.env.MAINTENANCE_MODE === 'true'` to the response. Liveness should always return 200 (the container is alive), but the flag helps monitoring dashboards.

---

## Issue 6 — Missing env vars in `docs/.env.production.example`

**Problem**: The following environment variables are used in the codebase but not documented in `docs/.env.production.example`:

| Variable                          | Used in                                                           | Default |
| --------------------------------- | ----------------------------------------------------------------- | ------- |
| `DATABASE_IDLE_TIMEOUT_MS`        | ai-content-service config                                         | `30000` |
| `CIRCUIT_BREAKER_TIMEOUT_MS`      | api-gateway DynamicCircuitBreakerConfig                           | `60000` |
| `CIRCUIT_BREAKER_RESET_TIMEOUT`   | api-gateway DynamicCircuitBreakerConfig, platform-core resilience | `30000` |
| `CIRCUIT_BREAKER_ERROR_THRESHOLD` | platform-core resilience                                          | `50`    |
| `QUEUE_WORKER_CONCURRENCY`        | platform-core QueueManager                                        | `1`     |
| `SHUTDOWN_TIMEOUT_MS`             | platform-core gracefulShutdown                                    | `30000` |
| `SSE_ENABLED`                     | platform-core SSEManager                                          | `false` |
| `REDIS_TLS`                       | platform-core QueueManager, RedisCache                            | `false` |

**Fix**:

1. Open `docs/.env.production.example`.
2. Add the following sections in the appropriate places:

After the existing Database section (after `AI_ANALYTICS_DATABASE_REPLICA_URL=`):

```
# Database timeouts (optional - defaults shown)
DATABASE_IDLE_TIMEOUT_MS=30000
```

After the existing Redis section (after `REDIS_CLUSTER_NODES=`):

```
# Redis TLS (set to 'true' if your Redis requires TLS)
REDIS_TLS=false
```

After the existing SSE section (after `SSE_MAX_CLIENTS=10000`):

```
# SSE feature toggle (disabled by default — enable when ready for real-time events)
SSE_ENABLED=false
```

Add a new section before or after the API Gateway section:

```
# =============================================================================
# RESILIENCE & PERFORMANCE TUNING (Optional - sensible defaults)
# =============================================================================

# Circuit breaker settings
CIRCUIT_BREAKER_TIMEOUT_MS=60000
CIRCUIT_BREAKER_RESET_TIMEOUT=30000
CIRCUIT_BREAKER_ERROR_THRESHOLD=50

# BullMQ worker concurrency (jobs processed in parallel per worker)
QUEUE_WORKER_CONCURRENCY=1

# Graceful shutdown timeout in milliseconds
SHUTDOWN_TIMEOUT_MS=30000
```

---

## Issue 7 — Verify all services compile cleanly

**Problem**: After applying issues 1-6, TypeScript compilation may break if types were updated but consumers weren't. This is a final validation step.

**Fix**:

1. Run `npx tsc --noEmit` from the repository root (or from each package that has a `tsconfig.json`).
2. Fix any type errors that appear — they are likely caused by the `HealthCheckResponse` type change (Issue 5) or the `QueueManager` connection type change (Issue 2).
3. Specifically check:
   - `packages/platform-core` compiles with the new `ioredis` import and connection type.
   - `packages/services/api-gateway` compiles with the updated `HealthCheckResponse` type and `ioredis` dependency.
4. If any test files reference the old types, update them to match.

---

## Summary checklist

| #   | Issue                                             | Files to change                                                                                                              |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `redis` → `ioredis` in gateway package.json       | `packages/services/api-gateway/package.json`                                                                                 |
| 2   | Add `ioredis` dep + fix QueueManager types/import | `packages/platform-core/package.json`, `packages/platform-core/src/scheduling/QueueManager.ts`                               |
| 3   | Pass `server` to `setupGracefulShutdown()`        | `packages/services/api-gateway/src/main.ts`                                                                                  |
| 4   | SSE event-bus singleton                           | `packages/services/api-gateway/src/app.ts`, optionally `packages/platform-core/src/events/RedisEventBusClient.ts`            |
| 5   | Health check types + maintenance consistency      | `packages/services/api-gateway/src/types/index.ts`, `packages/services/api-gateway/src/presentation/routes/health.routes.ts` |
| 6   | Document 8 missing env vars                       | `docs/.env.production.example`                                                                                               |
| 7   | Verify TypeScript compilation                     | All packages                                                                                                                 |
