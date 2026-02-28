/**
 * Admin Authentication Middleware
 * Protects admin-only and librarian endpoints using shared auth-middleware factories
 *
 * SECURITY: createSecureRoleGuard strips ALL inbound x-user-* headers to prevent
 * header injection attacks. Role and user ID are derived ONLY from verified JWT claims.
 */

import { Request, Response, NextFunction } from 'express';
import { createSecureRoleGuard } from '@aiponge/platform-core';
import { USER_ROLES, PRIVILEGED_ROLES, StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('api-gateway-admin-auth');

export const adminAuthMiddleware = createSecureRoleGuard('api-gateway', [USER_ROLES.ADMIN]);

export const librarianAuthMiddleware = createSecureRoleGuard('api-gateway', [...PRIVILEGED_ROLES]);

export function developmentOnlyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Development-only endpoint accessed in production', { path: req.path });
    return StructuredErrors.notFound(res, 'Endpoint', { service: 'api-gateway', correlationId: getCorrelationId(req) });
  }
  next();
}
