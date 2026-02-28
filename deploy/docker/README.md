# Docker Infrastructure

This directory contains Docker infrastructure files that integrate with Aiponge's unified port configuration system.

## Files Overview

| File                        | Purpose                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `docker-compose.common.yml` | Shared base: infrastructure services, common env anchors, base service definitions |
| `docker-compose.yml`        | Development overlay: build-from-source, source volumes, Jaeger tracing             |
| `docker-compose.prod.yml`   | Production overlay: pre-built images, resource limits, secrets                     |
| `Dockerfile.service`        | Generic Dockerfile for all microservices                                           |

## Quick Start

### 1. Setup Environment Variables

```bash
source deploy/docker/docker-env-setup.sh
```

### 2. Launch Services

**Development:**

```bash
docker compose -f deploy/docker/docker-compose.common.yml -f deploy/docker/docker-compose.yml up
```

**Production:**

```bash
docker compose -f deploy/docker/docker-compose.common.yml -f deploy/docker/docker-compose.prod.yml up
```

**Services only (external database/redis):**

```bash
docker compose -f deploy/docker/docker-compose.common.yml -f deploy/docker/docker-compose.yml up \
  system-service storage-service user-service ai-config-service ai-content-service \
  ai-analytics-service music-service api-gateway
```

## Architecture

The compose setup uses Docker Compose's multi-file merge feature:

- `docker-compose.common.yml` defines all services with shared environment variables (via YAML anchors), ports, networks, dependencies, and healthchecks. It also defines infrastructure services (PostgreSQL, Redis, Kafka, Zookeeper) with dev-friendly defaults.

- `docker-compose.yml` (dev) adds build contexts, source-code volume mounts, and Jaeger for local tracing.

- `docker-compose.prod.yml` (prod) replaces build with pre-built images, adds resource limits, secrets, and production-specific configuration.

When using `-f` with multiple files, later files merge into earlier ones — environment variables combine (later overrides same-key values), and new keys are added.

## Port Configuration

All ports are dynamically resolved from the unified port configuration:

### Backend Services

- **API Gateway**: `${API_GATEWAY_PORT}` (default: 8080)
- **System Service**: `${SYSTEM_SERVICE_PORT}` (default: 3001)
- **Storage Service**: `${STORAGE_SERVICE_PORT}` (default: 3002)
- **User Service**: `${USER_SERVICE_PORT}` (default: 3003)
- **AI Config Service**: `${AI_CONFIG_SERVICE_PORT}` (default: 3004)
- **AI Content Service**: `${AI_CONTENT_SERVICE_PORT}` (default: 3005)
- **AI Analytics Service**: `${AI_ANALYTICS_SERVICE_PORT}` (default: 3006)
- **Music Service**: `${MUSIC_SERVICE_PORT}` (default: 3007)

### Infrastructure

- **PostgreSQL**: `${POSTGRESQL_PORT}` (default: 5432)
- **Redis**: `${REDIS_PORT}` (default: 6379)
- **Kafka**: 9092

_All port assignments are managed through `packages/platform-core/src/config/services-definition.ts`._

## Scalability Configuration

All scalability features are controlled via environment variables with sensible defaults.

### Graceful Shutdown

| Variable              | Default | Description                                     |
| --------------------- | ------- | ----------------------------------------------- |
| `SHUTDOWN_TIMEOUT_MS` | `30000` | Maximum time (ms) to wait for graceful shutdown |

### Database

| Variable                    | Default                  | Description                           |
| --------------------------- | ------------------------ | ------------------------------------- |
| `DATABASE_POOL_MAX`         | `10` (dev) / `20` (prod) | Maximum database connection pool size |
| `STATEMENT_TIMEOUT_MS`      | `30000`                  | SQL statement timeout in milliseconds |
| `USER_DATABASE_REPLICA_URL` | _(unset)_                | Read replica URL for user-service     |

### Redis

| Variable              | Default   | Description                                              |
| --------------------- | --------- | -------------------------------------------------------- |
| `REDIS_CLUSTER_NODES` | _(unset)_ | Comma-separated `host:port` pairs for Redis Cluster mode |

### API Gateway

| Variable                    | Default   | Description                                   |
| --------------------------- | --------- | --------------------------------------------- |
| `MAINTENANCE_MODE`          | `false`   | Enable maintenance mode (returns 503)         |
| `MAINTENANCE_RETRY_AFTER`   | `300`     | `Retry-After` header value in seconds         |
| `MAINTENANCE_MESSAGE`       | _(empty)_ | Custom maintenance message                    |
| `SSE_HEARTBEAT_MS`          | `30000`   | Server-Sent Events heartbeat interval         |
| `RATE_LIMIT_WINDOW_MS`      | `900000`  | Rate limiting window duration (ms)            |
| `RATE_LIMIT_MAX_REQUESTS`   | `100`     | Maximum requests per window                   |
| `RATE_LIMIT_AUTH_MAX`       | `20`      | Maximum auth-related requests per window      |
| `RATE_LIMIT_STRICT_MAX`     | `10`      | Maximum requests for strict-limited endpoints |
| `RATE_LIMIT_LENIENT_MAX`    | `200`     | Maximum requests for lenient endpoints        |
| `BODY_SIZE_LIMIT`           | `10mb`    | Maximum request body size                     |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1`     | Sentry performance tracing sample rate        |

### Background Processing

| Variable                   | Default | Description                                 |
| -------------------------- | ------- | ------------------------------------------- |
| `QUEUE_WORKER_CONCURRENCY` | `5`     | BullMQ worker concurrency for music-service |

### Cache TTLs

| Variable            | Default | Description                  |
| ------------------- | ------- | ---------------------------- |
| `CACHE_TTL_DEFAULT` | `300`   | Default cache TTL in seconds |

### Scaling Example

```bash
export USER_DATABASE_REPLICA_URL=postgres://user:pass@replica-host:5432/userdb
export REDIS_CLUSTER_NODES=redis1:6379,redis2:6379,redis3:6379
export DATABASE_POOL_MAX=50
docker compose -f deploy/docker/docker-compose.common.yml -f deploy/docker/docker-compose.prod.yml up
```
