/**
 * AI Music Service Authentication Middleware - Uses shared auth-middleware
 */

import { createServiceAuth } from '@aiponge/platform-core';

const { authMiddleware, optionalAuth: optionalAuthMiddleware, requireRole, requirePermission } = createServiceAuth(
  'music-service',
  { allowApiKey: true, allowServiceAuth: true }
);

export { authMiddleware, optionalAuthMiddleware, requireRole, requirePermission };
