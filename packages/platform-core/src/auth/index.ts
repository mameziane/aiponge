/**
 * Authentication Module - Index
 *
 * Exports all authentication functionality for platform-core
 */

// Types and interfaces
export * from './types.js';

// JWT service
export * from './jwt-service.js';

// Authentication middleware
export * from './auth-middleware.js';

// Correlation utilities
export * from './correlation.js';

// Internal service authentication (HMAC signing)
export * from './service-auth.js';
// Explicit named exports for service-auth functions to ensure visibility across project references
export {
  signUserIdHeader,
  verifyUserIdSignature,
  serviceAuthMiddleware,
  getVerifiedUserId,
  getVerifiedUserRole,
  isServiceAuthEnabled,
} from './service-auth.js';

// Policy Guards - Centralized authorization middleware
export * from './policy-guards.js';

// Gateway-level auth utilities (createServiceAuth, createSecureRoleGuard, createOptionalAuth)
export * from './gateway-auth.js';
