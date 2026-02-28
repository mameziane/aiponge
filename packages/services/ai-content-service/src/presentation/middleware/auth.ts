/**
 * AI Content Service Authentication Middleware - Uses shared auth-middleware
 */

import { createServiceAuth } from '@aiponge/platform-core';
import { contentServiceConfig } from '../../config/service-config';

const {
  authMiddleware,
  optionalAuth: optionalAuthMiddleware,
  requireRole,
  requirePermission,
} = createServiceAuth('ai-content-service', {
  skipPaths: ['/health', '/metrics'],
  optionalSkipPaths: ['/health', '/metrics', '/api'],
  allowApiKey: contentServiceConfig.security.apiKeyRequired,
  allowServiceAuth: true,
});

export { authMiddleware, optionalAuthMiddleware, requireRole, requirePermission };
