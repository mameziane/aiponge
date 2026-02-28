/**
 * API Gateway Infrastructure Middleware
 * Centralized middleware for cross-cutting concerns with standardized patterns
 */

export { rateLimitMiddleware } from './RateLimitMiddleware';
export { errorHandlingMiddleware, type AppError } from './ErrorHandlingMiddleware';
export { loggingMiddleware } from './LoggingMiddleware';
export { metricsMiddleware } from './MetricsMiddleware';
export {
  authenticationMiddleware,
  requireRoles,
  requireApiKey,
  requireServiceAuth,
  skipAuth,
} from './AuthenticationMiddleware';

// Admin authentication and development-only middleware
export { adminAuthMiddleware, librarianAuthMiddleware, developmentOnlyMiddleware } from './adminAuthMiddleware';

// SCALABILITY: Response caching for high-traffic read endpoints
export {
  createResponseCacheMiddleware,
  CACHE_PRESETS,
  getCacheStats,
  clearCache,
  invalidateCachePattern,
  shutdownResponseCache,
} from './ResponseCacheMiddleware';

// SCALABILITY: Pagination limit enforcement
export { paginationMiddleware } from './PaginationMiddleware';

// Contract versioning middleware
export { contractVersionCheckMiddleware, contractVersionStampMiddleware } from './ContractVersionMiddleware';

// Re-export standardized middleware from platform-core for convenience
import { correlationMiddleware as platformCoreCorrelationMiddleware } from '@aiponge/platform-core';
export const correlationMiddleware = platformCoreCorrelationMiddleware;
