# Root package.json Dependency Migration Guide

## What stays at root (monorepo tooling only)

### devDependencies (14 deps → kept)
| Package | Reason |
|---------|--------|
| `@eslint/js` | Root ESLint config (`eslint.config.js`) |
| `@types/node` | Used across all packages via TypeScript |
| `chokidar` | Root codegen script (`scripts/codegen/generate-service-config.ts`) |
| `drizzle-kit` | Root `db:push` script |
| `esbuild` | Build toolchain + override target |
| `eslint` | Root ESLint config |
| `eslint-plugin-prettier` | Root ESLint config |
| `eslint-plugin-sonarjs` | Root ESLint config |
| `prettier` | Root formatting |
| `simple-git-hooks` | Git hooks (`prepare` script) |
| `tsx` | Root scripts runner (codegen, startup orchestrator) |
| `turbo` | Monorepo task runner |
| `typescript` | Shared TypeScript compiler |
| `typescript-eslint` | Root ESLint config |

---

## What gets moved (42 deps → 28 removed from root)

### → `packages/platform-core/package.json`
Already has most of these. Verify and add if missing:

| Package | Notes |
|---------|-------|
| `@sentry/node` | Used in `platform-core/src/monitoring/sentry.ts` |
| `opossum` | Used in `platform-core/src/resilience/index.ts` |
| `@types/opossum` | Type definitions for opossum |
| `node-cron` | Used in `platform-core/src/scheduling/BaseScheduler.ts` |
| `@types/node-cron` | Type definitions for node-cron |
| `kafkajs` | Used in platform-core event bus |
| `bullmq` | Used in platform-core queue management |
| `winston` | Used across services via platform-core logger. Already listed but verify version |
| `pg` | Used across services. Already listed but verify version |
| `drizzle-orm` | ORM used across services. Add if not already present |
| `prom-client` | Used in api-gateway metrics (`src/utils/metrics.ts`) and services via platform-core |

### → `packages/services/storage-service/package.json`
| Package | Notes |
|---------|-------|
| `sharp` | Used in `ImageProcessingService.ts`, `UploadFileUseCase.ts`, `DownloadExternalFileUseCase.ts` |
| `@types/sharp` | Type definitions for sharp |
| `@aws-sdk/client-s3` | Already listed in storage-service. Just remove from root |
| `@aws-sdk/s3-request-presigner` | Already listed in storage-service. Just remove from root |

### → `packages/services/ai-analytics-service/package.json`
| Package | Notes |
|---------|-------|
| `pdfkit` | Used in report generation use cases |
| `@types/pdfkit` | Type definitions for pdfkit |

### → `packages/services/ai-content-service/package.json`
| Package | Notes |
|---------|-------|
| `handlebars` | Used in `ContentTemplateService.ts` |
| `@types/handlebars` | Type definitions for handlebars |

### → `packages/services/ai-config-service/package.json`
| Package | Notes |
|---------|-------|
| `handlebars` | Used in `ExecutionService.ts` |

### → `packages/services/music-service/package.json`
| Package | Notes |
|---------|-------|
| `p-limit` | Used in `AlbumGenerationPipeline.ts`, `RefactoredAlbumHandlers.ts` |

### → `packages/services/api-gateway/package.json`
| Package | Notes |
|---------|-------|
| `rate-limit-redis` | Used in `RedisRateLimitMiddleware.ts`. Already listed if present, verify |
| `prom-client` | Used in `src/utils/metrics.ts`. Add if not present |

### → `apps/aiponge/package.json`
| Package | Notes |
|---------|-------|
| `@react-navigation/bottom-tabs` | Used in `AppTabBar.tsx` |
| `react-native-svg` | RN dependency |
| `react-airplay` | RN casting feature |
| `react-native-google-cast` | RN casting feature |
| `expo-location` | Used in `useLocation.tsx` |
| `react` | Already listed in app. Just remove from root |
| `react-native` | Already listed in app. Just remove from root |
| `react-native-worklets` | Already listed in app. Just remove from root |
| `expo` | Already listed in app. Just remove from root |
| `expo-device` | Already listed in app. Just remove from root |
| `expo-video` | Already listed in app. Just remove from root |
| `@expo/cli` | Expo CLI for mobile app builds |

### → `packages/shared/test-utils/package.json`
| Package | Notes |
|---------|-------|
| `vitest` | Already listed (`"vitest": "*"`). Verify version pin |
| `@vitest/coverage-v8` | Test coverage tooling |
| `@testing-library/react-native` | React Native test utilities (if used) |

### → DELETE (no longer needed)
| Package | Reason |
|---------|--------|
| `jest-expo` | Migrated to Vitest — no longer used anywhere |
| `@types/jest` | Migrated to Vitest — no longer used anywhere |
| `@expo/ngrok` | Not imported anywhere in source. Remove or move to app devDeps if needed for Expo tunnel |
| `concurrently` | Not imported anywhere. Scripts use turbo instead |
| `ts-morph` | Not imported anywhere in source |
| `@types/compression` | Move to services that use compression (all backend services already have `compression` listed) |
| `@types/cors` | Move to services that use cors |
| `@types/express` | Move to services that use express |
| `@types/express-session` | Move to api-gateway and user-service (they use express-session) |
| `@types/jsonwebtoken` | Move to services that use jsonwebtoken |
| `@types/multer` | Move to storage-service (uses multer) |
| `@types/pg` | Move to platform-core and services using pg |
| `@types/react` | Move to apps/aiponge devDependencies |
| `@types/uuid` | Move to services that use uuid |
| `@types/ws` | Move to services that use ws |

---

## Type Definition Distribution

The `@types/*` packages should go to the specific service that uses the corresponding library.
Here's the mapping:

| Type Package | Target |
|-------------|--------|
| `@types/compression` | All backend services (or platform-core if re-exported) |
| `@types/cors` | All backend services (or platform-core) |
| `@types/express` | All backend services (or platform-core) |
| `@types/express-session` | api-gateway, user-service |
| `@types/handlebars` | ai-content-service, ai-config-service |
| `@types/jsonwebtoken` | api-gateway, ai-config-service, music-service, user-service |
| `@types/multer` | storage-service |
| `@types/node-cron` | platform-core |
| `@types/opossum` | platform-core, api-gateway |
| `@types/pdfkit` | ai-analytics-service |
| `@types/pg` | platform-core |
| `@types/react` | apps/aiponge (devDependencies) |
| `@types/sharp` | storage-service |
| `@types/uuid` | All backend services (or platform-core) |
| `@types/ws` | Services using ws (ai-analytics-service, ai-content-service, music-service, system-service) |

---

## Summary

| Category | Before | After |
|----------|--------|-------|
| Root dependencies | 42 | 0 |
| Root devDependencies | 20 | 14 |
| **Total root deps** | **62** | **14** |
| Moved to services | — | 28 |
| Deleted (unused) | — | ~5 |
