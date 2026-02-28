/**
 * Authorization Middleware
 * Ensures users can only access their own resources
 */

import { Request, Response, NextFunction } from 'express';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('api-gateway-authorization');

/**
 * Middleware to verify user can only access their own entries
 * Checks that userId in request (body or query) matches authenticated user
 */
export function verifyUserOwnership(req: Request, res: Response, next: NextFunction) {
  const authenticatedUserId = req.headers['x-user-id'] as string;
  const requestedUserId = req.body?.userId || req.query?.userId || req.params?.userId;

  if (!authenticatedUserId) {
    StructuredErrors.unauthorized(res, 'Authentication required', {
      service: 'api-gateway',
      correlationId: getCorrelationId(req),
    });
    return;
  }

  if (requestedUserId && requestedUserId !== authenticatedUserId) {
    StructuredErrors.forbidden(res, "Unauthorized: Cannot access other users' resources", {
      service: 'api-gateway',
      correlationId: getCorrelationId(req),
    });
    return;
  }

  next();
}

/**
 * Middleware to inject authenticated userId into request
 * Ensures userId is always set from authenticated user
 *
 * Attempts to get userId from multiple sources:
 * 1. x-user-id header (set by jwtAuthMiddleware)
 * 2. res.locals.userId (fallback from jwtAuthMiddleware)
 */
export function injectAuthenticatedUserId(req: Request, res: Response, next: NextFunction) {
  // Try to get userId from header first, then fallback to res.locals
  let authenticatedUserId = req.headers['x-user-id'] as string;

  // Fallback: If header is missing, try to get from res.locals (set by jwtAuthMiddleware)
  if (!authenticatedUserId && res.locals.userId) {
    authenticatedUserId = res.locals.userId;
    // Also set the header for downstream proxy calls
    req.headers['x-user-id'] = authenticatedUserId;
  }

  // Also handle userRole fallback from res.locals (set by jwtAuthMiddleware)
  // This ensures x-user-role header is set for downstream services even if header was cleared
  if (!req.headers['x-user-role'] && res.locals.userRole) {
    req.headers['x-user-role'] = res.locals.userRole;
  }

  if (req.path.includes('/library/books') || req.path.includes('/my/library')) {
    logger.debug('Auth context for library route', {
      path: req.path,
      method: req.method,
      userId: authenticatedUserId,
      headerRole: req.headers['x-user-role'],
      localsRole: res.locals.userRole,
      localsAuthenticated: res.locals.authenticated,
    });
  }

  if (!authenticatedUserId) {
    StructuredErrors.unauthorized(res, 'Authentication required', {
      service: 'api-gateway',
      correlationId: getCorrelationId(req),
    });
    return;
  }

  // Override any userId in body with authenticated user
  if (req.body) {
    req.body.userId = authenticatedUserId;
  }

  // Set userId in query if not present
  if (!req.query.userId) {
    req.query.userId = authenticatedUserId;
  }

  next();
}

/**
 * Optional auth middleware - injects userId if present but allows guests
 * Use for endpoints that support both authenticated and guest access
 *
 * Unlike injectAuthenticatedUserId, this does NOT reject unauthenticated requests.
 * Guest requests will proceed without x-user-id header set.
 */
export function injectOptionalUserId(req: Request, res: Response, next: NextFunction) {
  // Try to get userId from header first, then fallback to res.locals
  let authenticatedUserId = req.headers['x-user-id'] as string;

  // Fallback: If header is missing, try to get from res.locals (set by jwtAuthMiddleware)
  if (!authenticatedUserId && res.locals.userId) {
    authenticatedUserId = res.locals.userId;
    // Also set the header for downstream proxy calls
    req.headers['x-user-id'] = authenticatedUserId;
  }

  // If authenticated, inject userId into body/query as usual
  if (authenticatedUserId) {
    if (req.body) {
      req.body.userId = authenticatedUserId;
    }
    if (!req.query.userId) {
      req.query.userId = authenticatedUserId;
    }
  }

  // Always proceed - guests allowed
  next();
}
