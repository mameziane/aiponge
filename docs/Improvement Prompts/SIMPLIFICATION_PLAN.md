# Simplification Plan

Codebase audit for over-engineering, reinvented wheels, and unnecessary complexity.
Prioritized by: **(lines saved × confidence) / effort**

---

## Phase 1 — Validated Problems

### 1. Triple Implementations

#### HTTP Clients — **CONSOLIDATED** (was 2 implementations, now 1)

| Implementation                              | Location                                                 | Lines   | Status                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| ~~`@aiponge/http-client`~~                  | ~~`packages/http-client/src/index.ts`~~                  | ~~266~~ | **DELETED** — package removed, all consumers migrated to platform-core                                             |
| `platform-core/http/http-client.ts`         | `packages/platform-core/src/http/http-client.ts`         | ~250    | **SOLE IMPLEMENTATION** — axios-based with connection pooling, baseUrl, tracing headers, `getWithResponse` methods |
| `platform-core/http/resilientHttpClient.ts` | `packages/platform-core/src/http/resilientHttpClient.ts` | 22      | Resilience wrapper (not an HTTP client) — `withServiceResilience` used by 20+ service client files                 |

**Consolidation completed:** Chose axios-based `platform-core/http/http-client.ts` as winner. Extended it with `baseUrl`, tracing headers, and `getWithResponse`/`ok` methods from the fetch client. Migrated all 12 source import sites + 35 test files. Deleted `@aiponge/http-client` package entirely. Also deleted dead `api-gateway/utils/http-client.ts` wrapper (zero consumers). Deduplicated HTTP_CONFIGS from `service-urls-factory.ts`.

#### Service Discovery (2 remaining implementations)

| Implementation                      | Location                                                         | Lines   | Status                                                                       |
| ----------------------------------- | ---------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| ~~`@aiponge/service-registry`~~     | ~~`packages/service-registry/src/index.ts`~~                     | ~~269~~ | **MERGED** into `platform-core/config/service-registry.ts` — package deleted |
| ~~`platform-core/service-locator`~~ | ~~`packages/platform-core/src/config/service-locator.ts`~~       | ~~456~~ | **DELETED**                                                                  |
| `api-gateway/ServiceDiscovery.ts`   | `packages/services/api-gateway/src/services/ServiceDiscovery.ts` | 914     | Single consumer (GatewayCore). Over-engineered for one usage.                |

**Assessment:** service-locator deleted. service-registry merged into platform-core. api-gateway ServiceDiscovery is 914 lines for a single consumer.

#### Correlation/Tracing (1 remaining implementation)

| Implementation                         | Location                                            | Lines   | Status                   |
| -------------------------------------- | --------------------------------------------------- | ------- | ------------------------ |
| ~~`@aiponge/correlation`~~             | ~~`packages/correlation/src/index.ts`~~             | ~~199~~ | **DELETED**              |
| `platform-core/logging/correlation.ts` | `packages/platform-core/src/logging/correlation.ts` | 32      | Minimal, used internally |
| ~~`@aiponge/shared/tracing`~~          | ~~`packages/shared/src/tracing/`~~                  | ~~526~~ | **DELETED**              |

**~725 lines of dead tracing code deleted.**

#### Error Base Classes (3 base + consolidated subclass files)

