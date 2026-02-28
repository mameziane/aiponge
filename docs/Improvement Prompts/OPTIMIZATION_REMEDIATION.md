# Optimization Remediation Prompt

## Status Summary

| #   | Optimization                            | Status   | Detail                                                                                                                                                                                   |
| --- | --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WellnessScore `Promise.allSettled()`    | DONE     | Correctly implemented. 5 calls parallelized, critical/non-critical separation, graceful degradation with warn logs.                                                                      |
| 2   | TrackGenerationService sync I/O removal | DONE     | `fs.appendFileSync`, `logToFile()`, `LOG_FILE`, and `import * as fs` all removed. Zero references remain.                                                                                |
| 3   | LibraryRepository subquery fix          | DONE     | `entryCountSq` now uses direct `lib_entries.book_id = lib_books.id` instead of nested `IN (SELECT ...)` through `lib_chapters`. Comment added explaining why.                            |
| 4   | InsightReports parallelization          | DONE     | Both `gatherReportData()` (4 repo calls via `Promise.all`) and `execute()` (4 independent generation steps via `Promise.all`) correctly parallelized.                                    |
| 5   | Circuit breaker wrapping                | 15% DONE | Utility created, export chain correct, but only 4 out of 14 client files actually wrap their methods. Of those 4, most methods within are still unwrapped. See detailed breakdown below. |

**Optimizations 1-4 are complete and correct. No remediation needed.**

**Optimization 5 requires significant remediation — detailed instructions below.**

---

## Optimization 5 Remediation: Circuit Breaker Wrapping

### What Was Done Correctly

1. `withServiceResilience()` utility created at `packages/platform-core/src/http/resilientHttpClient.ts` — clean implementation with one-time preset configuration via `configuredBreakers` Set
2. Export chain is correct: `resilientHttpClient.ts` -> `http/index.ts` -> `platform-core/src/index.ts` -> available as `@aiponge/platform-core`
3. 4 files partially wrapped:
   - `api-gateway/clients/ProvidersServiceClient.ts` — 3 of 17 methods wrapped
   - `api-gateway/clients/AnalyticsServiceClient.ts` — 5 of 7 HTTP methods wrapped (event bus fire-and-forget correctly excluded)
   - `system-service/shared/infrastructure/DynamicServiceClient.ts` — 1 of 1 wrapped (good)
   - `ai-content-service/infrastructure/clients/TemplateServiceClient.ts` — 1 of 7 methods wrapped

### What Was NOT Done (10 client files completely untouched)

Every client file listed below has zero `withServiceResilience` usage. They must all be wrapped.

---

### INSTRUCTIONS: Wrap all remaining service clients

The pattern to apply is always the same. For each HTTP method in each client:

```typescript
// BEFORE:
async someMethod(params: SomeType): Promise<ResultType> {
  const response = await this.httpClient.post('/api/some/path', params);
  return response.data;
}

// AFTER:
async someMethod(params: SomeType): Promise<ResultType> {
  return withServiceResilience(TARGET_SERVICE, 'someMethod', async () => {
    const response = await this.httpClient.post('/api/some/path', params);
    return response.data;
  }, PRESET);
}
```

Import to add at the top of each file that does not already have it:

```typescript
import { withServiceResilience } from '@aiponge/platform-core';
```

Preset rules:

- `'ai-provider'` — for calls to ai-config-service that invoke AI providers (generation, invocation, selection), and calls to ai-content-service (content/image generation)
- `'internal-service'` — for calls to user-service, storage-service, system-service, ai-analytics-service, and non-AI calls to ai-config-service (templates, config reads, management)

Do NOT wrap:

- Health check methods (`isHealthy()`, `healthCheck()`, `ping()`) — circuit breakers use these to probe recovery
- Event bus fire-and-forget methods (`recordEvent()`, `recordEvents()`) — these don't use HTTP
- Stub methods that return hardcoded data without making HTTP calls
- `MusicApiLyricsTimelineClient` — external API with its own retry/cache logic already

For analytics/non-critical methods, add a silent catch:

```typescript
async recordMetrics(data: MetricData): Promise<void> {
  try {
    return await withServiceResilience('ai-analytics-service', 'recordMetrics', async () => {
      await this.httpClient.post('/api/metrics', data);
    });
  } catch (error) {
    logger.warn('Analytics recording failed (non-blocking)', { error });
  }
}
```

---

### File-by-File Remediation

#### FIX 1: `packages/services/api-gateway/src/clients/ProvidersServiceClient.ts`

