/**
 * Correlation Utilities
 *
 * Request correlation ID management for tracing across microservices
 */

import { Request, Response, NextFunction } from 'express';
import { generateCorrelationId } from '../logging';
import { AuthenticatedRequest } from './types';

/**
 * Correlation middleware - adds correlation ID to requests
 */
export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    authReq.correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
    res.setHeader('x-correlation-id', authReq.correlationId);
    next();
  };
}

/**
 * Get correlation ID from request
 */
export function getCorrelationId(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  return authReq.correlationId || (req.headers['x-correlation-id'] as string) || generateCorrelationId();
}
