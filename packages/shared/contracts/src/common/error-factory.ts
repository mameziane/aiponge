/**
 * Structured Error Factory
 *
 * Creates consistent error responses that preserve error details across service boundaries.
 * Use this factory in all controllers to ensure meaningful error messages reach the client.
 */

import { Response } from 'express';
import { ServiceError } from './index.js';

export type ErrorCode =
  | 'UNKNOWN'
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'PAYMENT_REQUIRED'
  | 'CONFLICT'
  | 'GONE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PAYLOAD_TOO_LARGE'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';

export type ErrorType =
  | 'ValidationError'
  | 'NotFoundError'
  | 'AuthenticationError'
  | 'AuthorizationError'
  | 'PaymentRequiredError'
  | 'ConflictError'
  | 'GoneError'
  | 'RateLimitError'
  | 'TimeoutError'
  | 'ExternalServiceError'
  | 'ServiceUnavailableError'
  | 'DatabaseError'
  | 'InternalError';

export interface StructuredError {
  type: ErrorType;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  originalError?: string;
  stack?: string;
  service?: string;
  correlationId?: string;
}

/**
 * Extract meaningful error information from any error type
 * Handles DrizzleQueryError which stores the actual DB error in .cause
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  originalError: string;
  stack?: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof Error) {
    // Check for DrizzleQueryError pattern: "Failed query: ..." with cause containing actual DB error
    const cause = (error as Error & { cause?: Error }).cause;
    let actualMessage = error.message;
    let causeMessage: string | undefined;

    if (cause instanceof Error) {
      causeMessage = cause.message;
      // If the main error is a "Failed query" wrapper, prioritize the cause message
      if (error.message.startsWith('Failed query:')) {
        actualMessage = cause.message || error.message;
      }
    }

    // Extract PostgreSQL-specific error fields if available
    const pgError = error as Error & {
      code?: string;
      detail?: string;
      hint?: string;
      constraint?: string;
      table?: string;
      column?: string;
    };

    const pgDetails: Record<string, unknown> = {};
    if (pgError.code) pgDetails.pgCode = pgError.code;
    if (pgError.detail) pgDetails.pgDetail = pgError.detail;
    if (pgError.hint) pgDetails.pgHint = pgError.hint;
    if (pgError.constraint) pgDetails.pgConstraint = pgError.constraint;
    if (pgError.table) pgDetails.pgTable = pgError.table;
    if (pgError.column) pgDetails.pgColumn = pgError.column;
    if (causeMessage) pgDetails.causeMessage = causeMessage;

    const existingDetails =
      'details' in error ? (error as Error & { details?: Record<string, unknown> }).details : undefined;

    return {
      message: actualMessage,
      originalError: causeMessage ? `${error.message} | Cause: ${causeMessage}` : error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      details: Object.keys(pgDetails).length > 0 ? { ...existingDetails, ...pgDetails } : existingDetails,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      originalError: error,
    };
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    return {
      message: String(errorObj.message || errorObj.error || 'Unknown error'),
      originalError: JSON.stringify(error),
      details: errorObj.details as Record<string, unknown> | undefined,
    };
  }

  return {
    message: 'Unknown error occurred',
    originalError: String(error),
  };
}

/**
 * Create a structured error response
 */
export function createStructuredError(
  code: ErrorCode,
  type: ErrorType,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    originalError?: unknown;
    service?: string;
    correlationId?: string;
  }
): StructuredError {
  const result: StructuredError = {
    type,
    code,
    message,
  };

  if (options?.details) {
    result.details = options.details;
  }

  if (options?.originalError) {
    const errorInfo = extractErrorInfo(options.originalError);
    result.originalError = errorInfo.originalError;
    if (errorInfo.stack) {
      result.stack = errorInfo.stack;
    }
    if (errorInfo.details && !result.details) {
      result.details = errorInfo.details;
    }
  }

  if (options?.service) {
    result.service = options.service;
  }

  if (options?.correlationId) {
    result.correlationId = options.correlationId;
  }

  return result;
}

/**
 * Send a structured error response
 */
