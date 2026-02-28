# Event Bus Resilience and Multi-Pod Architecture

This document describes the resilience patterns and Kubernetes deployment considerations for Aiponge's Redis Pub/Sub event bus architecture.

## Architecture Overview

The event bus uses Redis Pub/Sub for cross-service communication, with an automatic in-memory fallback when Redis is unavailable. This provides both high throughput for event delivery and graceful degradation.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     music       │     │  ai-content     │     │   api-gateway   │
│    service      │     │    service      │     │                 │
│  (3 replicas)   │     │  (2 replicas)   │     │  (4 replicas)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────┬───────┴───────────────────────┘
                         │
                    ┌────▼────┐
                    │  Redis  │
                    │ Cluster │
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
    │ai-config│    │analytics │    │ system  │
    │ service │    │ service  │    │ service │
    └─────────┘    └──────────┘    └─────────┘
```

## Event Types and Channels

### Analytics Events (Fire-and-Forget)

- `aiponge:events:analytics.events.batch` - Batched analytics events
- `aiponge:events:analytics.metric.recorded` - Individual metrics
- `aiponge:events:analytics.provider.usage` - AI provider usage tracking

### Config Invalidation Events

- `aiponge:events:config.template.invalidated` - Prompt template changes
- `aiponge:events:config.provider.invalidated` - Provider config changes
- `aiponge:events:config.cache.invalidate` - General cache invalidation

## Kubernetes Deployment Patterns

### Multiple Pod Subscription

When services run with multiple replicas, each pod subscribes independently to Redis channels. This means:

1. **All pods receive all events** - Redis Pub/Sub broadcasts to all subscribers
2. **Idempotent handlers required** - Handlers must be safe to run multiple times
3. **At-least-once delivery** - Events may be delivered multiple times across pods

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: music-service
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: music
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-credentials
                  key: url
```

### Event Handler Idempotency

All event handlers must be idempotent. The `ConfigEventSubscriber` pattern demonstrates this:

```typescript
class ConfigEventSubscriber {
  private templateCache = new LRUCache<string, Template>({ max: 500 });

  async handleTemplateInvalidated(event: StandardEvent): Promise<void> {
    const { templateId } = event.data;

    // Idempotent: deleting a non-existent key is a no-op
    this.templateCache.delete(templateId);

    logger.debug('Template cache invalidated', { templateId });
  }
}
```

### Preventing Duplicate Processing

For events that must be processed exactly once (not applicable to current fire-and-forget analytics), use Redis-based distributed locking:

```typescript
async handleEventOnce(event: StandardEvent): Promise<void> {
  const lockKey = `aiponge:locks:${event.eventId}`;
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 300);

  if (!acquired) {
    logger.debug('Event already being processed', { eventId: event.eventId });
    return;
  }

  try {
    await this.processEvent(event);
  } finally {
    await redis.del(lockKey);
  }
}
```

## Resilience Patterns

### 1. Memory Fallback Mode

When Redis is unavailable, the event bus operates in memory-only mode:

```typescript
if (!process.env.REDIS_URL) {
  // In-memory event distribution within the pod
  this.inMemorySubscribers.get(event.type)?.forEach(cb => cb(event));
}
```

**Limitations in memory mode:**

- Events only delivered within the same pod
- No cross-service communication
- Suitable for development and single-pod deployments

### 2. Fire-and-Forget Pattern

Analytics events use fire-and-forget to prevent blocking the main request:

```typescript
recordEvent(event: AnalyticsEventData): void {
  try {
    this.eventBusClient.publish(standardEvent).catch(error => {
      logger.debug('Analytics publish failed (non-blocking)', { error });
    });
  } catch (error) {
    // Never throw - analytics failures must not affect business logic
    logger.debug('Analytics queueing failed (non-blocking)', { error });
  }
}
```

### 3. Connection Recovery

The Redis client automatically reconnects on connection loss:

```typescript
this.pubClient.on('error', err => {
  logger.error('Redis connection error', { error: err.message });
});

this.pubClient.on('reconnecting', () => {
  logger.info('Redis client reconnecting');
});
```

