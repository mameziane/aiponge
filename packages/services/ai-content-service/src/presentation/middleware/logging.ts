/**
 * Logging Middleware
 * Request/response logging for the content service
 */

import { Request, Response, NextFunction } from 'express';
import { contentServiceConfig } from '../../config/service-config';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('ai-content-service-logging');

export interface RequestLogData {
  method: string;
  url: string;
  userAgent?: string;
  ip: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  contentLength?: number;
  duration?: number;
  statusCode?: number;
}

type OriginalEnd = Response['end'];

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  req.requestId = requestId;

  const logData: RequestLogData = {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    timestamp: new Date().toISOString(),
    requestId,
    userId: req.userId || req.get('X-User-ID'),
    contentLength: req.get('Content-Length') ? parseInt(req.get('Content-Length') || '0') : undefined,
  };

  if (process.env.NODE_ENV === 'development' || contentServiceConfig.logging.level === 'debug') {
    logger.info('📥 ${logData.method} ${logData.url}', {
      data: {
        requestId: logData.requestId,
        ip: logData.ip,
        userAgent: logData.userAgent,
      },
    });
  }

  const originalEnd: OriginalEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, encoding?: BufferEncoding, cb?: () => void): Response {
    const duration = Date.now() - startTime;

    logData.duration = duration;
    logData.statusCode = res.statusCode;

    const _logLevel = res.statusCode >= 400 ? 'error' : 'info';
    const _emoji = res.statusCode >= 500 ? '💥' : res.statusCode >= 400 ? '⚠️' : res.statusCode >= 300 ? '↩️' : '✅';

    logger.info('${emoji} ${logData.method} ${logData.url} - ${res.statusCode} (${duration}ms)', {
      data: {
        requestId: logData.requestId,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length'),
      },
    });

    if (duration > 5000) {
      logger.warn('🐌 ${logData.method} ${logData.url} took ${duration}ms', { data: logData });
    }

    if (res.statusCode >= 400) {
      logger.error('🚨 ${logData.method} ${logData.url}', {
        data: {
          ...logData,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
        },
      });
    }

    return originalEnd(chunk as string, encoding as BufferEncoding, cb);
  } as OriginalEnd;

  next();
}

export function createRequestLogger(serviceName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    req.requestId = requestId;
    req.serviceName = serviceName;

    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Service-Name', serviceName);

    const originalEnd: OriginalEnd = res.end.bind(res);
    res.end = function (chunk?: unknown, encoding?: BufferEncoding, cb?: () => void): Response {
      const duration = Date.now() - startTime;

      logger.info('[${serviceName}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)', {
        data: {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      return originalEnd(chunk as string, encoding as BufferEncoding, cb);
    } as OriginalEnd;

    next();
  };
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    req.get('X-Correlation-ID') || req.get('X-Request-ID') || Math.random().toString(36).substring(7);

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
