/**
 * Logging Middleware
 *
 * Express middleware for request logging with correlation
 */

import { Request, Response, NextFunction } from 'express';
import { LogContext } from './types';
import { getLogger } from './logger';
import { correlationStorage, generateCorrelationId } from './correlation';

/**
 * Express middleware for request logging with correlation ID
 */
export function requestLogger(serviceName: string) {
  const logger = getLogger(serviceName);

  return (req: Request, res: Response, next: NextFunction) => {
    const rawCorrelationId = req.headers['x-correlation-id'] || req.headers['correlation-id'] || generateCorrelationId();
    const correlationId = Array.isArray(rawCorrelationId) ? rawCorrelationId[0] : rawCorrelationId;

    const context: LogContext = {
      correlationId,
      service: serviceName,
      method: req.method,
      url: req.url,
      userAgent: req.get('user-agent'),
      ip: req.ip || req.connection?.remoteAddress,
    };

    (req as unknown as Record<string, unknown>).log = logger.child(context);
    res.setHeader('x-correlation-id', correlationId);

    correlationStorage.run(context, () => {
      next();
    });
  };
}
