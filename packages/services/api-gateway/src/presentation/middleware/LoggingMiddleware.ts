/**
 * Logging Middleware
 * Infrastructure layer request logging
 */
import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../config/service-urls';
import { randomUUID } from 'crypto';

const logger = getLogger('api-gateway-loggingmiddleware');

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = randomUUID();
  req.headers['x-request-id'] = requestId;

  logger.info(`[REQUEST] ${new Date().toISOString()} - ${requestId} - ${req.method} ${req.path}`, {
    module: 'api_gateway_logging_middleware',
    operation: 'loggingMiddleware',
    requestId,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    phase: 'request_logged',
  });

  const originalSend = res.send;
  res.send = function (_body: unknown): Response {
    const duration = Date.now() - startTime;
    logger.warn('{} - {} - {} - {}ms', {
      data0: new Date().toISOString(),
      data1: requestId,
      data2: res.statusCode,
      data3: duration,
    });
    return originalSend.call(this, _body);
  };

  next();
}
