# CLAUDE.md — aiponge

## Project

AI-powered wellness platform: personalized music, art, affirmations, and Virtual Mentor Chat. Mobile-first (Expo/React Native) with microservices backend.

## Monorepo Layout

```
apps/aiponge/              → Expo/React Native mobile app (port 3020)
packages/platform-core/    → Shared utilities (logger, health, errors, auth, circuit breaker)
packages/shared/contracts/ → API contracts, types, Zod schemas, constants
packages/shared/test-utils/→ Vitest helpers
packages/services/
  api-gateway/             → Routing, rate limiting, auth (port 8080)
  system-service/          → Discovery, monitoring, notifications (port 3001)
  storage-service/         → File storage, uploads, S3/GCS (port 3002)
  user-service/            → Auth, profiles, library, billing (port 3003)
  ai-config-service/       → AI provider config, circuit breaker (port 3004)
  ai-content-service/      → Content generation, prompt templates (port 3005)
  ai-analytics-service/    → Usage analytics, metrics (port 3006)
  music-service/           → Music generation, streaming (port 3007)
deploy/                    → Docker, Terraform, docker-compose
```

## Commands

```bash
npm run dev                    # Start all services (Turborepo, 11 concurrent)
npm run dev:aiponge-minimal    # Minimal service set with orchestrator
npm run dev:{service-name}     # Start individual service
npm run build                  # Build all
npm run test                   # Vitest all packages
npm run lint                   # ESLint all packages
npm run typecheck              # tsc --noEmit all
npm run db:push                # Drizzle schema push
npm run generate:config        # Generate service port configs (runs on postinstall)
npm run quality-check          # lint + format + typecheck (per service)
npm run full-quality-check     # All quality checks (per service)
```

## Architecture Rules (MUST FOLLOW)

### Clean Architecture — every service uses this structure:

```
src/domains/         → Entities, value objects, repository interfaces
src/application/     → Use cases (single-purpose classes), application services
src/infrastructure/  → DB schemas (Drizzle), repository impls, external API clients
src/presentation/    → Routes, controllers (thin wrappers), middleware
```

**Dependency flow: Presentation → Application → Domain ← Infrastructure**

- Entities NEVER import from infrastructure
- Use cases depend on repository INTERFACES, not implementations
- Controllers are thin — no business logic, just delegate to use cases
- ServiceFactory is the single composition root for DI

### Cross-Service Rules

- NO shared databases between services
- NO direct imports from another service's internals — use `@aiponge/shared-contracts`
- Inter-service calls go through typed ServiceClients with circuit breaker
- Async communication via Redis Pub/Sub event bus (UserEvent, MusicEvent, AnalyticsEvent)
- All events include correlationId, timestamp, source service

## Key Patterns (ALWAYS use these)

### Content Visibility (ABAC)

- All content has `visibility`: personal | shared | public
- ALWAYS use helper functions: `canViewContent()`, `isContentShared()`, `isContentPublic()`
- NEVER do raw comparisons like `=== CONTENT_VISIBILITY.SHARED` in business logic
- DB queries CAN use constants directly for performance
- Content is PRIVATE by default (`CONTENT_VISIBILITY.PERSONAL`)

### Content Lifecycle State Machine

- Statuses: draft → active → published → archived → deleted
- Domain extensions: TRACK_LIFECYCLE adds `processing`, AI_CONTENT_LIFECYCLE adds `generated`/`reviewed`
- ALWAYS call `assertValidTransition(from, to, map, domainName)` before status changes

### Role vs Tier — never mix these

- **Roles** (admin/librarian/user) → authorization (who can do what): `contextIsAdmin()`, `contextIsLibrarian()`
- **Tiers** (guest/explorer/personal/practice/studio) → feature access (what's available): `isPaidTier()`, `getTierConfig()`

### API Responses — strict format

```typescript
{ success: true, data: T, message?: string }
{ success: false, error: { code: string, message: string, correlationId: string } }
```

### Error Handling

- Extend `BaseError` with domain-specific subclasses
- Use `ServiceErrors.fromException()` for unexpected errors
- Never throw raw Error — always use structured errors with error codes

### AI Providers

- All providers registered in DB (`cfg_provider_configs`)
- NEVER call AI providers directly — use ProviderProxy (circuit breaker, health, load balancing)
- Prompts stored in DB as Handlebars templates (`aic_prompt_templates`) — never hardcode

### Scheduling

- All cron jobs extend `BaseScheduler`, registered with `SchedulerRegistry`
- NEVER use raw `setInterval`, `setTimeout`, or direct `cron`

### Frontend State (mobile app)

- **Zustand** → client UI state only (generation progress, search filters)
- **React Query** → server state (API data, caching, sync)
- **React Context** → SDK wrappers (audio player, RevenueCat subscriptions)
- NEVER duplicate server data in Zustand stores

## Naming Conventions

### Database Tables

Each service owns its tables with prefix: `usr_*`, `lib_*`, `mus_*`, `stg_*`, `sys_*`, `cfg_*`, `aic_*`, `aia_*`

### Field Names (enforced, no synonyms)

| Use                  | NOT                        |
| -------------------- | -------------------------- |
| coverArtworkUrl      | coverUrl, coverImage       |
| artworkUrl           | imageUrl, pictureUrl       |
| coverIllustrationUrl | bookCoverUrl, bookImage    |
| reference            | externalId, refId          |
| type                 | kind, category             |
| userDate             | entryDate, createdDate     |
| depthLevel           | depth (as number)          |
| targetLanguages      | languages, outputLanguages |
| culturalLanguages    | bilingualLanguages         |
| visibility           | privacy, accessLevel       |

## Code Style

- TypeScript strict mode, ES2022 target, ESM modules
- Prettier: single quotes, trailing commas (es5), 120 char width, 2-space indent, semicolons
- Max cognitive complexity: 15 per function
- Max function length: 100 lines
- Max parameters: 6
- No `console.log` in services — use Winston logger
- Pre-commit hooks: secret detection, lint-staged, config generation

## Tech Stack Quick Reference

**Backend:** Node.js 20+, Express, TypeScript 5.6, Drizzle ORM, PostgreSQL (Neon), Redis, BullMQ, Zod, Winston, Sentry
**Frontend:** Expo 54, React Native 0.81, React 19, Expo Router v6, NativeWind, Zustand, React Query, RevenueCat
**AI:** OpenAI, Anthropic, Stability AI, ElevenLabs, MusicAPI.ai
**Build:** Turborepo, esbuild, Metro
**Deploy:** Docker (parametric multi-stage), Terraform, AWS ECS, GitHub Actions, EAS
**Testing:** Vitest, supertest, k6 load testing

## Database

- ORM: Drizzle (schema-first, `npm run db:push`)
- Each service has its own schema files in `src/infrastructure/database/schemas/`
- Drizzle config per service with `tablesFilter` matching its prefix
- Transactions via `db.transaction()` for multi-table atomics

## Testing

- Vitest with globals, 30s timeout
- Unit tests: `src/**/*.test.ts` in each service
- Integration tests: `tests/integration/`
- Load tests: `tests/load/scripts/` (k6)
- Coverage thresholds: 50% statements, 40% branches, 45% functions, 50% lines

## Service Startup Order

1. PostgreSQL, Redis
2. system-service → storage-service → user-service
3. ai-config-service → ai-content-service → ai-analytics-service → music-service → api-gateway
4. Mobile app (Metro bundler)
