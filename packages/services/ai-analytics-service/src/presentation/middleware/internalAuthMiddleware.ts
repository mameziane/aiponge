import type { Request, Response, NextFunction } from 'express';
import { getResponseHelpers } from '@aiponge/platform-core';

const { ServiceErrors } = getResponseHelpers();

export function internalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (!internalSecret) {
    if (process.env.NODE_ENV === 'production') {
      ServiceErrors.internal(res, 'INTERNAL_SERVICE_SECRET is not configured', undefined, req);
      return;
    }
    next();
    return;
  }

  const authHeader = req.headers['x-service-auth'] || req.headers['x-internal-secret'];
  if (authHeader !== internalSecret) {
    ServiceErrors.forbidden(res, 'Internal service auth required', req);
    return;
  }

  next();
}
