/**
 * AI Config Service Authentication Middleware - Uses shared auth-middleware
 */

import { createServiceAuth } from '@aiponge/platform-core';

const { authMiddleware, optionalAuth, requirePermission } = createServiceAuth('ai-config-service', {
  skipPaths: ['/health', '/catalog'],
  optionalSkipPaths: ['/health', '/api/providers/health', '/metrics'],
  allowApiKey: true,
  allowServiceAuth: true,
});

export const authenticationMiddleware = authMiddleware;
export const optionalAuthMiddleware = optionalAuth;
export const authorizationMiddleware = (requiredPermission: string) => requirePermission(requiredPermission);
