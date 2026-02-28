/**
 * Gateway-Level Authentication Utilities
 *
 * Higher-level auth functions used by the API Gateway and downstream services:
 * - createServiceAuth: Full auth setup for individual services
 * - createSecureRoleGuard: Role-based guard that strips inbound headers
 * - createOptionalAuth: Lightweight optional auth for public endpoints
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { StructuredErrors, getCorrelationId as getCorrelationIdFromHeaders } from '@aiponge/shared-contracts';
import { generateCorrelationId } from '../logging';
import { StandardAuthMiddleware } from './auth-middleware.js';
import { AuthenticatedRequest, AuthOptions } from './types.js';
import type { JwtPayload } from './jwt-service.js';

type UserPayload = JwtPayload;

export function createRequireRole(serviceName: string) {
  return function requireRole(roles: string | string[]): RequestHandler {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    return (req: Request, res: Response, next: NextFunction): void => {
      const authReq = req as AuthenticatedRequest;
      const correlationId = authReq.correlationId || getCorrelationIdFromHeaders(req) || generateCorrelationId();

      if (!authReq.user) {
        StructuredErrors.unauthorized(res, 'Authentication required', {
          service: serviceName,
          correlationId,
        });
        return;
      }

      const hasRequiredRole = allowedRoles.some(role => authReq.user!.roles.includes(role));

      if (hasRequiredRole) {
        next();
      } else {
        StructuredErrors.forbidden(res, `Requires one of the following roles: ${allowedRoles.join(', ')}`, {
          service: serviceName,
          correlationId,
          details: { requiredRoles: allowedRoles, userRoles: authReq.user.roles },
        });
        return;
      }
    };
  };
}

export function createRequirePermission(serviceName: string) {
  return function requirePermission(permissions: string | string[]): RequestHandler {
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

    return (req: Request, res: Response, next: NextFunction): void => {
      const authReq = req as AuthenticatedRequest;
      const correlationId = authReq.correlationId || getCorrelationIdFromHeaders(req) || generateCorrelationId();

      if (!authReq.user) {
        StructuredErrors.unauthorized(res, 'Authentication required', {
          service: serviceName,
          correlationId,
        });
        return;
      }

      const hasPermission = requiredPermissions.some(permission => authReq.user!.permissions.includes(permission));

      if (hasPermission) {
        next();
      } else {
        StructuredErrors.forbidden(res, `Requires one of the following permissions: ${requiredPermissions.join(', ')}`, {
          service: serviceName,
          correlationId,
          details: { requiredPermissions, userRoles: authReq.user.roles },
        });
        return;
      }
    };
  };
}

export function createOptionalAuth(serviceName: string) {
  return function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
    const authReq = req as AuthenticatedRequest;
    authReq.correlationId = authReq.correlationId || (req.headers['x-correlation-id'] as string) || generateCorrelationId();
    const userId = req.headers['x-user-id'] as string | undefined;
    if (userId) {
      (req as Request & { userId?: string }).userId = userId;
    }
    next();
  };
}

export interface ServiceAuthOptions {
  skipPaths?: string[];
  optionalSkipPaths?: string[];
  allowApiKey?: boolean;
  allowServiceAuth?: boolean;
}

export interface ServiceAuthMiddleware extends RequestHandler {
  optional: () => RequestHandler;
  required: () => RequestHandler;
  admin: () => RequestHandler;
}

export interface ServiceAuth {
  authMiddleware: ServiceAuthMiddleware;
  optionalAuth: RequestHandler;
  requireRole: (roles: string | string[]) => RequestHandler;
  requirePermission: (permissions: string | string[]) => RequestHandler;
}

export function createServiceAuth(serviceName: string, options: ServiceAuthOptions = {}): ServiceAuth {
  const { skipPaths = ['/health', '/metrics'], allowApiKey = true, allowServiceAuth = true } = options;
  const optionalSkipPaths = options.optionalSkipPaths ?? skipPaths;
  const middleware = new StandardAuthMiddleware(serviceName);

  const baseAuth = middleware.authenticate({ skipPaths, allowApiKey, allowServiceAuth });
  const optionalAuth: RequestHandler = createVerifiedOptionalAuth(middleware, {
    skipPaths: optionalSkipPaths,
    allowApiKey,
    allowServiceAuth,
  });
  const requireRole = createRequireRole(serviceName);
  const requirePermission = createRequirePermission(serviceName);

  const authMiddleware = baseAuth as ServiceAuthMiddleware;
  authMiddleware.optional = () => optionalAuth;
  authMiddleware.required = () => authMiddleware;
  authMiddleware.admin = () => requireRole(['admin']) as RequestHandler;

  return { authMiddleware, optionalAuth, requireRole, requirePermission };
}

function createVerifiedOptionalAuth(
  middleware: StandardAuthMiddleware,
  authOptions: AuthOptions
): RequestHandler {
  const jwtService = middleware.getJwtService();

  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    authReq.correlationId =
      authReq.correlationId || (req.headers['x-correlation-id'] as string) || generateCorrelationId();
    res.setHeader('x-correlation-id', authReq.correlationId);

    if (authOptions.skipPaths?.some(path => req.path.startsWith(path))) {
      return next();
    }

    if (authOptions.allowServiceAuth) {
      const serviceKey = req.headers['x-service-key'] as string;
      const expectedServiceKey = process.env.SERVICE_AUTH_KEY;
      if (
        serviceKey &&
        expectedServiceKey &&
        serviceKey.length === expectedServiceKey.length &&
        crypto.timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedServiceKey))
      ) {
        authReq.user = { id: 'service', email: 'service@internal', roles: ['service'], permissions: [] };
        return next();
      }
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return next();
    }

    try {
      authReq.user = jwtService.verify(token);
    } catch {
    }

    next();
  };
}

export function createSecureRoleGuard(serviceName: string, allowedRoles: string[]): RequestHandler {
  const auth = new StandardAuthMiddleware(serviceName);

  return (req: Request, res: Response, next: NextFunction) => {
    delete req.headers['x-user-id'];
    delete req.headers['x-user-role'];
    delete req.headers['x-internal-service'];

    auth.authenticate({ skipPaths: [] })(req, res, (err?: unknown) => {
      if (err) return next(err);

      const authReq = req as AuthenticatedRequest;
      const user = authReq.user as (UserPayload & { role?: string }) | undefined;
      const userId = user?.id;
      const rawRole = user?.role || user?.roles?.[0];
      const role = rawRole ? rawRole.toLowerCase() : undefined;
      const correlationId = authReq.correlationId || generateCorrelationId();

      if (!userId) {
        StructuredErrors.unauthorized(res, `Authentication required for ${allowedRoles.join('/')} access`, {
          service: serviceName,
          correlationId,
        });
        return;
      }

      if (!role || !allowedRoles.includes(role)) {
        StructuredErrors.forbidden(res, `Requires one of: ${allowedRoles.join(', ')}`, {
          service: serviceName,
          correlationId,
        });
        return;
      }

      res.locals.userId = userId;
      req.headers['x-user-id'] = userId;
      req.headers['x-user-role'] = role;
      next();
    });
  };
}