export function sendStructuredError(res: Response, statusCode: number, error: StructuredError): void {
  const extraDetails: Record<string, unknown> = {};
  if (error.originalError) extraDetails.originalError = error.originalError;
  if (error.service) extraDetails.service = error.service;

  const hasDetails = error.details || Object.keys(extraDetails).length > 0;

  const responseError: ServiceError & { stack?: string } = {
    type: error.type,
    code: error.code,
    message: error.message,
    ...(hasDetails && { details: { ...error.details, ...extraDetails } }),
    correlationId: error.correlationId,
    ...(error.stack && { stack: error.stack }),
  };

  res.status(statusCode).json({
    success: false,
    error: responseError,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Structured Error Factory
 * Use these methods in controllers to create consistent error responses
 */
export const StructuredErrors = {
  /**
   * Validation error (400) - for invalid input
   */
  validation: (
    res: Response,
    message: string,
    options?: { details?: Record<string, unknown>; originalError?: unknown; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 400, createStructuredError('VALIDATION_ERROR', 'ValidationError', message, options));
  },

  /**
   * Not found error (404) - for missing resources
   */
  notFound: (
    res: Response,
    resource: string,
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(
      res,
      404,
      createStructuredError('NOT_FOUND', 'NotFoundError', `${resource} not found`, options)
    );
  },

  /**
   * Unauthorized error (401) - for authentication failures
   */
  unauthorized: (
    res: Response,
    message: string = 'Authentication required',
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 401, createStructuredError('UNAUTHORIZED', 'AuthenticationError', message, options));
  },

  /**
   * Forbidden error (403) - for authorization failures
   */
  forbidden: (
    res: Response,
    message: string = 'Access denied',
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 403, createStructuredError('FORBIDDEN', 'AuthorizationError', message, options));
  },

  /**
   * Conflict error (409) - for duplicate resources
   */
  conflict: (
    res: Response,
    message: string,
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 409, createStructuredError('CONFLICT', 'ConflictError', message, options));
  },

  /**
   * Rate limit error (429) - for rate limiting
   */
  rateLimited: (
    res: Response,
    message: string = 'Too many requests',
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 429, createStructuredError('RATE_LIMITED', 'RateLimitError', message, options));
  },

  /**
   * External service error (502) - for third-party service failures
   */
  externalService: (
    res: Response,
    serviceName: string,
    options?: { details?: Record<string, unknown>; originalError?: unknown; correlationId?: string }
  ) => {
    sendStructuredError(
      res,
      502,
      createStructuredError(
        'EXTERNAL_SERVICE_ERROR',
        'ExternalServiceError',
        `External service error: ${serviceName}`,
        {
          ...options,
          service: serviceName,
        }
      )
    );
  },

  /**
   * Payment required error (402) - for subscription/credit requirements
   */
  paymentRequired: (
    res: Response,
    message: string = 'Payment required',
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 402, createStructuredError('PAYMENT_REQUIRED', 'PaymentRequiredError', message, options));
  },

  /**
   * Timeout error (408) - for request timeouts
   */
  timeout: (
    res: Response,
    message: string = 'Request timed out',
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 408, createStructuredError('TIMEOUT', 'TimeoutError', message, options));
  },

  /**
   * Gone error (410) - for permanently removed resources
   */
  gone: (
    res: Response,
    message: string,
    options?: { details?: Record<string, unknown>; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 410, createStructuredError('GONE', 'GoneError', message, options));
  },

  /**
   * Service unavailable error (503) - for dependency or subsystem unavailability
   */
  serviceUnavailable: (
    res: Response,
    message: string,
    options?: { details?: Record<string, unknown>; originalError?: unknown; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(
      res,
      503,
      createStructuredError('SERVICE_UNAVAILABLE', 'ServiceUnavailableError', message, options)
    );
  },

  /**
   * Database error (500) - for database failures
   */
  database: (
    res: Response,
    message: string,
    options?: { details?: Record<string, unknown>; originalError?: unknown; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 500, createStructuredError('DATABASE_ERROR', 'DatabaseError', message, options));
  },

  /**
   * Internal error (500) - for unexpected failures
   * IMPORTANT: Pass the original error to preserve error details!
   */
  internal: (
    res: Response,
    message: string,
    options?: { details?: Record<string, unknown>; originalError?: unknown; service?: string; correlationId?: string }
  ) => {
    sendStructuredError(res, 500, createStructuredError('INTERNAL_ERROR', 'InternalError', message, options));
  },

  /**
   * Create error from caught exception
   * Prefers typed errors (DomainError with statusCode) over message heuristics
   */
  fromException: (
    res: Response,
    error: unknown,
    fallbackMessage: string,
    options?: { service?: string; correlationId?: string }
  ) => {
    const errorInfo = extractErrorInfo(error);
    const message = errorInfo.message || fallbackMessage;

    const typedError = error as Record<string, unknown> | null;
    const hasStatusCode =
      typedError &&
      typeof typedError === 'object' &&
      typeof typedError.statusCode === 'number' &&
      typedError.statusCode >= 400 &&
      typedError.statusCode < 600;

    if (hasStatusCode) {
      const statusCode = typedError.statusCode as number;
      const code =
        typeof typedError.code === 'string' ? (typedError.code as ErrorCode) : statusCodeToErrorCode(statusCode);
      const type = statusCodeToErrorType(statusCode);
      sendStructuredError(
        res,
        statusCode,
        createStructuredError(code, type, message, {
          originalError: error,
          details: errorInfo.details,
          ...options,
        })
      );
      return;
    }

    const { statusCode, code, type } = classifyByMessage(message);
    sendStructuredError(
      res,
      statusCode,
      createStructuredError(code, type, message, {
        originalError: error,
        details: errorInfo.details,
        ...options,
      })
    );
  },
};

