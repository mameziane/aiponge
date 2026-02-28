# aiponge

AI-powered platform integrating psychological wellness tools with music streaming. Delivers personalized AI-generated content (music, art, affirmations) and a Virtual Mentor Chat System.

## Architecture

```
aiponge/
├── apps/
│   └── aiponge/               # Expo/React Native mobile app
├── packages/
│   ├── services/              # Microservices (see below)
│   ├── platform-core/         # Shared platform utilities
│   ├── shared/                # Shared contracts & types
│   ├── auth-middleware/        # JWT authentication middleware
│   ├── correlation/           # Request correlation IDs
│   ├── http-client/           # HTTP client with retries
│   └── service-registry/      # Service discovery
├── deploy/
│   └── docker/                # Docker configurations
└── docs/                      # Documentation
```

## Microservices

| Service                | Port | Description                                     |
| ---------------------- | ---- | ----------------------------------------------- |
| `system-service`       | 3001 | Service discovery, monitoring, notifications    |
| `storage-service`      | 3002 | File storage (S3, GCS, Cloudinary)              |
| `user-service`         | 3003 | Authentication, profiles, library, billing      |
| `ai-config-service`    | 3004 | AI provider configuration, credentials          |
| `ai-content-service`   | 3005 | AI content generation, prompt templates         |
| `ai-analytics-service` | 3006 | Request tracing, usage analytics                |
| `music-service`        | 3007 | Music generation, streaming, playlists          |
| `api-gateway`          | 8080 | Unified API entry point, routing, rate limiting |

## Prerequisites

- **Node.js** >= 20.19.0
- **npm** >= 11.6.3
- **PostgreSQL** >= 15 (or Neon)
- **Redis** >= 7 (optional for development, required for production)

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd aiponge
npm install

# 2. Configure environment variables
cp docs/.env.example .env
# Edit .env with your values (see Environment Variables section below)

# 3. Push database schema
npm run db:push

# 4. Start all services in development
npm run dev

# 5. Verify the API Gateway is running
curl http://localhost:8080/health
```

## Environment Variables

Copy `docs/.env.example` to `.env` at the project root. Each service also has its own `.env.example` for service-specific configuration.

### Required Variables

| Variable         | Description                       | Example                                         |
| ---------------- | --------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string      | `postgresql://user:pass@localhost:5432/aiponge` |
| `JWT_SECRET`     | JWT signing secret (min 32 chars) | `openssl rand -base64 32`                       |
| `OPENAI_API_KEY` | OpenAI API key for AI features    | `sk-...`                                        |

### Optional Variables

| Variable               | Description                          | Default                  |
| ---------------------- | ------------------------------------ | ------------------------ |
| `REDIS_URL`            | Redis connection string              | `redis://localhost:6379` |
| `NODE_ENV`             | Environment mode                     | `development`            |
| `LOG_LEVEL`            | Logging verbosity                    | `info`                   |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins      | `http://localhost:5000`  |
| `SENTRY_DSN`           | Sentry error tracking DSN            | (empty)                  |
| `MUSICAPI_API_KEY`     | MusicAPI.ai key for music generation |                          |
| `ANTHROPIC_API_KEY`    | Anthropic API key (optional)         |                          |
| `ELEVENLABS_API_KEY`   | ElevenLabs API key (optional)        |                          |

### Service-Specific .env.example Files

Each service has its own `.env.example` documenting all variables it uses:

```
packages/services/api-gateway/.env.example
packages/services/system-service/.env.example
packages/services/storage-service/.env.example
packages/services/user-service/.env.example
packages/services/ai-config-service/.env.example
packages/services/ai-content-service/.env.example
packages/services/ai-analytics-service/.env.example
packages/services/music-service/.env.example
packages/platform-core/.env.example
```

## Database Setup

The project uses PostgreSQL with Drizzle ORM.

```bash
# Push schema to database (creates tables if they don't exist)
npm run db:push

# If schema changes cause data-loss warnings in development:
npm run db:push -- --force
```

Each microservice manages its own database tables via Drizzle schemas. The `DATABASE_URL` environment variable configures the connection.

## Development

```bash
# Start all services (uses Turborepo for orchestration)
npm run dev

# Start a single service
npm run dev:api-gateway
npm run dev:user-service
npm run dev:music-service
# etc.

# Type checking
npm run typecheck

# Linting
npm run lint

# Run all tests
npm test

# Generate service configuration manifests
npm run generate:config
```

### Service Ports

Ports are auto-configured from `packages/platform-core/src/config/services-definition.ts`. Do not set port variables in `.env` — they are generated automatically via `npm run generate:config` (runs on `postinstall`, `predev`, `prebuild`).

## Docker

### Build a Single Service

```bash
docker build \
  --build-arg SERVICE_PATH=packages/services/api-gateway \
  --build-arg SERVICE_PORT=8080 \
  -f deploy/docker/Dockerfile.service \
  -t aiponge-api-gateway .
```

### Run with Docker Compose (Production)

```bash
# Production compose (all services with resource limits)
docker compose -f deploy/docker/docker-compose.prod.yml up -d

# Development compose
docker compose -f deploy/docker/docker-compose.yml up -d
```

### Docker Configuration

- `deploy/docker/Dockerfile.service` — Parametric multi-stage Dockerfile for all services
- `deploy/docker/docker-compose.yml` — Development compose
- `deploy/docker/docker-compose.prod.yml` — Production compose with resource limits
- `.dockerignore` — Excludes unnecessary files from Docker context

## Tech Stack

- **Frontend**: React Native, Expo, NativeWind, Zustand
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (Neon), Drizzle ORM
- **Cache**: Redis (ioredis)
- **AI Providers**: OpenAI, Anthropic, Stability AI, ElevenLabs, MusicAPI
- **Storage**: AWS S3, Google Cloud Storage, Cloudinary
- **Build**: Turborepo, esbuild, tsx
- **Testing**: Vitest, supertest
- **Deployment**: Docker, Kubernetes, GitHub Actions CI/CD

## Key Patterns

### Clean Architecture

Each service follows Clean Architecture with layers:

- `domains/` — Business entities and domain logic
- `application/` — Use cases and application services
- `infrastructure/` — Database, external APIs, repositories
- `presentation/` — Controllers, routes, middleware

### Path Aliases

All services use TypeScript path aliases:

```typescript
import { UserEntity } from '@domains/identity';
import { UserRepository } from '@infrastructure/repositories';
```

### Barrel Exports

Modules expose functionality through `index.ts` files:

```typescript
import { AuthController, ProfileController } from '@presentation/controllers';
```

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- `build-test.yml` — Lint, test, type-check, Docker build, Trivy vulnerability scanning
- `deploy-aws.yml` — Deploy to AWS ECS with post-deployment smoke tests
- `.github/dependabot.yml` — Automated dependency updates

## Documentation

- [Docker Usage](./deploy/docker/DOCKERFILE_USAGE.md)
- [Environment Configuration](./docs/.env.example)
- [Production Environment](./docs/.env.production.example)

## License

Proprietary - All rights reserved.
