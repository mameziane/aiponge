# Aiponge Architecture

This document describes the folder structure and architectural patterns used in the Aiponge codebase.

## Monorepo Structure

```
packages/
├── services/           # Backend microservices
│   ├── api-gateway/    # API Gateway (port 8080)
│   ├── user-service/   # User management, auth, credits
│   ├── music-service/  # Music streaming, tracks, albums
│   ├── storage-service/ # File storage, uploads
│   ├── system-service/ # Health, monitoring, notifications
│   ├── ai-config-service/ # AI provider configuration
│   ├── ai-content-service/ # AI content generation
│   └── ai-analytics-service/ # AI analytics, metrics
├── platform-core/      # Shared utilities and types
└── apps/
    └── aiponge/        # Expo/React Native mobile app
```

## Service Internal Structure

Each microservice follows Clean Architecture with these layers:

```
src/
├── domains/            # Domain layer - entities, value objects, repository interfaces
│   ├── entities/       # Domain entities with business logic
│   ├── value-objects/  # Immutable value types
│   └── repositories/   # Repository interfaces (contracts)
├── application/        # Application layer - use cases, services
│   ├── use-cases/      # Single-purpose use case classes
│   ├── services/       # Application services
│   └── errors/         # Application-specific errors
├── infrastructure/     # Infrastructure layer - implementations
│   ├── database/       # Database connection, Drizzle setup
│   ├── repositories/   # Repository implementations
│   ├── providers/      # External service providers
│   └── events/         # Event publishers
├── presentation/       # Presentation layer - API routes
│   ├── routes/         # Express route definitions
│   ├── controllers/    # Request handlers
│   └── utils/          # Response helpers
├── schema/             # Drizzle ORM table definitions
└── config/             # Service configuration
```

## Folder Organization Guidelines

### When to Create Subfolders

| Scenario | Action |
|----------|--------|
| 1 file | Keep in parent folder with naming suffix |
| 2 files | Keep in parent folder with naming suffix |
| 3+ files | Create a subfolder |

### Naming Conventions

Use layer suffixes for files:
- `Alert.entity.ts` - Domain entity
- `Alert.repository.ts` - Repository interface
- `AlertRepository.impl.ts` - Repository implementation
- `CreateAlert.use-case.ts` - Use case
- `Alert.service.ts` - Application service

### Maximum Nesting Depth

Keep folders within 3 levels per service:
```
src/{layer}/{feature}/[file.ts]
```

Reserve a 4th level only for complex submodules (e.g., AI pipelines).

### Subdomain Boundaries

Some services have intentional bounded contexts with their own Clean Architecture layers:

**system-service subdomains:**
- `discovery/` - Service discovery and orchestration
- `monitoring/` - Health checks, alerts, metrics
- `notification/` - Push notifications, email, in-app

These subdomains have their own `application/`, `domain/`, `infrastructure/` layers.

## Barrel Exports (Index Files)

High-usage directories have `index.ts` barrel exports for cleaner imports:

```typescript
// Preferred: Barrel import
import { FileEntity, FileMetadata } from '../../domains/entities';

// Acceptable: Direct import (existing code)
import { FileEntity } from '../../domains/entities/FileEntity';
```

**Available barrels:**
- `storage-service`: `domains/entities`, `domains/value-objects`, `infrastructure/database`, `infrastructure/config`, `infrastructure/events`, `infrastructure/services`
- `system-service`: `domains/entities`, `domains/value-objects`, `application/use-cases`
- `ai-content-service`: `domains/entities`, `domains/value-objects`

## Database Schema Conventions

- Table prefix by service: `usr_`, `mus_`, `stg_`, `sys_`, `aic_`, `aia_`, `cfg_`
- Use Drizzle ORM with `npm run db:push` for schema changes
- Never manually write SQL migrations

## API Routing

- API Gateway proxies requests to microservices
- Routes follow pattern: `/api/{domain}/{resource}`
- User-service mounts routes at `app.use('/api', routes)`

## Import Path Aliases

Each service has these path aliases in tsconfig:
- `@/` - src root
- `@aiponge/` - platform-core shared contracts
