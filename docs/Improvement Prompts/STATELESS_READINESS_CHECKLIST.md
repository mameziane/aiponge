# AIPONGE Stateless Readiness Checklist

## Quick Reference: Stateless Best Practices

| Concern | ❌ Stateful (Bad) | ✅ Stateless (Good) |
|---------|-------------------|---------------------|
| **Caching** | In-memory Map/LRU | Redis |
| **Sessions** | In-memory store | Redis/JWT |
| **Job Queues** | In-memory array | BullMQ + Redis |
| **Circuit Breakers** | Per-instance state | Redis-backed shared state |
| **Rate Limiting** | Per-instance counters | Redis sliding window |
| **Service Discovery** | In-memory registry | Redis/etcd/Kubernetes |
| **File Storage** | Local filesystem | S3/GCS/Object Storage |
| **Error Logs** | In-memory array | External logging (ELK) |

---

## Service Readiness Matrix

| Service | Ready? | Blocking Issues | Priority |
|---------|--------|-----------------|----------|
| user-service | ✅ | None | - |
| api-gateway | ✅ | **Migrated**: Idempotency now Redis-backed (fails fast in production if Redis unavailable) | DONE |
| music-service | ✅ | **Migrated**: BullMQ queue + Redis task tracker | DONE |
| ai-content-service | ⚠️ | Template cache per-instance | P3 |
| ai-config-service | ⚠️ | Credential + template cache | P2 |
| ai-analytics-service | ✅ | Fixed ESM/CommonJS compatibility; health + analytics cache acceptable | DONE |
| storage-service | ✅ | **Migrated**: RedisUploadSessionStore for resumable uploads | DONE |
| system-service | ✅ | **Migrated**: RedisCircuitBreaker with Pub/Sub state sharing | DONE |

---

## Pre-Deployment Checklist

### Before Scaling to Multiple Instances

- [x] **music-service**: Queue state in Redis (BullMQ implementation)
- [x] **music-service**: Task tracker using Redis hash (MusicGenerationQueue.ts)
- [x] **storage-service**: Upload sessions in Redis (RedisUploadSessionStore.ts)
- [x] **system-service**: Circuit breaker state shared via Redis (RedisCircuitBreaker.ts with Pub/Sub)
- [x] **api-gateway**: Redis configured for idempotency (fails fast in production if unavailable)
- [x] **All services**: Can be killed without losing user data

### Kubernetes Readiness

- [ ] All stateful data externalized to Redis/PostgreSQL
- [ ] No sticky sessions required
- [ ] Health endpoints return accurate cross-instance state
- [ ] Graceful shutdown handlers clean up properly
- [ ] Pod disruption budgets configured

---

## Common Anti-Patterns Found

### ❌ Anti-Pattern 1: Module-Level State
```typescript
// FOUND IN: Multiple services
const cache = new Map<string, Data>();
export function getCached(id: string) { ... }
```
**Fix:** Use Redis or inject cache dependency

### ❌ Anti-Pattern 2: Singleton with Stateful Map
```typescript
// FOUND IN: CircuitBreakerManager, CacheManager
class Manager {
  private static instance: Manager;
  private items = new Map(); // STATE!
  static getInstance() { ... }
}
```
**Fix:** Share state via Redis, or make truly stateless

### ❌ Anti-Pattern 3: In-Memory Queue
```typescript
// FOUND IN: MusicGenerationQueueService
class QueueService {
  private queue: Job[] = []; // LOST ON RESTART!
}
```
**Fix:** Use BullMQ + Redis

---

## Verification Commands

### Check for In-Memory State Patterns
```bash
# Find Maps/Sets
grep -rn "new Map()" --include="*.ts" packages/services/
grep -rn "private.*Map<" --include="*.ts" packages/services/

# Find in-memory queues
grep -rn "queue.*\[\]" --include="*.ts" packages/services/

# Find singletons
grep -rn "getInstance()" --include="*.ts" packages/services/
```

### Verify Redis Usage
```bash
# Check Redis clients
grep -rn "createClient\|ioredis" --include="*.ts" packages/services/

# Verify distributed patterns
grep -rn "RedisCache\|RedisQueue" --include="*.ts" packages/services/
```

---

## Migration Tracking

### Phase 0: Infrastructure Prerequisites
- [ ] Deploy Redis cluster with HA and operational SLOs
- [ ] Configure S3/GCS object storage buckets
- [ ] Set up BullMQ workers and dashboard

### Phase 1: Critical (Must Fix)
- [x] music-service: MusicGenerationQueueService → BullMQ
- [x] music-service: MusicTaskTracker → Redis hash
- [x] storage-service: ResumableUploadUseCase → Redis (RedisUploadSessionStore)
- [ ] storage-service: Local filesystem → S3/GCS object storage
- [x] api-gateway: IdempotencyMiddleware → Remove memory fallback (Redis required in production)
- [ ] api-gateway: ErrorLogStore → External logging
- [x] system-service: CircuitBreakerManager → Redis-backed (RedisCircuitBreaker in platform-core)

### Phase 2: High Priority
- [ ] api-gateway: ServiceDiscovery → Redis/etcd
- [ ] system-service: FallbackServiceRegistry → Redis
- [ ] ai-analytics-service: SystemHealthService → Redis
- [ ] storage-service: FileVersioningUseCase → PostgreSQL

### Phase 3: Medium Priority
- [ ] ai-config-service: CredentialsResolver → Redis
- [ ] ai-content-service: ContentTemplateService → Redis
- [ ] ai-config-service: CacheService → Redis