### 4. Graceful Shutdown

Services flush pending events during shutdown:

```typescript
async shutdown(): Promise<void> {
  await this.eventPublisher.flushEvents();
  await this.eventBusClient.disconnect();
  logger.info('Event bus client shutdown complete');
}
```

## Metrics Integration

### Registering Event Bus Metrics

To expose event bus metrics via Prometheus, services must register their metrics instance:

```typescript
import { createMetrics, registerEventBusMetrics } from '@aiponge/platform-core';

// In service initialization
const metrics = createMetrics('music-service');
registerEventBusMetrics('music-service', metrics);

// Event bus will now record metrics to the shared PrometheusMetrics instance
// Metrics are exposed at GET /metrics
```

### Available Metrics

| Metric                                               | Type    | Description                       |
| ---------------------------------------------------- | ------- | --------------------------------- |
| `aiponge_<service>_event_bus_events_published_total` | Counter | Events published via event bus    |
| `aiponge_<service>_event_bus_events_received_total`  | Counter | Events received via subscriptions |
| `aiponge_<service>_event_bus_publish_errors_total`   | Counter | Failed publish attempts           |
| `aiponge_<service>_event_bus_subscribe_errors_total` | Counter | Failed subscription handling      |
| `aiponge_<service>_event_bus_connection_status`      | Gauge   | 1 if connected, 0 if not          |
| `aiponge_<service>_analytics_events_queued_total`    | Gauge   | Pending events in queue           |
| `aiponge_<service>_analytics_events_published_total` | Counter | Analytics events published        |
| `aiponge_<service>_config_cache_invalidations_total` | Counter | Cache invalidations processed     |

## Health Monitoring

### Health Check Endpoints

Services expose event bus status in health checks:

```typescript
// GET /health/ready
{
  "ready": true,
  "checks": {
    "eventBus": {
      "connected": true,
      "redisEnabled": true
    }
  }
}
```

### Kubernetes Liveness/Readiness Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 15

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Operational Runbook

### Redis Cluster Failure

**Symptoms:**

- Services report `redisEnabled: false` in health checks
- Events not propagating between services
- Cache invalidation not working

**Resolution:**

1. Check Redis cluster health: `redis-cli -h $REDIS_HOST ping`
2. Services auto-fallback to memory mode
3. Restart pods after Redis recovery to re-establish connections

### Event Delivery Lag

**Symptoms:**

- High latency in analytics dashboard
- Stale cache entries persisting

**Resolution:**

1. Check Redis Pub/Sub backlog: `redis-cli pubsub channels 'aiponge:events:*'`
2. Scale analytics-service consumers if needed
3. Review batch sizes in publisher configuration

### Manual Cache Invalidation

If automated invalidation fails:

```bash
# Trigger manual cache clear via admin API
curl -X POST http://api-gateway/api/admin/cache/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"pattern": "aiponge:*:templates:*"}'
```

## Configuration Reference

### Environment Variables

| Variable                      | Description             | Default       |
| ----------------------------- | ----------------------- | ------------- |
| `REDIS_URL`                   | Redis connection string | (memory mode) |
| `EVENT_BUS_BATCH_SIZE`        | Events per batch        | 100           |
| `EVENT_BUS_BATCH_INTERVAL_MS` | Batch interval          | 30000         |

### Event Schema Version

All events include a `version` field for schema evolution:

```typescript
{
  eventId: 'evt_abc123',
  type: 'analytics.events.batch',
  version: '1.0',  // Schema version
  timestamp: '2024-12-22T10:30:00Z',
  source: 'music-service',
  data: { ... }
}
```

## Migration Notes

### HTTP to Event Bus Migration (Completed)

Analytics recording methods (`recordEvent`, `recordEvents`, `recordMetric`) have been migrated from HTTP to event bus:

**Before (HTTP):**

```typescript
await httpClient.post('/api/events/batch', { events });
```

**After (Event Bus):**

```typescript
eventPublisher.recordEvents(events); // Fire-and-forget
```

HTTP endpoints are retained only for query operations that require synchronous responses (e.g., `getMusicAnalytics`, `getSystemAnalytics`).
