/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and extracts user ID for downstream services
 */

import { Request, Response, NextFunction } from 'express';
import { StandardAuthMiddleware, AuthenticatedRequest } from '@aiponge/platform-core';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('api-gateway-jwt-middleware');

interface JWTUserPayload {
  id?: string;
  email?: string;
  roles?: string[];
  role?: string;
  permissions?: string[];
}

const standardAuth = new StandardAuthMiddleware('api-gateway');

/**
 * JWT Authentication Middleware
 * Verifies JWT token and stores userId in res.locals for downstream services
 */
export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use StandardAuthMiddleware to verify token
  standardAuth.authenticate({ skipPaths: ['/health', '/metrics'] })(req, res, (err?: unknown) => {
    if (err) {
      return next(err);
    }

    const authReq = req as AuthenticatedRequest;
    const user = authReq.user as JWTUserPayload | undefined;
    const userId = user?.id;
    const rawRole = user?.role || user?.roles?.[0];
    const userRole = rawRole ? rawRole.toLowerCase() : undefined;

    // CRITICAL: Reject tokens without user ID
    if (!userId) {
      return StructuredErrors.unauthorized(res, 'Invalid token: missing user identifier', {
        service: 'api-gateway',
        correlationId: getCorrelationId(req),
        details: { code: 'INVALID_TOKEN' },
      });
    }

    // Store userId and role in res.locals for downstream use
    // SECURITY: Set authenticated flag to indicate this was verified by StandardAuthMiddleware
    // DynamicRouter checks this flag before signing x-user-id headers
    res.locals.userId = userId;
    res.locals.userRole = userRole;
    res.locals.authenticated = true;

    // Set headers for downstream route handlers
    req.headers['x-user-id'] = userId;
    if (userRole) {
      req.headers['x-user-role'] = userRole;
    }

    next();
  });
}

/**
 * Optional JWT Authentication Middleware
 * Attempts to decode JWT token if present, but continues without error if missing or invalid.
 * Use for public endpoints that can optionally use user context (e.g., personalized content for logged-in users).
 */
export function optionalJwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  standardAuth.authenticate({ skipPaths: [] })(req, res, (err?: unknown) => {
    if (err) {
      logger.debug('Optional JWT auth failed, continuing as guest', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return next();
    }

    const authReq = req as AuthenticatedRequest;
    const user = authReq.user as JWTUserPayload | undefined;
    const userId = user?.id;
    const rawRole = user?.role || user?.roles?.[0];
    const userRole = rawRole ? rawRole.toLowerCase() : undefined;

    if (userId) {
      res.locals.userId = userId;
      res.locals.userRole = userRole;
      res.locals.authenticated = true;
      req.headers['x-user-id'] = userId;
      if (userRole) {
        req.headers['x-user-role'] = userRole;
      }
      logger.debug('Optional JWT auth successful', { userId });
    }

    next();
  });
}