Current state: Imports `withServiceResilience`, wraps 3 methods (`invokeProvider`, `selectProvider`, `getProviderHealth`). 14 methods unwrapped.

Bug: All 3 wrapped methods use default preset `'internal-service'`. This is WRONG — calls to ai-config-service for provider invocation and selection are AI operations.

Fix:

- Change preset on `invokeProvider()`, `selectProvider()`, `getProviderHealth()` from default to `'ai-provider'`
- Wrap these additional methods with `withServiceResilience('ai-config-service', methodName, fn, 'ai-provider')`:
  - `getProviderHealthById()`
  - `testProvider()`
  - `getProvidersByCapability()`
  - `getUsageStatistics()`
  - `getProviderStatistics()`
  - `getProviderCatalog()`
  - `getProviderConfigurations()`
  - `getProviderConfiguration()`
  - `createProviderConfiguration()`
  - `updateProviderConfiguration()`
  - `deleteProviderConfiguration()`
- Wrap with `'internal-service'` preset (config/management operations, not AI invocation):
  - `configureLoadBalancing()`
  - `getLoadBalancingConfig()`
  - `configureProvider()`
  - `removeProvider()`
- Do NOT wrap: `getProxyHealth()` (health check method)

---

#### FIX 2: `packages/services/ai-content-service/src/infrastructure/clients/TemplateServiceClient.ts`

Current state: Imports `withServiceResilience`, wraps only `executeTemplate()`. 6 methods unwrapped.

Fix: Wrap these with `withServiceResilience('ai-config-service', methodName, fn, 'internal-service')`:

- `createTemplate()`
- `getTemplate()`
- `listTemplates()`
- Do NOT wrap: `healthCheck()` (health probe), `executeWithFallback()` (delegates to `executeTemplate()` which is already wrapped)

---

#### FIX 3: `packages/services/music-service/src/infrastructure/clients/ProvidersServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 12 HTTP methods, zero wrapped.

Fix: Add import, then wrap:

- With `'ai-provider'` preset (AI generation operations):
  - `generateMusic()` — CRITICAL, 5-minute timeout operation
  - `generateImage()`
  - `analyzeImage()`
- With `'internal-service'` preset (config/read operations):
  - `getMusicProviders()`
  - `getProviderHealth()` — this is reading provider health data, NOT a health probe for the client itself, so wrap it
  - `getProviderCreditCost()`
  - `getModelConfiguration()`
  - `getProviderStatus()`
- Do NOT wrap: `getRecommendedProvider()`, `analyzeMusicStyle()`, `getProviderPricing()`, `estimateCost()` — these are stubs returning hardcoded data with no HTTP calls
- Do NOT wrap: `isHealthy()` — health probe

---

#### FIX 4: `packages/services/music-service/src/infrastructure/clients/StorageServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 10 HTTP methods, zero wrapped.

Fix: Add import, then wrap all with `withServiceResilience('storage-service', methodName, fn, 'internal-service')`:

- `uploadAudio()`
- `downloadFromExternalUrl()`
- `getDownloadUrl()`
- `getStreamingUrl()`
- `getFileMetadata()`
- `updateFileMetadata()`
- `deleteFile()`
- `listFiles()`
- `getStorageStats()`
- `cleanupExpiredFiles()`
- Do NOT wrap: `isHealthy()` (health probe), `uploadToPresignedUrl()` (direct S3 call, not internal service)

---

#### FIX 5: `packages/services/music-service/src/infrastructure/clients/UserServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 11 HTTP methods, zero wrapped.

Fix: Add import, then wrap with `withServiceResilience('user-service', methodName, fn, 'internal-service')`:

- `getCreditBalance()`
- `validateCredits()`
- `deductCredits()` — CRITICAL financial operation
- `refundCredits()` — CRITICAL financial operation
- `getTransactionHistory()`
- `getUserDisplayName()`
- `getAccessibleCreatorIds()`
- `getLibrarianIds()`
- `unlockChaptersForTrigger()`
- Do NOT wrap: `isHealthy()` (health probe)
- `incrementPuzzleListens()` — wrap but add silent catch (non-critical, fire-and-forget pattern)

---

#### FIX 6: `packages/services/music-service/src/infrastructure/clients/AIContentServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 3 HTTP methods, zero wrapped.

Fix: Add import, then wrap with `withServiceResilience('ai-content-service', methodName, fn, 'ai-provider')`:

- `generateContent()`
- `generateAlbumArtwork()`
- `generatePlaylistArtwork()`
- Do NOT wrap: `isHealthy()` (health probe)

---

