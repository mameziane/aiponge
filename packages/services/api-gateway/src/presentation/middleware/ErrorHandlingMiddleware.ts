/**
 * API Gateway Error Handling Middleware
 * Unified error handling using shared-backend standardization
 */
import { Request, Response, NextFunction } from 'express';
import { errorHandler, getCorrelationId } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { errorLogStore } from '../../services/ErrorLogStore';

const logger = getLogger('error-handling-middleware');

/**
 * Standardized error handling middleware for API Gateway
 */
export function errorHandlingMiddleware(error: Error, req: Request, res: Response, next: NextFunction): void {
  const correlationId = getCorrelationId(req);
  const statusCode = (error as AppError).statusCode || 500;
  const errorCode = (error as { code?: string }).code;

  const isAuthError = statusCode === 401 || statusCode === 403;
  const logLevel = isAuthError ? 'debug' : 'error';
  logger[logLevel](isAuthError ? 'Auth rejection' : '🚨 Error in API Gateway request', {
    module: 'error_handling_middleware',
    operation: 'error_handling',
    method: req.method,
    path: req.path,
    error: error.message,
    stack: !isAuthError && process.env.NODE_ENV === 'development' ? error.stack : undefined,
    correlationId,
    phase: 'request_error',
  });

  errorLogStore.addError({
    correlationId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    errorCode,
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    service: 'api-gateway',
    userId: (req as { user?: { id?: string } }).user?.id,
    userAgent: req.headers['user-agent'],
  });

  errorHandler()(error as Error & Record<string, unknown>, req, res, next);
}

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}
