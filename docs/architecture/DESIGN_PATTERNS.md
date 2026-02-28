# aiponge Design Patterns

This document defines the enforced design patterns across the aiponge codebase. All new code must follow these patterns. Deviations require explicit approval.

---

## Table of Contents

1. [Content Access & Visibility](#1-content-access--visibility)
2. [Constants & Types](#2-constants--types)
3. [API Contracts](#3-api-contracts)
4. [Logging](#4-logging)
5. [Request Tracking](#5-request-tracking)
6. [HTTP Responses](#6-http-responses)
7. [Controller Boilerplate](#7-controller-boilerplate)
8. [Clean Architecture](#8-clean-architecture)
9. [Entity Delegation Chain](#9-entity-delegation-chain)
10. [Creator-Member Content Model](#10-creator-member-content-model)
11. [Role vs Tier](#11-role-vs-tier)
12. [Resilience](#12-resilience)
13. [Caching](#13-caching)
14. [Scheduling](#14-scheduling)
15. [Event Bus](#15-event-bus)
16. [Service Clients](#16-service-clients)
17. [Error Handling](#17-error-handling)
18. [Auth Context](#18-auth-context)
19. [Health Probes](#19-health-probes)
20. [Service Discovery](#20-service-discovery)
21. [Frontend State Management](#21-frontend-state-management)
22. [Frontend API Client](#22-frontend-api-client)
23. [Cross-Service Integrity](#23-cross-service-integrity)
24. [Privacy by Default](#24-privacy-by-default)
25. [AI Provider Architecture](#25-ai-provider-architecture)
26. [Prompt Templates](#26-prompt-templates)
27. [Bounded-Context Modules](#27-bounded-context-modules)
28. [Field Name Conventions](#28-field-name-conventions)
29. [Unified Music Tables](#29-unified-music-tables)
30. [Unified Generation Services](#30-unified-generation-services)
31. [Centralized Music Visibility](#31-centralized-music-visibility)
32. [Content Promotion](#32-content-promotion)
33. [Multi-Language Generation Naming](#33-multi-language-generation-naming)

---

## 1. Content Access & Visibility

**Pattern:** Centralized Attribute-Based Access Control (ABAC)

**Location:** `shared-contracts/common/content-access.ts`

**How it works:**

- Pure functions decide access: `canViewContent()`, `canEditContent()`, `canDeleteContent()`
- Visibility helpers for comparisons: `isContentShared()`, `isContentPublic()`, `isContentPersonal()`, `isContentPubliclyAccessible()`
- Each service resolves its own `accessibleCreatorIds` but delegates all access decisions to shared policy
- DB-level SQL filtering stays inline in repositories for performance
- Shared policy is used for single-item authorization checks

**Enforcement rules:**

- In application/business logic, NEVER write `=== CONTENT_VISIBILITY.SHARED` or `!== CONTENT_VISIBILITY.PUBLIC` — use helper functions instead
- ALWAYS use the helper functions: `isContentShared(visibility)`, `isContentPublic(visibility)`, etc.
- `CONTENT_VISIBILITY` constants are allowed for: default values on creation, DB query filter values (e.g., `eq(table.visibility, CONTENT_VISIBILITY.SHARED)`), and response values
- In repository SQL queries, direct constant comparisons are acceptable for performance (e.g., Drizzle `eq()` calls)
- For nullable visibility fields, use `?? CONTENT_VISIBILITY.PERSONAL` (not `|| ''`)

```typescript
// CORRECT — business logic uses helpers
import { isContentShared, canViewContent, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
const shared = isContentShared(track.visibility ?? CONTENT_VISIBILITY.PERSONAL);
const canView = canViewContent(resource, context);

// CORRECT — DB query uses constant directly
.where(eq(table.visibility, CONTENT_VISIBILITY.SHARED))

// WRONG — business logic uses raw comparison
if (track.visibility === CONTENT_VISIBILITY.SHARED) { ... }
if (visibility === 'shared') { ... }
```

---

## 2. Constants & Types

**Pattern:** Centralized typed constants with Zod schemas

**Location:** `shared-contracts/common/`

**How it works:**

- All domain constants defined as `const` objects with `as const`
- TypeScript types derived via `typeof X[keyof typeof X]`
- Matching Zod schema for each constant set

**Available constants:**
| Constant | File | Purpose |
|---|---|---|
| `CONTENT_VISIBILITY` | `status-types.ts` | personal/shared/public for all content |
| `USER_ROLES` | `roles.ts` | admin/librarian/user |
| `TIER_IDS` | `subscription-tiers.ts` | guest/explorer/personal/practice/studio |
| `PERMISSION` | `auth-context.ts` | Fine-grained permissions |
| `LIBRARY_SOURCE` | `status-types.ts` | shared/private/all for API filtering |
| `STORAGE_ACCESS_LEVEL` | `status-types.ts` | private/public/shared for file storage |
| `PROFILE_VISIBILITY` | `status-types.ts` | public/private/friends/connections/custom |
| `SONG_PRIVACY_LEVEL` | `status-types.ts` | private/friends/public for song sharing |
| `VISIBILITY_FILTER` | `status-types.ts` | Extends content visibility with user/all |

**Enforcement rules:**

- NEVER use string literals for any of the above — always import the constant
- NEVER create new synonym constants — check existing ones first
- Every new constant set must include: `const` object, TypeScript type, Zod schema

```typescript
// CORRECT
import { USER_ROLES, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
if (contextIsAdmin(context)) { ... }
visibility: CONTENT_VISIBILITY.PERSONAL

// WRONG
if (role === 'admin') { ... }
visibility: 'personal'
```

---

## 3. API Contracts

**Pattern:** Contract-First API with centralized Zod schemas

**Location:** `shared-contracts/api/input-schemas.ts`, `shared-contracts/api/*.ts`

**How it works:**

- All API input validation schemas centralized in shared-contracts
- Response schemas use `ServiceResponseSchema(T)` wrapper
- `validateInput()` and `validateAndExtract()` for request validation

**Enforcement rules:**

- NEVER write inline Zod schemas in routes — define them in shared-contracts
- All responses follow the `ServiceResponse<T>` shape: `{ success: true, data }` or `{ success: false, error }`
- Use `safeParseResponse()` when consuming responses from other services

---

## 4. Logging

**Pattern:** Consolidated structured logging

**Location:** `platform-core/src/logging/`

**How it works:**

- `createLogger(name)` or `getLogger(name)` from `@aiponge/platform-core`
- Structured JSON output with correlation IDs
- Consistent log levels: debug, info, warn, error

**Enforcement rules:**

- NEVER use `console.log`, `console.error`, or `console.warn`
- ALWAYS use `createLogger` or `getLogger` with a descriptive name
- Logger name convention: `'service-name-component'` (e.g., `'music-service-track-generation'`)
- Include structured context objects, not string interpolation

```typescript
// CORRECT
import { createLogger } from '@aiponge/platform-core';
const logger = createLogger('music-service-library');
logger.info('Track created', { trackId, userId, visibility });

// WRONG
console.log(`Track ${trackId} created by ${userId}`);
```

---

## 5. Request Tracking

**Pattern:** Correlation ID propagation

**Location:** `platform-core/src/auth/correlation.ts`

**How it works:**

- Every request gets a `x-correlation-id` header (generated if missing)
- Flows through all service-to-service calls
- Included in all log entries and error responses via `getCorrelationId(req)`

**Enforcement rules:**

- All service clients MUST forward correlation IDs in outgoing requests
- All error responses MUST include the correlation ID
- Use `getCorrelationId(req)` — never read the header manually

---

## 6. HTTP Responses

**Pattern:** Consolidated response helpers

**Location:** `platform-core/src/http/response-helpers.ts`

**How it works:**

- `createResponseHelpers(serviceName)` returns: `sendSuccess`, `sendCreated`, `ServiceErrors`
- `ServiceErrors` includes: `notFound`, `badRequest`, `unauthorized`, `forbidden`, `conflict`, `internal`, `database`, `fromException`

**Enforcement rules:**

- For standard CRUD controllers, use response helpers — avoid manual `res.status(X).json({...})`
- For controllers with diverse response shapes (e.g., auth flows with tokens, multi-step flows), explicit try-catch with manual responses is acceptable
- Error responses must use `ServiceErrors.fromException()` for unknown errors

```typescript
// CORRECT — standard controller
const { sendSuccess, ServiceErrors } = createResponseHelpers('music-service');
sendSuccess(res, { track }, 'Track retrieved');

// ALSO CORRECT — auth controller with non-standard response
try {
  const result = await authUseCase.execute(input);
  res.status(200).json({ token: result.token, user: result.user });
} catch (error) {
  ServiceErrors.fromException(res, error, 'Auth failed', req);
}
```

---

## 7. Controller Boilerplate

**Pattern:** Controller wrapper utility

**Location:** `platform-core/src/http/controller-helpers.ts`

**How it works:**

- `createControllerHelpers()` provides `executeControllerMethod()`
- Wraps use case execution with try-catch, response formatting, logging, correlation ID tracking

**Enforcement rules:**

- USE for controllers with consistent response patterns (success/failure)
- DO NOT USE for controllers with diverse response shapes (e.g., auth flows with tokens)
- For non-standard controllers, use explicit try-catch blocks

---

## 8. Clean Architecture

**Pattern:** Layered architecture per service

**Structure:**

```
service/src/
  domains/          # Domain entities with business rules
    {domain}/
      entities/     # Rich domain objects
      repositories/ # Interface + implementation
  application/
    use-cases/      # Single-responsibility orchestration
    services/       # Cross-cutting application services
    errors/         # Domain-specific error classes
  infrastructure/
    clients/        # Typed service clients
    database/       # Schema definitions, connection factory
    composition/    # ServiceFactory (dependency injection)
  presentation/
    routes/         # Thin HTTP layer
    controllers/    # Request/response handling
    middleware/     # Auth, validation, rate limiting
```

**Enforcement rules:**

- Dependencies flow INWARD: presentation → application → domain
- Entities NEVER import from infrastructure
- Use cases depend on repository INTERFACES, not implementations
- ServiceFactory is the single composition root for dependency injection
- Routes/controllers must be thin — delegate to use cases

---

## 9. Entity Delegation Chain

**Pattern:** Hierarchical access control through entity chain

**Location:** `user-service/domains/library/entities/`

**How it works:**

- `Entry → Chapter → Book → Shared Policy`
- Each entity adds its own domain constraints (isReadOnly, isLocked)
- Final visibility decision delegated to shared ABAC policy

**Enforcement rules:**

- Entities delegate visibility decisions to shared policy via `canViewContent(this.toResource(), context)`
- Only domain-specific constraints (locks, read-only flags) stay local to the entity
- Every entity that has visibility MUST implement `toResource()` returning `ContentResource`

---

## 10. Creator-Member Content Model

**Pattern:** Relationship-based content visibility

**Location:** `user-service/infrastructure/database/schemas/creator-member-schema.ts`

**How it works:**

- Users follow creators via invitation tokens stored in `usr_invitations`
- Follow relationships stored in `usr_creator_members`
- Librarians are auto-followed on user registration
- Self-relationship created automatically
- Deny-by-default: content only visible if owned, from followed creator, or from librarian

**Enforcement rules:**

- Content visibility ALWAYS checked through `accessibleCreatorIds` resolution
- Never bypass the creator-member relationship check
- All new content types must integrate with this visibility model

---

## 11. Role vs Tier

**Pattern:** Separate authorization from feature access

**Location:** `shared-contracts/common/roles.ts`, `shared-contracts/common/subscription-tiers.ts`

**How it works:**

- **Roles** (admin, librarian, user) = AUTHORIZATION — what you're allowed to do
- **Tiers** (guest, explorer, personal, practice, studio) = FEATURE ACCESS — what features and limits you have

**Enforcement rules:**

- NEVER check tier for authorization decisions
- NEVER check role for feature limits
- Use `contextIsAdmin()`, `contextIsLibrarian()`, `contextIsPrivileged()` for role checks
- Use `isPaidTier()`, `getTierConfig()` for tier checks
- Use `canAccessPaidContent()` when both role and tier matter

```typescript
// CORRECT
if (contextIsAdmin(context)) { /* authorization */ }
if (isPaidTier(context.tier)) { /* feature gating */ }

// WRONG
if (context.role === 'admin' && context.tier === 'personal') { ... }
```

---

## 12. Resilience

**Pattern:** Redis-backed circuit breaker

**Location:** `platform-core/src/resilience/RedisCircuitBreaker.ts`

**How it works:**

- States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
- Shared state across all instances via Redis
- Configurable failure/success thresholds and monitoring windows

**Enforcement rules:**

- ALL external API calls (AI providers, third-party APIs) MUST go through circuit breakers
- Internal service-to-service calls use circuit breakers when the target is critical
- Never call external APIs directly without resilience wrapping

---

## 13. Caching

**Pattern:** Three-tier coordinated caching

**How it works:**

- **Tier 1 — Client:** React Query with query-key-based caching and invalidation
- **Tier 2 — Server memory:** LRU cache for hot data (e.g., librarian IDs with 60s TTL)
- **Tier 3 — Server Redis:** Distributed cache for cross-pod shared data

**Enforcement rules:**

- Cache invalidation must be coordinated across tiers
- Use event-driven invalidation via Redis pub/sub for cross-service cache busting
- Always set TTLs — no infinite caches
- Frontend: invalidate React Query cache after mutations using `queryClient.invalidateQueries()`

---

## 14. Scheduling

**Pattern:** Centralized scheduler with registry

**Location:** `platform-core/src/scheduling/`

**How it works:**

- All jobs extend `BaseScheduler`
- Register with `SchedulerRegistry` for central visibility
- Cron expression based scheduling

**Enforcement rules:**

- NEVER use raw `setInterval`, `setTimeout` for recurring tasks, or raw `cron` libraries
- ALWAYS extend `BaseScheduler` and register with `SchedulerRegistry`
- Include health reporting in scheduled jobs

---

## 15. Event Bus

**Pattern:** Redis Pub/Sub event distribution

**Location:** `platform-core/src/orchestration/event-bus-client.ts`, `shared-contracts/events/`

**How it works:**

- Typed domain events: `UserEvent`, `MusicEvent`, `AnalyticsEvent`, etc.
- All events extend `BaseEvent` with correlation ID, timestamp, source service
- Published via Redis Pub/Sub, consumed by subscribers

**Enforcement rules:**

- All cross-service communication that doesn't need synchronous response MUST use events
- Define new event types in `shared-contracts/events/`
- Events must include correlation IDs for traceability
- Never fire-and-forget without error handling in subscribers

---

## 16. Service Clients

**Pattern:** Typed service clients for inter-service communication

**Location:** `*/infrastructure/clients/`

**How it works:**

- Each service has typed client classes (e.g., `UserServiceClient`, `StorageServiceClient`)
- Clients handle URL resolution, error handling, correlation ID forwarding, response parsing

**Enforcement rules:**

- NEVER make raw HTTP calls between services
- ALWAYS use or create a typed service client
- Clients must forward `x-correlation-id` and `x-user-id` headers
- Clients must handle errors and return typed results

---

## 17. Error Handling

**Pattern:** Structured domain-specific errors

**Location:** `platform-core/src/error-handling/`, service-level `application/errors/`

**How it works:**

- `BaseError` class with error codes, correlation IDs, serialization
- Domain-specific subclasses: `MusicError`, `LibraryError`, `ImageError`, etc.
- `StructuredErrors` for consistent error classification

**Enforcement rules:**

- NEVER throw raw `new Error('message')` in business logic
- ALWAYS use domain-specific error classes
- Error responses must include: error message, error code, correlation ID
- Use `fromException()` for catching unexpected errors

---

## 18. Auth Context

**Pattern:** Standardized auth context extraction

**Location:** `shared-contracts/common/auth-context.ts`

**How it works:**

- `createAuthContextFromHeaders(req.headers)` extracts userId, role, isGuest
- `createAuthContext(userId, role)` for building contexts programmatically
- `contextIsAdmin()`, `contextIsLibrarian()`, `contextIsPrivileged()` for role checks

**Enforcement rules:**

- NEVER read `x-user-id`, `x-user-role` headers manually
- ALWAYS use `createAuthContextFromHeaders()` or `createAuthContext()`
- ALWAYS use `contextIsAdmin()` etc. instead of `context.role === 'admin'`

---

## 19. Health Probes

**Pattern:** Kubernetes-style health endpoints

**Location:** `platform-core/src/health/`

**How it works:**

- Three endpoints: `/health/live` (process alive), `/health/ready` (can serve traffic), `/health/startup` (initialization complete)
- Health manager tracks component readiness (DB, Redis, external APIs)

**Enforcement rules:**

- All services MUST expose all three health endpoints
- Register health checks for every critical dependency
- Health checks must be lightweight (no expensive queries)

---

## 20. Service Discovery

**Pattern:** Dynamic service URL resolution

**Location:** `system-service/`, `platform-core/src/orchestration/service-discovery-client.ts`

**How it works:**

- Services register themselves with system-service
- Other services discover URLs through the discovery client
- Config-based fallback for development

**Enforcement rules:**

- NEVER hardcode service URLs in application code
- ALWAYS use service discovery or config-based URL resolution
- Consult service discovery before implementing cross-service functionality

---

## 21. Frontend State Management

**Pattern:** Separated state ownership

**Location:** `apps/aiponge/src/stores/`, React Query, React Context

**How it works:**

- **Zustand stores** — client-only UI state (e.g., track generation progress, search state, user mode)
- **React Query** — server state (API data, caching, synchronization)
- **React Context** — wrapping external service SDKs (audio player, subscriptions)

**Enforcement rules:**

- Zustand for UI state ONLY — never duplicate server data in Zustand
- React Query for ALL server data — never fetch API data in Zustand stores
- React Context ONLY for SDK wrappers — never for general state
- All Zustand stores go in `apps/aiponge/src/stores/` with barrel export

---

## 22. Frontend API Client

**Pattern:** Unified API client

**Location:** `apps/aiponge/src/lib/axiosApiClient.ts`

**How it works:**

- Single `apiRequest()` function for all HTTP requests
- Auto-injects auth tokens, correlation IDs
- Smart caching, request deduplication, structured error handling

**Enforcement rules:**

- NEVER use raw `fetch()` or create separate axios instances
- ALWAYS use `apiRequest()` from `axiosApiClient.ts`
- Mutation calls use `apiRequest(url, { method, data })`
- React Query queries rely on the default fetcher (already configured)

---

## 23. Cross-Service Integrity

**Pattern:** Contract-driven reference validation

**Location:** `shared-contracts/integrity/`

**How it works:**

- `IntegrityGuard` validates foreign key references across service boundaries
- Typed service names and operation types
- `CROSS_SERVICE_REFERENCES` maps all inter-service relationships

**Enforcement rules:**

- Validate cross-service references before creating records that reference other services
- Register new cross-service references in the shared contracts

---

## 24. Privacy by Default

**Pattern:** All content starts private

**Location:** `shared-contracts/common/status-types.ts`

**How it works:**

- `ContentVisibilityWithDefaultSchema` defaults to `CONTENT_VISIBILITY.PERSONAL`
- Nullable visibility fields default to personal

**Enforcement rules:**

- ALL new content types default to `CONTENT_VISIBILITY.PERSONAL`
- Use `?? CONTENT_VISIBILITY.PERSONAL` for nullable visibility — never `|| ''`
- Users must explicitly opt to make content shared or public

---

## 25. AI Provider Architecture

**Pattern:** Centralized provider proxy

**Location:** AI config service, `shared-contracts/providers/`

**How it works:**

- Providers registered in `cfg_provider_configs` table
- `ProviderProxy` handles circuit breaking, health monitoring, load balancing
- Capabilities declared via typed schemas

**Enforcement rules:**

- NEVER call AI providers directly — always go through the provider proxy
- Register new providers in the config table with proper capability declarations
- Use the provider operation types from shared-contracts

---

## 26. Prompt Templates

**Pattern:** Database-stored Handlebars templates

**Location:** AI content service, `shared-contracts/templates/`

**How it works:**

- All AI prompt templates stored in `aic_prompt_templates` table
- Handlebars syntax for variable interpolation
- Template engine service resolves and renders templates

**Enforcement rules:**

- NEVER hardcode AI prompts in application code
- ALWAYS use database-stored templates rendered by the template engine
- New prompts must be added as template records, not code strings

---

## 27. Bounded-Context Modules

**Pattern:** Domain-driven service organization

**Location:** `user-service/src/domains/`

**Bounded contexts:**

- `identity` — registration, authentication, guest users
- `profile` — user profile, preferences, analysis
- `library` — books, chapters, entries, illustrations
- `insights` — reflections, patterns, personas
- `billing` — subscriptions, credits, purchases
- `notifications` — reminders, push notifications

**Enforcement rules:**

- Bounded contexts must not directly access each other's repositories
- Cross-context communication goes through use cases or events
- Each context owns its own database tables (prefixed appropriately)

---

## 28. Field Name Conventions

**Pattern:** Standardized field names to prevent synonyms

**Established names — always use these:**
| Field | Use | Do NOT use |
|---|---|---|
| `coverArtworkUrl` | Album/playlist cover image | `coverUrl`, `coverImage`, `thumbnailUrl` |
| `artworkUrl` | Generic artwork reference | `imageUrl`, `pictureUrl` |
| `coverIllustrationUrl` | Book cover image | `bookCoverUrl`, `bookImage` |
| `reference` | External reference ID | `externalId`, `refId` |
| `type` | Discriminator field | `kind`, `category` (unless distinct domain) |
| `userDate` | User-meaningful date on entries | `entryDate`, `createdDate` |
| `depthLevel` | Content depth as enum | `depth` (as number) |
| `targetLanguages` | Full locale codes for output | `languages`, `outputLanguages` |
| `culturalLanguages` | Short codes for multicultural content | `bilingualLanguages` |
| `userId` | Owner/creator of content | `artistId`, `creatorId` (in content tables) |
| `visibility` | Content visibility level | `privacy`, `accessLevel` (for content) |

**Enforcement rules:**

- Before adding any new field, check this list and existing schemas
- NEVER introduce a synonym for an existing field name
- If a new concept needs a name, document it here immediately

---

## 29. Unified Music Tables

**Pattern:** Single set of tables for all music content

**Location:** Music service database schemas

**How it works:**

- All music content uses unified tables: `mus_albums`, `mus_tracks`, `mus_lyrics`, `mus_playlists`
- A `visibility` column on each table controls access (personal/shared/public)
- No separate tables for "shared library" vs "user library" — same table, different visibility values

**Enforcement rules:**

- NEVER create separate tables for different visibility levels
- Use the `visibility` column to distinguish personal vs shared vs public content
- All music queries go through `MusicAccessRepository` for access-controlled data

---

## 30. Unified Generation Services

**Pattern:** Single service with visibility parameter

**Location:** `music-service/src/application/services/TrackGenerationService.ts`, `AlbumGenerationService.ts`

**How it works:**

- `TrackGenerationService` and `AlbumGenerationService` accept `targetVisibility` parameter
- Same service handles both personal and shared content generation
- No per-visibility wrapper classes

**Enforcement rules:**

- NEVER create separate generation services/classes for different visibility levels
- Pass `targetVisibility` as a parameter to the unified service
- Deprecated per-visibility wrappers must not be used

---

## 31. Centralized Music Visibility

**Pattern:** Single service for music access resolution

**Location:** `music-service/src/application/services/MusicVisibilityService.ts`, `MusicAccessRepository.ts`

**How it works:**

- `MusicVisibilityService` resolves `accessibleCreatorIds` with 60s TTL caching
- `MusicAccessRepository` encapsulates all access-controlled SQL queries for tracks, albums, playlists
- `checkItemAccess()` delegates to shared ABAC policy

**Enforcement rules:**

- ALL music access checks go through `MusicVisibilityService`
- ALL access-filtered music queries go through `MusicAccessRepository`
- Never write custom visibility SQL outside the access repository

---

## 32. Content Promotion

**Pattern:** Promoting personal content to shared containers

**How it works:**

- Users can "promote" personal entries to shared books, making them visible to followers
- Promotion creates a copy in a shared container while preserving the original
- Prevents double-promotion via existing promotion checks

**Enforcement rules:**

- Promotion is the ONLY way to share personal content — never change visibility of existing personal content directly
- Always check for existing promotions before creating new ones

---

## 33. Multi-Language Generation Naming

**Pattern:** Distinct field names for language intent

**How it works:**

- `targetLanguages` — full locale codes (e.g., `en-US`, `fr-FR`) for which languages to generate output in
- `culturalLanguages` — short codes (e.g., `ar`, `fr`) for bilingual/multicultural content within a single piece

**Enforcement rules:**

- NEVER use `languages` ambiguously — always specify `targetLanguages` or `culturalLanguages`
- `targetLanguages` = "generate output in these languages"
- `culturalLanguages` = "blend these cultural/linguistic elements into the content"

---

## 34. Content Lifecycle State Machine

**Pattern:** Centralized status constants, transitions, and validation for all content domains

**Source of truth:** `packages/shared/contracts/src/common/content-lifecycle.ts`

**How it works:**

- Base lifecycle statuses: `draft`, `active`, `published`, `archived`, `deleted`
- Domain-specific extensions: tracks add `processing`, AI content adds `generated`/`reviewed`, storage files add `orphaned`, file versions add `current`
- Each domain has its own constant object (`TRACK_LIFECYCLE`, `ALBUM_LIFECYCLE`, `PLAYLIST_LIFECYCLE`, `BOOK_LIFECYCLE`, `AI_CONTENT_LIFECYCLE`, `FILE_VERSION_LIFECYCLE`, `STORAGE_FILE_LIFECYCLE`), Zod schema, TypeScript type, and transition map
- Transition maps define allowed status changes per domain (e.g., `draft → [active, published, deleted]`)
- `assertValidTransition(from, to, transitionsMap, domainName)` throws `InvalidStatusTransitionError` for invalid transitions
- `canTransitionTo(from, to, transitionsMap)` returns boolean for conditional checks
- Entity methods (publish, archive, delete, restore) call `assertValidTransition` before changing status
- Repositories and SQL queries use constants instead of string literals

**Enforcement rules:**

- NEVER use raw status strings (`'active'`, `'published'`, etc.) — always import from `content-lifecycle.ts`
- NEVER define local status enums or types — use the centralized `*LifecycleStatus` types
- ALL entity status mutations MUST call `assertValidTransition` or `canTransitionTo` before assignment
- SQL queries use interpolated constants: `t.status = ${TRACK_LIFECYCLE.PUBLISHED}` not `t.status = 'published'`
- Zod schemas for status fields use the centralized `*LifecycleSchema` (e.g., `TrackLifecycleSchema`, `BookLifecycleSchema`)
- Mirrors the CONTENT_VISIBILITY centralization pattern: constants + types + Zod schemas + helpers
