import { Request, Response, NextFunction } from 'express';
import { statusCodeToErrorCode, statusCodeToErrorType, sendStructuredError } from '@aiponge/shared-contracts';
import { generateCorrelationId } from '../logging/correlation.js';
import { getLogger, createLogger } from '../logging';

const middlewareLogger = getLogger('error-handling:middleware');
const utilitiesLogger = getLogger('error-handling:utilities');

export enum DomainErrorCode {
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  CONFLICT = 'CONFLICT',
  GONE = 'GONE',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  TIMEOUT = 'TIMEOUT',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
}

export class DomainError extends Error {
  public readonly statusCode: number;
  public readonly cause?: Error;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number = 500,
    cause?: Error,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    this.cause = cause;
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.code && { code: this.code }),
      ...(this.details && { details: this.details }),
      timestamp: this.timestamp.toISOString(),
      cause: this.cause?.message,
    };
  }
}

class DetailedDomainError extends DomainError {
  constructor(
    code: DomainErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, statusCode, cause, code, details);
  }
}

export class EntryAnalysisError extends DetailedDomainError {
  constructor(message: string, details?: Record<string, unknown>, cause?: Error) {
    super(
      DomainErrorCode.INTERNAL_ERROR,
      `Entry analysis failed: ${message}`,
      500,
      { domain: 'entry-analysis', ...details },
      cause
    );
    this.name = 'EntryAnalysisError';
  }
}

export class RiskAssessmentError extends DetailedDomainError {
  constructor(message: string, details?: Record<string, unknown>, cause?: Error) {
    super(
      DomainErrorCode.INTERNAL_ERROR,
      `Risk assessment failed: ${message}`,
      500,
      { domain: 'risk-assessment', ...details },
      cause
    );
    this.name = 'RiskAssessmentError';
  }
}

export class SongGenerationError extends DetailedDomainError {
  constructor(message: string, details?: Record<string, unknown>, cause?: Error) {
    super(
      DomainErrorCode.INTERNAL_ERROR,
      `Song generation failed: ${message}`,
      500,
      { domain: 'song-generation', ...details },
      cause
    );
    this.name = 'SongGenerationError';
  }
}

export class LyricsGenerationError extends DetailedDomainError {
  constructor(message: string, details?: Record<string, unknown>, cause?: Error) {
    super(
      DomainErrorCode.INTERNAL_ERROR,
      `Lyrics generation failed: ${message}`,
      500,
      { domain: 'lyrics-generation', ...details },
      cause
    );
    this.name = 'LyricsGenerationError';
  }
}

export class ContentModerationError extends DetailedDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(DomainErrorCode.FORBIDDEN, `Content moderation: ${message}`, 403, {
      domain: 'content-moderation',
      ...details,
    });
    this.name = 'ContentModerationError';
  }
}

export class SubscriptionError extends DetailedDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(DomainErrorCode.FORBIDDEN, `Subscription error: ${message}`, 403, { domain: 'subscription', ...details });
    this.name = 'SubscriptionError';
  }
}

export class CreditError extends DetailedDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(DomainErrorCode.FORBIDDEN, `Credit error: ${message}`, 403, { domain: 'credits', ...details });
    this.name = 'CreditError';
  }
}

export class DomainServiceError<T extends string> extends DomainError {
  public declare readonly code: T;

  constructor(
    message: string,
    statusCode: number,
    code: T,
    cause?: Error,
    serviceName?: string
  ) {
    super(message, statusCode, cause, code);
    if (serviceName) this.name = `${serviceName}Error`;
    this.code = code;
  }
}