#### FIX 7: `packages/services/ai-content-service/src/infrastructure/clients/ProvidersServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 7 HTTP methods, zero wrapped.

Fix: Add import, then wrap:

- With `'ai-provider'` preset:
  - `generateText()` — CRITICAL, main AI text generation path
  - `generateImage()`
  - `getOptimalProvider()`
  - `testProvider()`
- With `'internal-service'` preset:
  - `getProviders()`
  - `getProviderHealth()` — reads provider status, NOT a health probe
- Do NOT wrap: `checkHealth()` (health probe)

---

#### FIX 8: `packages/services/ai-content-service/src/infrastructure/clients/StorageServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 6 HTTP methods, zero wrapped.

Fix: Add import, then wrap all with `withServiceResilience('storage-service', methodName, fn, 'internal-service')`:

- `uploadImage()`
- `downloadFromExternalUrl()`
- `getDownloadUrl()`
- `getFileMetadata()`
- `deleteFile()`
- Do NOT wrap: `isHealthy()` (health probe), `uploadToPresignedUrl()` (direct S3 call)

---

#### FIX 9: `packages/services/ai-content-service/src/infrastructure/clients/TemplateEngineServiceClient.ts`

Current state: May import `withServiceResilience` from local config but does NOT use it in any method. All HTTP calls go through `makeRequest()` helper and direct `httpClient.post()` — both unwrapped.

Fix — wrap at the bottleneck level. Do BOTH of the following:

First, wrap the generic `makeRequest()` helper since all read/write methods delegate to it:

```typescript
private async makeRequest<T>(method: string, path: string, data?: unknown): Promise<T> {
  return withServiceResilience('ai-config-service', `template:${method}:${path}`, async () => {
    // existing makeRequest implementation unchanged
  }, 'internal-service');
}
```

Second, wrap `executeArtworkTemplate()` separately since it calls `httpClient.post()` directly instead of going through `makeRequest()`:

```typescript
async executeArtworkTemplate(request: ArtworkTemplateRequest): Promise<ArtworkTemplateResponse> {
  return withServiceResilience('ai-config-service', 'executeArtworkTemplate', async () => {
    // existing implementation unchanged
  }, 'ai-provider');
}
```

---

#### FIX 10: `packages/services/user-service/src/infrastructure/clients/ContentServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 4 HTTP methods, zero wrapped.

Fix: Add import, then wrap with `withServiceResilience('ai-content-service', methodName, fn, 'ai-provider')`:

- `analyzeContent()`
- `generateInsights()`
- `analyzeEntry()`
- Do NOT wrap: `healthCheck()` (health probe)

---

#### FIX 11: `packages/services/user-service/src/infrastructure/clients/AiContentServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 2 HTTP methods, zero wrapped.

Fix: Add import, then wrap with `withServiceResilience('ai-content-service', methodName, fn, 'ai-provider')`:

- `generateBookCover()`
- `generateImage()`
- Do NOT wrap: `isHealthy()` (health probe)

---

#### FIX 12: `packages/services/user-service/src/infrastructure/clients/ConfigServiceClient.ts`

Current state: Does NOT import `withServiceResilience`. 1 HTTP method, unwrapped.

Fix: Add import, then wrap:

- `getLlmModel()` — `withServiceResilience('ai-config-service', 'getLlmModel', fn, 'internal-service')`

---

### Execution Order

1. FIX 1 — Fix preset bug + wrap remaining methods in api-gateway ProvidersServiceClient (already imported)
2. FIX 2 — Wrap remaining methods in ai-content-service TemplateServiceClient (already imported)
3. FIX 3, 4, 5, 6 — All music-service clients (highest impact — music generation pipeline)
4. FIX 7, 8, 9 — All ai-content-service clients (content generation pipeline)
5. FIX 10, 11, 12 — All user-service clients (user-facing reads)

### General Rules

- Do NOT modify `packages/platform-core/src/http/resilientHttpClient.ts` — the utility is correct
- Do NOT modify `packages/platform-core/src/resilience/index.ts` or `RedisCircuitBreaker.ts`
- Do NOT modify `packages/services/api-gateway/src/utils/CircuitBreakerManager.ts`
- Do NOT wrap database calls, event bus calls, or health probe methods
- Do NOT change method signatures or return types — wrapping goes AROUND existing logic
- Do NOT install new packages
- Preserve all existing error handling — `withServiceResilience` wraps around the existing try/catch, not inside it
- TypeScript strict mode — no `any` types in new code
- Execute ALL 12 fixes — do not skip any
