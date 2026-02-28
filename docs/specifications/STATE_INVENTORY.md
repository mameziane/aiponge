# AIPONGE State Inventory

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total stateful components found** | 47 |
| **CRITICAL (must fix for scaling)** | 5 |
| **HIGH (should fix)** | 12 |
| **MEDIUM (monitor/improve)** | 18 |
| **LOW (acceptable)** | 12 |

## Key Findings

### CRITICAL Issues (Blocks Horizontal Scaling)

1. **music-service: MusicGenerationQueueService** - In-memory queue array loses all pending jobs on restart
2. **music-service: MusicTaskTracker** - In-memory Map loses all task state on restart
3. **api-gateway: ErrorLogStore** - In-memory error logs not shared across instances
4. **system-service: CircuitBreakerManager** - Circuit breaker state per-instance (Instance A trips, Instance B doesn't know)
5. **storage-service: Multiple Use Cases** - In-memory Maps for sessions, versions, permissions, tasks

### Partially Distributed (Falls Back to Memory)

1. **api-gateway: IdempotencyMiddleware** - Uses Redis if available, falls back to in-memory Map
2. **system-service: DistributedCache** - Multi-layer with Redis, but has local memory cache layer
3. **ai-analytics-service: RedisQueueManager** - Redis-backed (GOOD) but has in-memory stats Map

---

## State by Service

### api-gateway

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `ErrorLogStore.ts:33` | Error logs array | In-memory | ❌ | HIGH | Move to Redis or external logging |
| `IdempotencyMiddleware.ts:27` | Idempotency cache | Memory + Redis | ⚠️ Partial | **CRITICAL** | **Remove memory fallback in production** |
| `DynamicCircuitBreakerConfig.ts:33` | Service configs Map | In-memory | ❌ | HIGH | Share state via Redis |
| `ServiceDiscovery.ts:156` | Service instances Map | In-memory | ❌ | HIGH | Use Redis or etcd for discovery |
| `DynamicRouter.ts:50` | Routes Map | In-memory | ❌ | MEDIUM | Route config should be externalized |
| `metrics.ts:61-64` | Metrics Maps | In-memory | ❌ | LOW | OK for Prometheus scraping |
| `setInterval` (6 instances) | Background timers | In-memory | ❌ | LOW | OK - cleanup tasks |

**Stateless Readiness:** ⚠️ Needs Work

**Required Changes:**
1. Move ErrorLogStore to Redis or external logging system (ELK, Datadog)
2. Ensure Redis is always configured for IdempotencyMiddleware in production
3. Share circuit breaker state across instances via Redis

---

### music-service

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `MusicGenerationQueueService.ts:20` | Queue array | In-memory | ❌ | **CRITICAL** | Use BullMQ + Redis |
| `MusicTaskTracker.ts:32` | Tasks Map | In-memory | ❌ | **CRITICAL** | Use Redis hash |
| `AsyncJobExecutor.ts:41` | Jobs Map | In-memory | ❌ | HIGH | Use Redis |
| `HealthMonitor.ts:63` | setInterval | In-memory | ❌ | LOW | OK |

**Stateless Readiness:** ❌ Stateful (CRITICAL)

**Required Changes:**
1. Replace `MusicGenerationQueueService` with BullMQ + Redis
2. Replace `MusicTaskTracker.tasks` Map with Redis hash storage
3. Replace `AsyncJobExecutor.jobs` Map with Redis

---

### ai-analytics-service

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `SystemHealthService.ts:117-118` | Health cache + alerts Maps | In-memory | ❌ | HIGH | Move to Redis |
| `ProviderAnalyticsService.ts:80,93` | Stats + cache Maps | In-memory | ❌ | MEDIUM | Move to Redis |
| `WorkflowAnalyticsService.ts:72-76` | Workflows + cache Maps | In-memory | ❌ | MEDIUM | Move to Redis |
| `DetectAnomaliesUseCase.ts:354-355` | Detection buffer Map | In-memory | ❌ | HIGH | Move to Redis |
| `ManageAlertRulesUseCase.ts:440-441` | Alert rules + alerts Maps | In-memory | ❌ | MEDIUM | Consider Redis |
| `RedisQueueManager.ts:112` | Queue stats Map | In-memory | ❌ | LOW | Local stats OK |
| `MetricsCollectorService.ts:28` | Batch timer | In-memory | ❌ | LOW | OK |

**Stateless Readiness:** ⚠️ Needs Work

**Required Changes:**
1. Move health cache and alerts to Redis for shared visibility
2. Consider Redis for analytics caches if consistency required

---

### ai-config-service

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `ProviderProxy.ts:58-59` | Health Map + request queue | In-memory | ❌ | MEDIUM | Consider Redis |
| `CredentialsResolver.ts:19` | Credential cache | In-memory | ❌ | MEDIUM | Move to Redis with encryption |
| `CacheService.ts:13-14` | Template caches | In-memory | ❌ | MEDIUM | Move to Redis |
| `MetricsCollector.ts:22-23` | Metrics Maps | In-memory | ❌ | LOW | OK for local metrics |

**Stateless Readiness:** ⚠️ Needs Work

**Required Changes:**
1. Move credential cache to Redis with encryption
2. Move template cache to Redis for cross-instance consistency

---

### ai-content-service

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `ContentAIService.ts:252` | Generic cache | In-memory | ❌ | MEDIUM | Move to Redis |
| `ContentTemplateService.ts:75-76,491` | Template caches | In-memory | ❌ | MEDIUM | Move to Redis |

**Stateless Readiness:** ⚠️ Needs Work

**Required Changes:**
1. Move template caches to Redis for shared access

---

### user-service

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `TokenBlacklistService.ts` | Blacklist entries | **PostgreSQL** | ✅ | LOW | ✅ Already DB-backed |
| `JWTService.ts:66` | Singleton | Instance | N/A | LOW | OK - stateless |
| `EncryptionService.ts:32` | Singleton with key | Instance | N/A | LOW | OK - key from env |

**Stateless Readiness:** ✅ Ready

**Notes:** TokenBlacklistService correctly uses PostgreSQL for storage. Singleton patterns are stateless service wrappers.

---

### storage-service

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `SimpleStorageRepository.ts:10-11` | Files + status Maps | In-memory | ❌ | **CRITICAL** | Move to DB/Redis |
| `ResumableUploadUseCase.ts:72` | Sessions Map | In-memory | ❌ | **CRITICAL** | Move to Redis |
| **Local filesystem uploads** | Files on disk | Local `/uploads` | ❌ | **CRITICAL** | Move to S3/GCS |
| `FileVersioningUseCase.ts:47` | Versions Map | In-memory | ❌ | HIGH | Move to DB |
| `BackgroundProcessingUseCase.ts:58` | Tasks Map | In-memory | ❌ | HIGH | Use BullMQ + Redis |
| `FileAccessControlUseCase.ts:42` | Permissions Map | In-memory | ❌ | HIGH | Move to DB |
| `ISimpleStorage.ts:25-29` | User data Maps | In-memory | ❌ | HIGH | Move to DB |
| `ImageProcessingService.ts:47` | Singleton | Instance | N/A | LOW | OK |

**Stateless Readiness:** ❌ Stateful (CRITICAL)

**⚠️ LOCAL FILESYSTEM BLOCKER:** Any files stored on local disk (`/uploads`, `/tmp`, etc.) are NOT shared across instances. This is a critical scaling blocker that must be resolved by migrating to object storage (S3/GCS/Cloudinary).

**Required Changes:**
1. Move file metadata to PostgreSQL
2. Move upload sessions to Redis
3. Use BullMQ for background processing tasks

---

### system-service

| Component | State Type | Storage | Shared? | Risk | Action |
|-----------|------------|---------|---------|------|--------|
| `CircuitBreaker.ts:251` | Breakers Map | In-memory | ❌ | **CRITICAL** | Share via Redis |
| `DistributedCache.ts:42` | Memory cache layer | In-memory | ⚠️ Partial | MEDIUM | Redis as primary |
| `AdvancedMonitoring.ts:77,79` | Metrics + collectors | In-memory | ❌ | MEDIUM | For Prometheus |
| `FallbackServiceRegistry.ts:24` | Services Map | In-memory | ❌ | HIGH | Use Redis/etcd |
| `OptimizedHealthChecker.ts:32-35` | Active checks + cache | In-memory | ❌ | MEDIUM | Local caching OK |
| `PerformanceOptimizer.ts:49` | Profiles Map | In-memory | ❌ | LOW | OK |
| `ErrorHandling.ts:55,57` | Error patterns + retry stats | In-memory | ❌ | LOW | OK |
| `ProductionNotificationRepository.ts:37-41` | Notification indexes | In-memory | ❌ | HIGH | Move to DB |
| `ServiceDiscoveryManager.ts:58` | Services Map | In-memory | ❌ | HIGH | Use Redis/etcd |
| `ProductionServiceRepository.ts:22` | Services Map | In-memory | ❌ | HIGH | Use Redis/etcd |

**Stateless Readiness:** ⚠️ Needs Work

**Required Changes:**
1. Share circuit breaker state across instances via Redis
2. Move service registry to Redis or etcd for distributed discovery
3. Move notification repository to PostgreSQL

---

## Recommendations Priority

### P0 - Infrastructure Prerequisites

| # | Requirement | Notes |
|---|-------------|-------|
| 1 | Redis cluster with operational SLOs | Required before migrating any state |
| 2 | Object storage (S3/GCS) configuration | Required for storage-service files |
| 3 | BullMQ infrastructure | Required for job queues |

### P1 - Must Fix Before Scaling (CRITICAL)

| # | Service | Component | Issue | Solution | Effort |
|---|---------|-----------|-------|----------|--------|
| 1 | music-service | MusicGenerationQueueService | In-memory queue array | Replace with BullMQ + Redis | 2-3 days |
| 2 | music-service | MusicTaskTracker | In-memory task Map | Use Redis hash storage | 1-2 days |
| 3 | system-service | CircuitBreakerManager | Per-instance state | Share state via Redis Pub/Sub | 2 days |
| 4 | storage-service | ResumableUploadUseCase | In-memory sessions | Move to Redis | 1 day |
| 5 | storage-service | Local filesystem uploads | Files on local disk | Migrate to S3/GCS object storage | 2 days |
| 6 | api-gateway | IdempotencyMiddleware | Falls back to memory | **Remove fallback in production** | 1 day |
| 7 | api-gateway | ErrorLogStore | Per-instance logs | Use Redis or external logging | 1 day |

### P2 - Should Fix

| # | Service | Component | Issue | Solution | Effort |
|---|---------|-----------|-------|----------|--------|
| 1 | api-gateway | ServiceDiscovery | Per-instance service list | Use Redis or etcd | 2 days |
| 2 | system-service | FallbackServiceRegistry | Per-instance registry | Centralize in Redis | 1 day |
| 3 | ai-analytics-service | SystemHealthService | Per-instance health cache | Share via Redis | 1 day |
| 4 | storage-service | FileVersioningUseCase | In-memory versions | Move to PostgreSQL | 1 day |
| 5 | ai-config-service | CredentialsResolver | Unshared credential cache | Redis with encryption | 1 day |
| 6 | ai-content-service | ContentTemplateService | Per-instance template cache | Move to Redis | 1 day |

### P3 - Monitor / Optional

| # | Service | Component | Issue | Notes |
|---|---------|-----------|-------|-------|
| 1 | api-gateway | IdempotencyMiddleware | Falls back to memory | Ensure Redis is configured |
| 2 | system-service | DistributedCache | Local memory layer | Acceptable for L1 cache |
| 3 | Various | Metrics collectors | Per-instance metrics | OK for Prometheus model |
| 4 | Various | setInterval timers | Background cleanup | OK - per-instance tasks |

---

## Stateless Readiness Checklist

### Per-Service Status

| Service | Stateless Ready | Critical Blockers |
|---------|-----------------|-------------------|
| api-gateway | ⚠️ | ErrorLogStore, ServiceDiscovery |
| user-service | ✅ | None |
| music-service | ❌ | Queue state, task tracking (CRITICAL) |
| ai-content-service | ⚠️ | Template cache sharing |
| ai-config-service | ⚠️ | Credential cache, template cache |
| ai-analytics-service | ⚠️ | Health cache, analytics cache |
| storage-service | ❌ | Upload sessions, file metadata (CRITICAL) |
| system-service | ⚠️ | Circuit breaker state, service registry |

### Checklist for Each Service

#### ✅ Service is stateless if:
- [ ] No in-memory caches (use Redis)
- [ ] No in-memory queues (use BullMQ/Redis)
- [ ] No local file storage (use S3/GCS)
- [ ] No sticky sessions required
- [ ] Circuit breaker state is shared (Redis)
- [ ] Rate limit state is shared (Redis)
- [ ] Can be killed at any time without data loss
- [ ] Any instance can handle any request
- [ ] Health check returns accurate state

---

## Singleton Pattern Analysis

The following singletons were found. Most are acceptable as they're stateless service wrappers:

| Location | Type | Risk |
|----------|------|------|
| `DatabaseConnectionFactory.getInstance()` | Connection pool | ✅ LOW - Properly managed |
| `JWTService.getInstance()` | Stateless utility | ✅ LOW |
| `EncryptionService.getInstance()` | Stateless utility | ✅ LOW |
| `ConfigurationManager.getInstance()` | Config holder | ✅ LOW |
| `CircuitBreakerManager.getInstance()` | **Stateful** | ⚠️ HIGH - Needs Redis |
| `CacheManager.getInstance()` | **Stateful** | ⚠️ MEDIUM |
| `DynamicServiceRegistry.getInstance()` | **Stateful** | ⚠️ HIGH |
| `StorageProviderFactory.getInstance()` | Factory | ✅ LOW |
| `MusicApiCreditsService.getInstance()` | **Stateful** | ⚠️ MEDIUM |

---

## Timer/Interval Analysis

Found 30+ `setInterval` usages across services. Categories:

### Acceptable (Cleanup/Monitoring)
- Health check intervals (system-service, api-gateway)
- Cache cleanup intervals (distributed-cache, idempotency)
- Metrics collection intervals

### Needs Attention
- `MusicTaskTracker.ts:44` - Cleanup timer should coordinate with Redis-based storage
- `MusicApiCreditsService.ts:186` - Sync timer may need coordination

---

## Recommended Architecture Changes

### 1. Centralized Job Queue
Replace all in-memory queues with BullMQ + Redis:
```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐
│  music-service  │────▶│   BullMQ    │◀────│ music-service   │
│   (Producer)    │     │   (Redis)   │     │   (Worker)      │
└─────────────────┘     └─────────────┘     └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Shared State    │
                    │   - Task status   │
                    │   - Queue depth   │
                    │   - Retry count   │
                    └───────────────────┘
```

### 2. Distributed Circuit Breaker
Use Redis for shared circuit breaker state:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Instance A  │     │    Redis    │     │ Instance B  │
│   Trips CB  │────▶│  CB State   │◀────│  Reads CB   │
└─────────────┘     └─────────────┘     └─────────────┘
                    │ service_x: OPEN │
                    │ failures: 5     │
                    │ reset_at: T+30s │
```

### 3. External Service Discovery
Replace in-memory service registries with Redis/etcd:
```
┌─────────────────────────────────────────────────────┐
│                  Redis/etcd                          │
│  ┌──────────────────────────────────────────────┐   │
│  │ services/music-service/instances/pod-1       │   │
│  │ services/music-service/instances/pod-2       │   │
│  │ services/ai-content/instances/pod-1          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         ▲                           ▲
         │                           │
┌─────────────────┐         ┌─────────────────┐
│  api-gateway    │         │  system-service │
│  (reads/writes) │         │  (reads/writes) │
└─────────────────┘         └─────────────────┘
```

---

## Migration Priority

### Phase 0: Infrastructure (Week 0)
**PREREQUISITE FOR ALL PHASES**
1. Deploy Redis cluster with HA and operational SLOs
2. Configure S3/GCS object storage buckets
3. Set up BullMQ workers and dashboard

### Phase 1: Critical (Week 1-2)
1. music-service queue → BullMQ
2. music-service task tracker → Redis
3. storage-service upload sessions → Redis
4. storage-service local files → S3/GCS object storage
5. api-gateway IdempotencyMiddleware → Remove in-memory fallback (require Redis)

### Phase 2: High (Week 3-4)
1. Circuit breaker → Redis-backed
2. Service discovery → Redis/etcd
3. Error logs → External logging (ELK/Datadog)

### Phase 3: Medium (Week 5-6)
1. Template caches → Redis
2. Credential cache → Redis
3. Health caches → Redis