export function createDomainServiceError<T extends string>(
  serviceName: string,
  domainErrorCodes: Record<string, T>
) {
  class ServiceError extends DomainServiceError<T> {
    constructor(message: string, statusCode = 500, code?: T, cause?: Error) {
      super(message, statusCode, code || (domainErrorCodes.INTERNAL_ERROR as T), cause, serviceName);
    }

    static notFound(resource: string, id?: string) {
      const msg = id ? `${resource} not found: ${id}` : `${resource} not found`;
      return new ServiceError(msg, 404, domainErrorCodes.NOT_FOUND as T);
    }

    static validationError(field: string, message: string) {
      return new ServiceError(`Validation failed for ${field}: ${message}`, 400, domainErrorCodes.VALIDATION_ERROR as T);
    }

    static unauthorized(message = 'Unauthorized') {
      return new ServiceError(message, 401, domainErrorCodes.UNAUTHORIZED as T);
    }

    static forbidden(message = 'Forbidden') {
      return new ServiceError(message, 403, domainErrorCodes.FORBIDDEN as T);
    }

    static internalError(message: string, cause?: Error) {
      return new ServiceError(message, 500, domainErrorCodes.INTERNAL_ERROR as T, cause);
    }

    static serviceUnavailable(service: string, cause?: Error) {
      return new ServiceError(`Service unavailable: ${service}`, 503, domainErrorCodes.SERVICE_UNAVAILABLE as T, cause);
    }
  }

  return ServiceError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

export function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

export function wrapError(error: unknown, fallbackMessage = 'Unknown error'): DomainError {
  if (error instanceof DomainError) return error;
  if (error instanceof Error) {
    const errRecord = error as Error & Record<string, unknown>;
    const code = (errRecord.code as string) || (errRecord.errorCode as string);
    const details = errRecord.details as Record<string, unknown> | undefined;
    return new DomainError(error.message, (errRecord.statusCode as number) || 500, error, code, details);
  }
  return new DomainError(String(error) || fallbackMessage, 500);
}

// Matches any DomainError (including DetailedDomainError subclasses) by error code.
// Widened from DetailedDomainError to DomainError since DomainError now carries code natively.
export function isErrorCode(error: unknown, code: DomainErrorCode): boolean {
  return error instanceof DomainError && error.code === code;
}

function resolveCorrelationId(req: Request): string | undefined {
  return (req.headers['x-correlation-id'] || req.headers['x-request-id']) as string | undefined;
}

export function sendErrorResponse(
  res: Response,
  statusCode: number,
  message: string,
  options?: {
    code?: string;
    type?: string;
    details?: Record<string, unknown>;
    correlationId?: string;
    stack?: string;
  }
): void {
  const code = options?.code || statusCodeToErrorCode(statusCode);
  const type = options?.type || statusCodeToErrorType(statusCode);
  const isDevelopment = process.env.NODE_ENV !== 'production';

  sendStructuredError(res, statusCode, {
    type: type as import('@aiponge/shared-contracts').ErrorType,
    code: code as import('@aiponge/shared-contracts').ErrorCode,
    message,
    details: options?.details,
    correlationId: options?.correlationId,
    stack: isDevelopment ? options?.stack : undefined,
  });
}

export function errorHandler() {
  return (error: Error & Record<string, unknown>, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) return next(error);

    const correlationId = resolveCorrelationId(req);

    if (error instanceof DomainError) {
      const statusCode = error.statusCode;
      const code = error.code || statusCodeToErrorCode(statusCode);
      const type = statusCodeToErrorType(statusCode);
      const details = error.details as Record<string, unknown> | undefined;

      middlewareLogger.error('DomainError caught', {
        error: error.message,
        statusCode,
        code,
        correlationId,
        url: req.url,
        method: req.method,
      });

      sendErrorResponse(res, statusCode, error.message, { code, type, details, correlationId, stack: error.stack });
      return;
    }

    if (error.name === 'ValidationError' || error.type === 'validation') {
      sendErrorResponse(res, 422, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        correlationId,
        details: (error.details || error.errors) as Record<string, unknown> | undefined,
      });
      return;
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      sendErrorResponse(res, 401, 'Invalid or expired token', { code: 'INVALID_TOKEN', correlationId });
      return;
    }

    const statusCode = ((error.statusCode as number) || (error.status as number) || 500);
    const message =
      process.env.NODE_ENV === 'production' && statusCode >= 500
        ? 'Internal Server Error'
        : error.message || 'Unknown error occurred';

    middlewareLogger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      correlationId,
      url: req.url,
      method: req.method,
    });

    sendErrorResponse(res, statusCode, message, { correlationId, stack: error.stack });
  };
}

export function asyncHandler<T extends unknown[], R>(fn: (...args: T) => Promise<R>): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (args.length >= 3 && typeof args[2] === 'function') {
        (args[2] as NextFunction)(error);
        return undefined as R;
      }
      throw error;
    }
  };
}

export function notFoundHandler() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const error = new DomainError(`Route ${req.method} ${req.path} not found`, 404);
    next(error);
  };
}

export function logAndTrackError(
  error: unknown,
  context?: string,
  metadata?: Record<string, unknown>,
  code?: string,
  statusCode?: number,
  existingCorrelationId?: string
) {
  const correlationId = existingCorrelationId || generateCorrelationId();
  const errorDetails = {
    message: error instanceof Error ? error.message : 'Unknown error',
    context: context || 'unknown context',
    metadata: metadata || {},
    code: code || 'UNKNOWN_ERROR',
    statusCode: statusCode || 500,
    correlationId,
  };

  utilitiesLogger.error('Error occurred', errorDetails);

  return {
    error: error,
    correlationId,
  };
}

const FATAL_REJECTION_CODES = new Set(['ENOMEM', 'ERR_OUT_OF_MEMORY', 'ERR_WORKER_INIT_FAILED']);
const FATAL_REJECTION_NAMES = new Set(['RangeError']);
const FATAL_REJECTION_MESSAGES = ['maximum call stack size exceeded', 'out of memory', 'heap out of memory'];

function isFatalRejection(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  if (FATAL_REJECTION_NAMES.has(reason.name)) return true;
  const code = (reason as NodeJS.ErrnoException).code;
  if (code && FATAL_REJECTION_CODES.has(code)) return true;
  const msg = reason.message.toLowerCase();
  return FATAL_REJECTION_MESSAGES.some(m => msg.includes(m));
}

