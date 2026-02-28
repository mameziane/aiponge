/**
 * Logging Middleware
 * Request/response logging for the AI Music Service
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

interface LoggerInterface {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface LoggingOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logRequestBody?: boolean;
  logResponseBody?: boolean;
  logHeaders?: boolean;
  sensitiveHeaders?: string[];
  sensitiveFields?: string[];
  maxBodyLength?: number;
}

export const loggingMiddleware = (logger: LoggerInterface, options: LoggingOptions = {}) => {
  const {
    logLevel = 'debug',
    logRequestBody = false,
    logResponseBody = false,
    logHeaders = false,
    sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
    sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'key'],
    maxBodyLength = 1000,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${randomUUID()}`;

    // Add request ID to request for use in other middleware/handlers
    req.headers['x-request-id'] = requestId as string;

    // Log incoming request
    const requestLogData: Record<string, unknown> = {
      requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };

    // Add headers if enabled
    if (logHeaders) {
      requestLogData.headers = sanitizeHeaders(req.headers, sensitiveHeaders);
    }

    // Add request body if enabled and not too large
    if (logRequestBody && req.body) {
      const bodyString = JSON.stringify(req.body);
      if (bodyString.length <= maxBodyLength) {
        requestLogData.body = sanitizeObject(req.body, sensitiveFields);
      } else {
        requestLogData.bodySize = bodyString.length;
        requestLogData.bodyTruncated = true;
      }
    }

    // Add query parameters
    if (Object.keys(req.query).length > 0) {
      requestLogData.query = req.query;
    }

    logger[logLevel](`📥 [Request] ${req.method} ${req.path}`, requestLogData);

    // Capture original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    let responseBody: unknown = null;

    // Override res.json to capture response body
    res.json = function (body: unknown) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Override res.send to capture response body
    res.send = function (body: unknown) {
      if (!responseBody) {
        try {
          responseBody = typeof body === 'string' ? JSON.parse(body) : body;
        } catch {
          responseBody = body;
        }
      }
      return originalSend.call(this, body);
    };

    // Log response when request is finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const responseLogData: Record<string, unknown> = {
        requestId,
        method: req.method,
        url: req.url,
        path: req.path,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        duration: `${duration}ms`,
        contentLength: res.get('content-length'),
        timestamp: new Date().toISOString(),
      };

      // Add response body if enabled and not too large
      if (logResponseBody && responseBody) {
        const bodyString = JSON.stringify(responseBody);
        if (bodyString.length <= maxBodyLength) {
          responseLogData.body = sanitizeObject(responseBody, sensitiveFields);
        } else {
          responseLogData.bodySize = bodyString.length;
          responseLogData.bodyTruncated = true;
        }
      }

      // Determine log level based on status code
      let responseLogLevel = logLevel;
      if (res.statusCode >= 500) {
        responseLogLevel = 'error';
      } else if (res.statusCode >= 400) {
        responseLogLevel = 'warn';
      } else if (res.statusCode >= 300) {
        responseLogLevel = 'info';
      }

      const statusEmoji = getStatusEmoji(res.statusCode);
      logger[responseLogLevel](
        `📤 [Response] ${statusEmoji} ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`,
        responseLogData
      );
    });

    // Log errors
    res.on('error', (error: Error) => {
      logger.error(`💥 [Response Error] ${req.method} ${req.path}`, {
        requestId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    });

    next();
  };
};

// Health check specific logging middleware (lighter logging)
export const healthCheckLoggingMiddleware = (logger: LoggerInterface) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only log health checks at debug level and with minimal info
    if (req.path === '/health' || req.path.includes('/health')) {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.debug(`💓 [Health Check] ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
      });
    }

    next();
  };
};

// Utility functions
function sanitizeHeaders(headers: Record<string, unknown>, sensitiveHeaders: string[]): Record<string, unknown> {
  const sanitized = { ...headers };
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
    if (sanitized[header.toLowerCase()]) {
      sanitized[header.toLowerCase()] = '[REDACTED]';
    }
  });
  return sanitized;
}

function sanitizeObject(obj: unknown, sensitiveFields: string[]): unknown {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized: Record<string, unknown> = Array.isArray(obj)
    ? ([...obj] as unknown as Record<string, unknown>)
    : { ...(obj as Record<string, unknown>) };

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
    Object.keys(sanitized).forEach(key => {
      if (key.toLowerCase() === field.toLowerCase()) {
        sanitized[key] = '[REDACTED]';
      }
    });
  });

  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeObject(sanitized[key], sensitiveFields);
    }
  });

  return sanitized;
}

function getStatusEmoji(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '✅';
  if (statusCode >= 300 && statusCode < 400) return '🔄';
  if (statusCode >= 400 && statusCode < 500) return '⚠️';
  if (statusCode >= 500) return '❌';
  return '❓';
}

// Request ID middleware (can be used separately)
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = `req_${Date.now()}_${randomUUID()}`;
  }

  // Set response header
  res.set('x-request-id', req.headers['x-request-id'] as string);

  next();
};
