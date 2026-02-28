import { Request, Response, NextFunction } from 'express';
import { DomainError } from '@aiponge/platform-core';
import { getCorrelationId } from '@aiponge/shared-contracts';

interface LoggerInterface {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const errorHandlerMiddleware = (logger: LoggerInterface) => {
  return (error: Error, req: Request, res: Response, _next: NextFunction): void => {
    const correlationId = getCorrelationId(req);

    logger.error('Unhandled error:', {
      error: error.message,
      stack: error.stack,
      method: req.method,
      url: req.url,
      correlationId,
    });

    let statusCode = 500;
    let code = 'INTERNAL_ERROR';

    if (error instanceof DomainError) {
      statusCode = error.statusCode;
      code = (error as DomainError & { code?: string }).code || code;
    }

    const isDevelopment = process.env.NODE_ENV !== 'production';

    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message: error.message || 'Internal server error',
        ...(correlationId && { correlationId }),
        ...(isDevelopment && {
          stack: error.stack,
        }),
      },
      timestamp: new Date().toISOString(),
    });
  };
};
