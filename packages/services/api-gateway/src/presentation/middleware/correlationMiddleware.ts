/**
 * API Gateway Correlation ID Middleware
 * Generates root correlation IDs for all incoming requests and adds structured logging
 */

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../config/service-urls';
import { getAnalyticsEventPublisher } from '@aiponge/platform-core';

const generateCorrelationId = () => uuidv4();
const getOrCreateCorrelationId = (headers: Record<string, string | string[] | undefined>): string => {
  const existing = headers['x-correlation-id'];
  if (Array.isArray(existing)) return existing[0] || generateCorrelationId();
  return existing || generateCorrelationId();
};
const createCorrelationContext = (id: string, service: string, metadata: Record<string, unknown>) => ({
  correlationId: id,
  service,
  ...metadata,
});

const logger = getLogger('api-gateway:correlation');

/**
 * Extended request interface with correlation ID
 */
export interface RequestWithCorrelationId extends Request {
  correlationId?: string;
  startTime?: number;
}

/**
 * API Gateway correlation middleware - generates root correlation IDs
 */
export function apiGatewayCorrelationMiddleware(
  req: RequestWithCorrelationId,
  res: Response,
  next: NextFunction
): void {
  // Generate or extract correlation ID (root level for all requests)
  const correlationId = getOrCreateCorrelationId(req.headers);
  const startTime = Date.now();

  // Attach to request object
  req.correlationId = correlationId;
  req.startTime = startTime;

  // Set response header for downstream services and client visibility
  res.setHeader('x-correlation-id', correlationId);

  // Create correlation context for this request
  const context = createCorrelationContext(correlationId, 'api-gateway', {
    operation: `${req.method}-${req.path}`,
    userId: extractUserId(req),
    metadata: {
      method: req.method,
      path: req.path,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      route: req.route?.path,
    },
  });

  // Log incoming request
  logger.debug('incoming-request', {
    ...context,
    method: req.method,
    path: req.path,
    route: req.route?.path,
    hasAuth: !!req.headers.authorization,
    contentType: req.get('content-type'),
    userAgent: req.get('user-agent'),
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';

    logger[logLevel]('request-completion', {
      ...context,
      duration,
      statusCode: res.statusCode,
      responseSize: res.get('content-length'),
      cacheHit: res.get('x-cache') === 'HIT',
    });

    try {
      const publisher = getAnalyticsEventPublisher('api-gateway');
      publisher.publishDirect('analytics.trace.completed', {
        correlationId,
        userId: extractUserId(req),
        entryService: 'api-gateway',
        entryOperation: `${req.method} ${req.path}`,
        httpMethod: req.method,
        httpPath: req.path,
        httpStatusCode: res.statusCode,
        totalDurationMs: duration,
        status: res.statusCode >= 400 ? 'error' : 'completed',
        spanCount: 0,
      });

      const userId = extractUserId(req);
      if (userId) {
        publisher.recordEvent({
          eventType: 'api_request',
          eventData: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
            correlationId,
          },
          userId,
        });
      }
    } catch (err) {
      logger.warn('Failed to publish trace event', { error: err instanceof Error ? err.message : String(err) });
    }
  });

  next();
}

/**
 * Extract user ID from request (from token, headers, etc.)
 */
function extractUserId(req: Request): string | undefined {
  // 1. Check x-user-id header (set by jwtAuthMiddleware after JWT verification)
  const xUserId = req.headers['x-user-id'];
  if (xUserId) {
    return Array.isArray(xUserId) ? xUserId[0] : xUserId;
  }

  // 2. Check res.locals.userId (set by jwtAuthMiddleware)
  const locals = (req.res as Response | undefined)?.locals;
  if (locals?.userId && typeof locals.userId === 'string') {
    return locals.userId;
  }

  // 3. Fallback: check legacy user-id header
  const userIdHeader = req.headers['user-id'];
  if (userIdHeader) {
    return Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
  }

  return undefined;
}

/**
 * Get correlation ID from request
 */
export function getCorrelationId(req: RequestWithCorrelationId): string {
  return req.correlationId || 'unknown';
}

/**
 * Create correlation-aware error response
 */
export function createCorrelationErrorResponse(req: RequestWithCorrelationId, error: Error, statusCode: number = 500) {
  const correlationId = getCorrelationId(req);

  return {
    success: false,
    error: {
      message: error.message,
      type: error.constructor.name,
      correlationId,
      timestamp: new Date().toISOString(),
    },
    correlationId,
  };
}