type ErrorHandlerSource = 'platform-core' | 'orchestration-bootstrap' | 'service-specific' | 'service-locator';

interface ErrorHandlerInfo {
  source: ErrorHandlerSource;
  timestamp: Date;
  handlerType: 'uncaughtException' | 'unhandledRejection' | 'SIGINT' | 'SIGTERM';
}

export class ErrorHandlerManager {
  private static instance: ErrorHandlerManager;
  private logger = createLogger('error-handler-manager');
  private registeredHandlers = new Map<string, ErrorHandlerInfo>();
  private isInitialized = false;
  private shutdownHooks: Array<() => Promise<void>> = [];

  private constructor() {}

  public static getInstance(): ErrorHandlerManager {
    if (!ErrorHandlerManager.instance) {
      ErrorHandlerManager.instance = new ErrorHandlerManager();
    }
    return ErrorHandlerManager.instance;
  }

  public registerGlobalHandlers(source: ErrorHandlerSource): void {
    if (this.isInitialized) {
      this.logger.debug(`Global error handlers already registered, ignoring duplicate call from: ${source}`, {
        source,
        existingHandlers: Array.from(this.registeredHandlers.keys()),
      });
      return;
    }

    this.logger.debug(`Registering global error handlers from: ${source}`, { source });
    process.setMaxListeners(15);

    if (!this.registeredHandlers.has('uncaughtException')) {
      process.on('uncaughtException', (error: Error) => {
        this.logger.error('Uncaught Exception:', {
          error: error.message,
          stack: error.stack,
          source: 'global-handler',
        });
        if (process.env.NODE_ENV === 'production') {
          this.logger.error('Uncaught exception in production - terminating process');
          process.exit(1);
        }
      });
      this.registeredHandlers.set('uncaughtException', {
        source,
        timestamp: new Date(),
        handlerType: 'uncaughtException',
      });
    }

    if (!this.registeredHandlers.has('unhandledRejection')) {
      process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
        const isFatal = isFatalRejection(reason);
        this.logger.error('Unhandled Promise Rejection:', {
          reason: reason instanceof Error ? reason.message : String(reason ?? 'Unknown reason'),
          stack: reason instanceof Error ? reason.stack : 'No stack trace',
          source: 'global-handler',
          fatal: isFatal,
        });
        if (process.env.NODE_ENV === 'production' && isFatal) {
          this.logger.error('Fatal unhandled rejection in production - terminating process');
          process.exit(1);
        }
      });
      this.registeredHandlers.set('unhandledRejection', {
        source,
        timestamp: new Date(),
        handlerType: 'unhandledRejection',
      });
    }

    if (!this.registeredHandlers.has('SIGINT')) {
      process.on('SIGINT', () => {
        this.logger.info('Received SIGINT - initiating graceful shutdown');
        this.gracefulShutdown('SIGINT');
      });
      this.registeredHandlers.set('SIGINT', { source, timestamp: new Date(), handlerType: 'SIGINT' });
    }

    if (!this.registeredHandlers.has('SIGTERM')) {
      process.on('SIGTERM', () => {
        this.logger.info('Received SIGTERM - initiating graceful shutdown');
        this.gracefulShutdown('SIGTERM');
      });
      this.registeredHandlers.set('SIGTERM', { source, timestamp: new Date(), handlerType: 'SIGTERM' });
    }

    this.isInitialized = true;
    this.logger.debug('Global error handlers registered successfully', {
      source,
      handlersCount: this.registeredHandlers.size,
      maxListeners: process.getMaxListeners(),
    });
  }

  public registerShutdownHook(hook: () => Promise<void>): void {
    this.shutdownHooks.push(hook);
  }

  private gracefulShutdown(signal: string): void {
    this.logger.info(`Starting graceful shutdown (${signal})...`);

    const runHooksAndExit = async () => {
      for (const hook of this.shutdownHooks) {
        try {
          await hook();
        } catch (error) {
          this.logger.error('Shutdown hook error', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    const forceExitTimeout = setTimeout(() => {
      this.logger.warn('Shutdown hooks timed out, forcing exit');
      process.exit(1);
    }, 10000);
    if (typeof forceExitTimeout === 'object' && forceExitTimeout && 'unref' in forceExitTimeout) {
      (forceExitTimeout as NodeJS.Timeout).unref();
    }

    void runHooksAndExit();
  }

  public getRegistrationStatus(): {
    isInitialized: boolean;
    handlers: Array<{ type: string; source: ErrorHandlerSource; timestamp: Date }>;
    maxListeners: number;
  } {
    return {
      isInitialized: this.isInitialized,
      handlers: Array.from(this.registeredHandlers.entries()).map(([type, info]) => ({
        type,
        source: info.source,
        timestamp: info.timestamp,
      })),
      maxListeners: process.getMaxListeners(),
    };
  }
}

export function registerGlobalErrorHandlers(source: ErrorHandlerSource): void {
  ErrorHandlerManager.getInstance().registerGlobalHandlers(source);
}