| Base Class             | Lines      | Status                                                                                                                                                       |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BaseError.ts`         | 217        | Root class, used                                                                                                                                             |
| `DomainError.ts`       | 37         | Used by domain entities                                                                                                                                      |
| `platform-error.ts`    | 71         | Used by platform-core                                                                                                                                        |
| `domain-errors.ts`     | 135        | Shared error definitions                                                                                                                                     |
| ~~23+ subclass files~~ | ~~~2,000~~ | **CONSOLIDATED** — 19 files merged into single `errors.ts` per service (4 services). User-service errors converted from `Error` to `DomainError` base class. |

---

### 2. Hand-Rolled Middleware (~~1,377~~ remaining: ~864 lines)

| Middleware                    | Lines       | Replacement                 | Already a Dep?      | Custom Behavior                                                                                    | Status                                                                                |
| ----------------------------- | ----------- | --------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `RateLimitMiddleware.ts`      | 76          | `express-rate-limit`        | **YES** (^7.4.1)    | Per-user keying (`x-user-id`), degraded-mode divisor                                               | **KEPT** — already a thin wrapper around `express-rate-limit`, not a reimplementation |
| `RedisRateLimitMiddleware.ts` | ~~338~~ 215 | `rate-limit-redis`          | **YES** (installed) | Redis Cluster support, state emitter, backoff reconnect, fallback to in-memory                     | **SIMPLIFIED** — uses `express-rate-limit` + `rate-limit-redis` (-123 lines)          |
| ~~`CorsMiddleware.ts`~~       | ~~71~~      | ~~`cors`~~                  | ~~**YES**~~         | ~~COEP/COOP/CORP headers, 403 on bad origin~~                                                      | **DELETED** — replaced with `cors` package                                            |
| ~~`ETagMiddleware.ts`~~       | ~~152~~     | ~~Express built-in `etag`~~ | ~~Built-in~~        | ~~Configurable algo, threshold, compression-aware~~                                                | **DELETED** — replaced with Express built-in                                          |
| `CsrfProtectionMiddleware.ts` | 146         | `csrf-csrf`                 | No                  | Origin/Referer validation (not token-based), JWT bypass, Replit domain awareness                   | Remaining                                                                             |
| `ResponseCacheMiddleware.ts`  | 526         | `apicache`                  | No                  | Stale-while-revalidate, dual Redis+memory backend, CDN headers, per-user cache keys, feature flags | Remaining                                                                             |

**Correction:** `RateLimitMiddleware.ts` is 76 lines (not 144 as originally assessed) and already uses `express-rate-limit` internally. It's a legitimate config wrapper, not a reimplementation.

---

### 3. Speculative Value Objects (~~1,122~~ 0 lines remaining)

| File                  | Lines   | Status                                                                               |
| --------------------- | ------- | ------------------------------------------------------------------------------------ |
| ~~`FileChecksum.ts`~~ | ~~438~~ | **DELETED** — 100% dead code                                                         |
| ~~`StorageQuota.ts`~~ | ~~538~~ | **DELETED** — 100% dead code                                                         |
| `Duration.ts`         | 35      | **TRIMMED** — reduced from 146 to 35 lines, keeping only `fromSeconds()` and `add()` |

**~1,087 lines removed.**

---

### 4. Codegen System (~~1,114~~ 422 remaining lines)

| Script                             | Lines   | Purpose                                      | Status                                                                                          |
| ---------------------------------- | ------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `generate-service-config.ts`       | 277     | Generates `services.config.ts` manifest      | Remaining                                                                                       |
| ~~`generate-service-urls.ts`~~     | ~~134~~ | ~~Generates 8 thin wrapper files~~           | **DELETED** — service-urls.ts files are now static (identical thin wrappers, no codegen needed) |
| `generate-port-env.ts`             | 61      | Generates `.env` port variables              | Remaining                                                                                       |
| ~~`generate-dependency-graph.ts`~~ | ~~558~~ | ~~Generates dependency graph visualization~~ | **DELETED** — output never referenced                                                           |
| `generate-all-configs.ts`          | 84      | Orchestrator for all generators              | Simplified (removed service-urls entry)                                                         |

---

### 5. Kubernetes Health Probes (~~969~~ 815 remaining lines)

| File                       | Lines   | Status                                                                |
| -------------------------- | ------- | --------------------------------------------------------------------- |
| `health-manager.ts`        | 281     | **ACTIVE** — used by all services via `createStandardHealthManager()` |
| ~~`kubernetes-probes.ts`~~ | ~~154~~ | **DELETED** — app deploys on Replit, not K8s                          |
| `database-checks.ts`       | 157     | Active — used for DB health checks                                    |
| `dependency-checks.ts`     | 134     | Active — used for service dependency checks                           |
| `resilience-stats.ts`      | 143     | Used by health manager                                                |
| `types.ts`                 | 58      | Type definitions                                                      |
| `utilities.ts`             | 18      | Helpers                                                               |
| `index.ts`                 | 24      | Re-exports                                                            |

---

### 6. File Count per CRUD Feature: "Book" in user-service

**Reduced from 17 files to ~12 files:**

| Layer                  | File                          | Lines   | Status                                                                    |
| ---------------------- | ----------------------------- | ------- | ------------------------------------------------------------------------- |
| Domain Entity          | `BookEntity.ts`               | 101     | Remaining                                                                 |
| Repository Interface   | `ILibraryRepository.ts`       | 58      | Remaining                                                                 |
| ~~Use Case: Create~~   | ~~`CreateBookUseCase.ts`~~    | ~~143~~ | **MERGED** into `BookService.ts`                                          |
| ~~Use Case: Get~~      | ~~`GetBookUseCase.ts`~~       | ~~92~~  | **MERGED** into `BookService.ts`                                          |
| ~~Use Case: List~~     | ~~`ListUserBooksUseCase.ts`~~ | ~~113~~ | **MERGED** into `BookService.ts`                                          |
| ~~Use Case: Update~~   | ~~`UpdateBookUseCase.ts`~~    | ~~88~~  | **MERGED** into `BookService.ts`                                          |
| ~~Use Case: Delete~~   | ~~`DeleteBookUseCase.ts`~~    | ~~59~~  | **MERGED** into `BookService.ts`                                          |
| Use Case: Consolidated | `BookService.ts`              | ~150    | **NEW** — consolidated from 5 use-case files                              |
| Infra Repository       | `LibraryRepositoryImpl.ts`    | 335     | **SOLE implementation** (was "duplicate"; `LibraryRepository.ts` deleted) |
| Book Generation Repo   | `BookGenerationRepository.ts` | 166     | Remaining                                                                 |
| Controller             | `LibraryController.ts`        | 1,187   | Remaining                                                                 |
| Routes                 | `routes/index.ts` (shared)    | 2,353   | Remaining                                                                 |
| Error Class            | `LibraryError.ts`             | 85      | Remaining                                                                 |
| Shared Errors          | `LibraryErrors.ts`            | 97      | Remaining                                                                 |
| DB Schema              | `library-schema.ts`           | 432     | Remaining                                                                 |

**Corrections:**

- `LibraryRepository.ts` (1,440 lines) was previously deleted; `LibraryRepositoryImpl.ts` is now the sole implementation, not a duplicate
- 5 Book use-case files merged into single `BookService.ts`

---

## Phase 2 — Prioritized Action Plan

Actions ranked by **(lines saved × confidence that nothing breaks) / effort**.

### Tier 1: Safe Quick Wins — COMPLETE

| #    | Action                                                         | Status                                                                                                          |
| ---- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1.1  | ~~Delete `resilientHttpClient.ts`~~                            | **INVALID** — original assessment wrong; `withServiceResilience` actively used by 20+ service clients           |
| 1.2  | Delete `@aiponge/correlation` package                          | **DONE**                                                                                                        |
| 1.3  | Delete `@aiponge/shared/tracing`                               | **DONE**                                                                                                        |
| 1.4  | Delete `FileChecksum.ts`                                       | **DONE**                                                                                                        |
| 1.5  | Delete `StorageQuota.ts`                                       | **DONE**                                                                                                        |
| 1.6  | Trim `Duration.ts`                                             | **DONE** — 146 → 35 lines                                                                                       |
| 1.7  | Replace `CorsMiddleware.ts` with `cors` package                | **DONE**                                                                                                        |
| 1.8  | ~~Replace `RateLimitMiddleware.ts` with `express-rate-limit`~~ | **INVALID** — already uses `express-rate-limit`; file is a 76-line config wrapper, not a reimplementation       |
| 1.9  | Delete `generate-dependency-graph.ts`                          | **DONE**                                                                                                        |
| 1.10 | Delete `kubernetes-probes.ts`                                  | **DONE**                                                                                                        |
| 1.11 | ~~Delete duplicate `LibraryRepositoryImpl.ts`~~                | **INVALID** — `LibraryRepository.ts` already deleted; `LibraryRepositoryImpl.ts` is now the sole implementation |

**Tier 1 Actual Result: ~2,535 lines removed (8 items completed, 3 items invalid)**

---

### Tier 2: Consolidation

| #   | Action                                                                                   | Files Affected                                                                                                     | Lines Removed | Lines Added | Risk   | Status                                                                                  |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ----------- | ------ | --------------------------------------------------------------------------------------- |
| 2.1 | **Consolidate HTTP clients into platform-core**                                          | `@aiponge/http-client` deleted, all consumers migrated, `api-gateway/utils/http-client.ts` deleted                 | ~480          | ~30         | Medium | **DONE** — ~480 lines removed (266 fetch client + 214 dead gateway wrapper)             |
| 2.2 | **Consolidate service-registry into platform-core**                                      | `packages/service-registry/` merged into `platform-core/config/service-registry.ts`, all 8 service-urls.ts updated | ~269          | ~20         | Medium | **DONE** — package deleted, all imports migrated                                        |
| 2.3 | **Replace `RedisRateLimitMiddleware.ts` with `rate-limit-redis` + `express-rate-limit`** | `RedisRateLimitMiddleware.ts`                                                                                      | 123           | 0           | Medium | **DONE** — 338→215 lines, custom rate limit logic replaced with standard libraries      |
| 2.4 | **Replace `ETagMiddleware.ts` with Express built-in etag**                               | `packages/services/api-gateway/src/presentation/middleware/ETagMiddleware.ts`, `app.ts`                            | 152           | ~5          | Low    | **DONE**                                                                                |
| 2.5 | **Consolidate error subclass files**                                                     | 19 files across 4 services                                                                                         | ~19 files     | 4 files     | Medium | **DONE** — single `errors.ts` per service; user-service errors converted to DomainError |
| 2.6 | **Simplify codegen**                                                                     | `scripts/codegen/generate-service-urls.ts` deleted, `generate-all-configs.ts` simplified                           | 134           | 0           | Low    | **DONE** — service-urls.ts files are now static                                         |
| 2.7 | **Merge Book use-case files into single BookService**                                    | 5 use-case files → 1 service file                                                                                  | ~350          | ~150        | Medium | **DONE**                                                                                |

**Tier 2 Progress: 7 of 7 completed**

---

### Tier 3: Structural

Flattening DDD layers, merging microservices, replacing platform-core abstractions with direct library usage. High impact but high effort and risk.

| #   | Action                                                                       | Files Affected                                                                         | Lines Removed | Lines Added                 | Risk | Status                              |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------- | --------------------------- | ---- | ----------------------------------- |
| 3.1 | **Flatten DDD layers for simple CRUD resources**                             | All user-service Library and Book files (~17 files → ~4 files)                         | ~2,500        | ~800                        | High | Remaining                           |
| 3.2 | **Simplify api-gateway ServiceDiscovery.ts** — 914 lines for single consumer | `packages/services/api-gateway/src/services/ServiceDiscovery.ts`, `GatewayCore.ts`     | ~700          | ~150                        | High | Remaining                           |
| 3.3 | **Replace `ResponseCacheMiddleware.ts` with `apicache` + Redis adapter**     | `packages/services/api-gateway/src/presentation/middleware/ResponseCacheMiddleware.ts` | 526           | ~80                         | High | Remaining                           |
| 3.4 | **Merge `@aiponge/service-registry` into platform-core**                     | `packages/service-registry/`, `packages/platform-core/`                                | ~269          | ~20 (re-exports for compat) | High | **DONE** (completed as part of 2.2) |
| 3.5 | **Eliminate per-service error subclass hierarchies**                         | All `*Error.ts` files across services                                                  | ~2,000        | ~300                        | High | Remaining                           |

**Tier 3 Progress: 1 of 5 completed (3.4 done via Tier 2.2)**

---

## Summary

| Tier                        | Status                           | Net Lines Removed | Original Estimate |
| --------------------------- | -------------------------------- | ----------------- | ----------------- |
| **Tier 1: Safe Quick Wins** | **COMPLETE** (8 done, 3 invalid) | **~2,535**        | ~3,058            |
| **Tier 2: Consolidation**   | **COMPLETE** (7/7 done)          | **~1,776**        | ~2,312            |
| **Tier 3: Structural**      | 1 / 5 done (3.4 via 2.2)         | **~269**          | ~4,881            |
| **Total Progress**          |                                  | **~4,580**        | ~10,251           |

### Tier 2 Completed Breakdown

- 2.1: HTTP client consolidation — ~480 lines removed
- 2.2: Service-registry merge into platform-core — ~269 lines removed (also completes Tier 3.4)
- 2.3: RedisRateLimitMiddleware simplification — ~123 lines removed
- 2.4: ETagMiddleware replacement — ~152 lines removed
- 2.5: Error file consolidation — 19 files merged into 4, user-service errors standardized on DomainError
- 2.6: Codegen simplification — 134 lines removed (generate-service-urls.ts deleted)
- 2.7: Book use-case merge — ~350 lines removed

### Remaining Work

1. **Tier 3** — high risk, 2-3 weeks; structural changes (DDD flattening, ServiceDiscovery simplification, ResponseCache replacement)
