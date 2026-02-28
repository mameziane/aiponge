/**
 * Logging Middleware
 * Provides request/response logging and monitoring for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('ai-config-service-logging');

interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  serviceId?: string;
  requestId: string;
  requestSize?: number;
  responseSize?: number;
  error?: string;
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate request/response size
 */
function calculateSize(data: unknown): number {
  if (!data) return 0;
  if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
  if (typeof data === 'object') return Buffer.byteLength(JSON.stringify(data), 'utf8');
  return 0;
}

/**
 * Mask sensitive data in logs
 */
function maskSensitiveData(data: unknown): unknown {
  if (typeof data !== 'object' || !data) return data;

  const sensitiveKeys = ['password', 'secret', 'token', 'key', 'auth', 'authorization', 'api_key'];
  const masked = { ...data } as Record<string, unknown>;

  for (const key in masked) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      const value = masked[key];
      if (typeof value === 'string' && value.length > 8) {
        masked[key] = `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
      } else {
        masked[key] = '***';
      }
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }

  return masked;
}

/**
 * Main logging middleware
 */
export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Add request ID to request object for use in other middleware/controllers
  (req as Request & { requestId: string }).requestId = requestId;

  // Log incoming request
  const requestLog = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    serviceId: (req as Request & { auth?: { serviceId?: string } }).auth?.serviceId,
    ip: req.ip || req.connection.remoteAddress,
    headers: maskSensitiveData(req.headers),
    query: req.query,
    body: req.method !== 'GET' ? maskSensitiveData(req.body) : undefined,
  };

  logger.debug('📥 {} {} | {} | {}', {
    data0: req.method,
    data1: req.url,
    data2: requestId,
    data3: requestLog.serviceId || 'anonymous',
  });

  // Detailed logging in development
  if (process.env.NODE_ENV === 'development') {
    logger.debug('📋 Request Details:', { data: JSON.stringify(requestLog, null, 2) });
  }

  // Override res.end to capture response
  const originalEnd = res.end.bind(res);
  const originalJson = res.json.bind(res);
  let responseBody: unknown;

  // Capture JSON responses
  res.json = function (body: unknown) {
    responseBody = body;
    return originalJson(body);
  };

  (res as unknown as Record<string, unknown>).end = function (this: Response, ...args: unknown[]) {
    const duration = Date.now() - startTime;

    // Create response log entry
    const responseLog: LogEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      serviceId: (req as Request & { auth?: { serviceId?: string } }).auth?.serviceId,
      requestId,
      requestSize: calculateSize(req.body),
      responseSize: calculateSize(responseBody || args[0]),
    };

    // Add error info if response indicates error
    if (res.statusCode >= 400) {
      const errorBody = responseBody as { error?: { message?: string } } | undefined;
      responseLog.error = errorBody?.error?.message || 'Unknown error';
    }

    // Log response with appropriate level
    if (res.statusCode >= 500) {
      logger.error('📤 {} {} | {} | {} | {}ms | ERROR: {}', {
        data0: req.method,
        data1: req.url,
        data2: requestId,
        data3: res.statusCode,
        data4: duration,
        data5: responseLog.error,
      });
    } else if (res.statusCode >= 400) {
      logger.warn('📤 {} {} | {} | {} | {}ms | WARN: {}', {
        data0: req.method,
        data1: req.url,
        data2: requestId,
        data3: res.statusCode,
        data4: duration,
        data5: responseLog.error,
      });
    } else {
      const logMethod = duration > 5000 ? 'warn' : 'debug';
      logger[logMethod]('📤 {} {} | {} | {} | {}ms', {
        data0: req.method,
        data1: req.url,
        data2: requestId,
        data3: res.statusCode,
        data4: duration,
      });
    }

    // Detailed logging in development or for errors
    if (process.env.NODE_ENV === 'development' || res.statusCode >= 400) {
      logger[res.statusCode >= 400 ? 'info' : 'debug']('📋 Response Details:', {
        data: JSON.stringify(
          {
            ...responseLog,
            responseBody: maskSensitiveData(responseBody),
          },
          null,
          2
        ),
      });
    }

    // Log performance warnings
    if (duration > 5000) {
      logger.warn('Slow request detected: {} {} took {}ms', { data0: req.method, data1: req.url, data2: duration });
    }

    // In production, you might want to send these logs to a logging service
    // logToService(responseLog);

    return (originalEnd as (...a: unknown[]) => Response).apply(this, args);
  };

  next();
};

/**
 * Error logging middleware (should be used after other error handlers)
 */
export const errorLoggingMiddleware = (error: Error, req: Request, _res: Response, next: NextFunction) => {
  const _requestId = (req as Request & { requestId?: string }).requestId || generateRequestId();

  logger.error('💥 ${req.method} ${req.url} | ${_requestId} |', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    serviceId: (req as Request & { auth?: { serviceId?: string } }).auth?.serviceId,
    url: req.url,
    method: req.method,
    body: maskSensitiveData(req.body) as Record<string, unknown>,
    query: req.query,
  });

  // In production, send error to monitoring service
  // monitoringService.logError(error, { requestId, url: req.url, method: req.method });

  next(error);
};

/**
 * Access log middleware (simplified version for high-traffic scenarios)
 */
export const accessLogMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const serviceId = (req as Request & { auth?: { serviceId?: string } }).auth?.serviceId || 'anonymous';

    // Simple access log format: timestamp method url status duration service
    logger.info('{} {} {} {} {}ms {}', {
      data0: new Date().toISOString(),
      data1: req.method,
      data2: req.url,
      data3: res.statusCode,
      data4: duration,
      data5: serviceId,
    });
  });

  next();
};

/**
 * Metrics logging middleware
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const serviceId = (req as Request & { auth?: { serviceId?: string } }).auth?.serviceId || 'anonymous';
    const endpoint = req.route?.path || req.url;

    // Log metrics (in production, send to metrics service)
    logger.info('endpoint:{} method:{} status:{} duration:{}ms service:{}', {
      data0: endpoint,
      data1: req.method,
      data2: res.statusCode,
      data3: duration,
      data4: serviceId,
    });

    // You could send these to a metrics collection service
    // metricsCollector.recordHttpRequest({
    //   endpoint,
    //   method: req.method,
    //   statusCode: res.statusCode,
    //   duration,
    //   serviceId,
    // });
  });

  next();
};
