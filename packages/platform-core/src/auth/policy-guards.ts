/**
 * PolicyGuards - Centralized Authorization Middleware
 *
 * Express middleware for role and permission-based authorization.
 * Replaces scattered role checks across services with reusable guards.
 *
 * Usage:
 * ```typescript
 * import { requireRole, requirePermission, requirePrivileged } from '@aiponge/platform-core';
 *
 * router.post('/admin/users', requireRole(USER_ROLES.ADMIN), createUser);
 * router.post('/library/books', requirePrivileged(), createBook);
 * router.delete('/shared/:id', requirePermission(PERMISSION.DELETE_SHARED_CONTENT), deleteShared);
 * ```
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { sendErrorResponse } from '../error-handling/errors.js';
import {
  type AuthContext,
  type UserRole,
  type Permission,
  createAuthContextFromHeaders,
  hasRole,
  hasAnyRole,
  hasPermission,
  hasAnyPermission,
  contextIsPrivileged,
  contextIsAdmin as _contextIsAdmin,
  USER_ROLES,
  PRIVILEGED_ROLES,
} from '@aiponge/shared-contracts';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export interface PolicyGuardOptions {
  onUnauthorized?: (req: Request, res: Response) => void;
  onForbidden?: (req: Request, res: Response, reason: string) => void;
}

const defaultOptions: PolicyGuardOptions = {
  onUnauthorized: (_req, res) => {
    sendErrorResponse(res, 401, 'Authentication required');
  },
  onForbidden: (_req, res, reason) => {
    sendErrorResponse(res, 403, reason);
  },
};

export function extractAuthContext(req: Request): AuthContext {
  if (req.authContext) {
    return req.authContext;
  }

  const headers = {
    'x-user-id': req.headers['x-user-id'] as string | undefined,
    'x-user-role': req.headers['x-user-role'] as string | undefined,
    'x-user-is-guest': req.headers['x-user-is-guest'] as string | undefined,
  };

  const ctx = createAuthContextFromHeaders(headers);
  req.authContext = ctx;
  return ctx;
}

export function attachAuthContext(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    extractAuthContext(req);
    next();
  };
}

export function requireAuthenticated(options: PolicyGuardOptions = {}): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    next();
  };
}

export function requireRole(role: UserRole, options: PolicyGuardOptions = {}): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    if (!hasRole(ctx, role)) {
      opts.onForbidden!(req, res, `${role} access required`);
      return;
    }

    next();
  };
}

export function requireAnyRole(roles: readonly UserRole[], options: PolicyGuardOptions = {}): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    if (!hasAnyRole(ctx, roles)) {
      opts.onForbidden!(req, res, `One of [${roles.join(', ')}] role required`);
      return;
    }

    next();
  };
}

export function requirePrivileged(options: PolicyGuardOptions = {}): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    if (!contextIsPrivileged(ctx)) {
      opts.onForbidden!(req, res, 'Librarian or admin access required');
      return;
    }

    next();
  };
}

export function requireAdmin(options: PolicyGuardOptions = {}): RequestHandler {
  return requireRole(USER_ROLES.ADMIN, options);
}

export function requireLibrarian(options: PolicyGuardOptions = {}): RequestHandler {
  return requireAnyRole(PRIVILEGED_ROLES, options);
}

export function requirePermission(permission: Permission, options: PolicyGuardOptions = {}): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    if (!hasPermission(ctx, permission)) {
      opts.onForbidden!(req, res, `Permission '${permission}' required`);
      return;
    }

    next();
  };
}

export function requireAnyPermission(permissions: Permission[], options: PolicyGuardOptions = {}): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    if (!hasAnyPermission(ctx, permissions)) {
      opts.onForbidden!(req, res, `One of permissions [${permissions.join(', ')}] required`);
      return;
    }

    next();
  };
}

export function requireResourceUserOrRole(
  getResourceUserId: (req: Request) => string | undefined | Promise<string | undefined>,
  role: UserRole,
  options: PolicyGuardOptions = {}
): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    const resourceUserId = await getResourceUserId(req);
    const isResourceUser = resourceUserId === ctx.userId;

    if (isResourceUser || hasRole(ctx, role)) {
      next();
      return;
    }

    opts.onForbidden!(req, res, 'Access denied: not resource user and insufficient role');
  };
}

export function requireResourceUserOrPrivileged(
  getResourceUserId: (req: Request) => string | undefined | Promise<string | undefined>,
  options: PolicyGuardOptions = {}
): RequestHandler {
  const opts = { ...defaultOptions, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractAuthContext(req);

    if (!ctx.isAuthenticated || !ctx.userId) {
      opts.onUnauthorized!(req, res);
      return;
    }

    const resourceUserId = await getResourceUserId(req);
    const isResourceUser = resourceUserId === ctx.userId;

    if (isResourceUser || contextIsPrivileged(ctx)) {
      next();
      return;
    }

    opts.onForbidden!(req, res, 'Access denied: not resource user and not privileged');
  };
}

export const PolicyGuards = {
  attachAuthContext,
  extractAuthContext,
  requireAuthenticated,
  requireRole,
  requireAnyRole,
  requirePrivileged,
  requireAdmin,
  requireLibrarian,
  requirePermission,
  requireAnyPermission,
  requireResourceUserOrRole,
  requireResourceUserOrPrivileged,
};
