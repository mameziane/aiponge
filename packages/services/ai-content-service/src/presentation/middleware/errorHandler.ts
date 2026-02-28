import { Request, Response, NextFunction } from 'express';
import { DomainError } from '@aiponge/platform-core';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('error-handler');

export function errorHandlerMiddleware(error: Error, req: Request, res: Response, next: NextFunction): void {
  const correlationId = getCorrelationId(req);

  logger.error('Unhandled error', {
    module: 'error_handler',
    operation: 'errorHandlerMiddleware',
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    correlationId,
  });

  if (res.headersSent) {
    return next(error);
  }

  StructuredErrors.fromException(res, error, 'An unexpected error occurred', {
    correlationId,
    service: 'ai-content-service',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  StructuredErrors.notFound(res, `Route ${req.method} ${req.url}`);
}