export function statusCodeToErrorCode(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 402:
      return 'PAYMENT_REQUIRED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 408:
      return 'TIMEOUT';
    case 409:
      return 'CONFLICT';
    case 410:
      return 'GONE';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'EXTERNAL_SERVICE_ERROR';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    case 504:
      return 'TIMEOUT';
    default:
      return 'INTERNAL_ERROR';
  }
}

export function statusCodeToErrorType(statusCode: number): ErrorType {
  switch (statusCode) {
    case 400:
    case 422:
      return 'ValidationError';
    case 401:
      return 'AuthenticationError';
    case 402:
      return 'PaymentRequiredError';
    case 403:
      return 'AuthorizationError';
    case 404:
      return 'NotFoundError';
    case 408:
      return 'TimeoutError';
    case 409:
      return 'ConflictError';
    case 410:
      return 'GoneError';
    case 429:
      return 'RateLimitError';
    case 502:
      return 'ExternalServiceError';
    case 503:
      return 'ServiceUnavailableError';
    case 504:
      return 'TimeoutError';
    default:
      return 'InternalError';
  }
}

function classifyByMessage(message: string): { statusCode: number; code: ErrorCode; type: ErrorType } {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
    return { statusCode: 404, code: 'NOT_FOUND', type: 'NotFoundError' };
  }
  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('authentication')) {
    return { statusCode: 401, code: 'UNAUTHORIZED', type: 'AuthenticationError' };
  }
  if (lowerMessage.includes('forbidden') || lowerMessage.includes('permission')) {
    return { statusCode: 403, code: 'FORBIDDEN', type: 'AuthorizationError' };
  }
  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid') || lowerMessage.includes('required')) {
    return { statusCode: 400, code: 'VALIDATION_ERROR', type: 'ValidationError' };
  }
  if (
    lowerMessage.includes('duplicate') ||
    lowerMessage.includes('already exists') ||
    lowerMessage.includes('conflict')
  ) {
    return { statusCode: 409, code: 'CONFLICT', type: 'ConflictError' };
  }
  if (lowerMessage.includes('database') || lowerMessage.includes('db') || lowerMessage.includes('sql')) {
    return { statusCode: 500, code: 'DATABASE_ERROR', type: 'DatabaseError' };
  }
  return { statusCode: 500, code: 'INTERNAL_ERROR', type: 'InternalError' };
}

/**
 * Helper to get correlation ID from request headers
 */
export function getCorrelationId(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  return (req.headers['x-correlation-id'] || req.headers['x-request-id']) as string | undefined;
}
