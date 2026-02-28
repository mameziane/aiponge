import type { Request, Response, NextFunction } from 'express';
import { ServiceErrors } from '../utils/response-helpers';

export function internalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (!internalSecret) {
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
