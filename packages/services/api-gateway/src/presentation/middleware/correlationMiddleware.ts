/**
 * API Gateway Correlation ID Middleware
 * Generates root correlation IDs for all incoming requests and adds structured logging
 */

import { Request, Response, NextFunction } from 'express';
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
  // Try multiple sources for user ID
  const authHeader = req.headers.authorization;
  const userIdHeader = req.headers['user-id'] || req.headers['User-ID'];

  if (userIdHeader) {
    return Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
  }

  // Could extract from JWT token if needed
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Basic extraction - in real implementation would decode JWT
    try {
      const _token = authHeader.substring(7);
      // This is a placeholder - actual JWT decoding would go here
      return 'user-from-token';
    } catch (error) {
      logger.warn('Failed to extract user ID from authorization header', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
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
