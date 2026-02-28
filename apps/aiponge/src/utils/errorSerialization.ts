/**
 * Error Serialization Utilities
 * Provides structured error handling for frontend-backend communication
 */

import { nanoid } from 'nanoid';
import { logger } from '../lib/logger';

/**
 * Backend error response format from BaseError.toResponse()
 */
export interface BackendErrorResponse {
  success: false;
  error: {
    type: string;
    code: string;
    message: string;
    field?: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
  correlationId?: string;
}

/**
 * Serialized error object for logging
 */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string[];
  code?: string;
  statusCode?: number;
  field?: string;
  details?: unknown;
  correlationId?: string;
  timestamp?: string;
  url?: string;
}

/**
 * API Error with response data
 */
interface ApiErrorWithResponse {
  response: { data: BackendErrorResponse; status?: number };
}

/**
 * Check if error response is from backend BaseError (strict format)
 * Format: { success: false, error: { type, code, message }, timestamp, correlationId }
 */
export function isBackendError(error: unknown): error is ApiErrorWithResponse {
  const err = error as { response?: { data?: Record<string, unknown> } };
  return (
    err?.response?.data != null &&
    typeof err.response.data === 'object' &&
    err.response.data.success === false &&
    err.response.data.error != null &&
    typeof err.response.data.error === 'object' &&
    typeof (err.response.data.error as Record<string, unknown>)?.code === 'string'
  );
}

/**
 * Parse backend BaseError response
 */
export function parseBackendError(error: unknown): BackendErrorResponse {
  if (isBackendError(error)) {
    return error.response.data;
  }
  throw new Error('Not a backend error response');
}

/**
 * Serialize any error into a structured format for logging
 * @param error - The error to serialize
 * @param url - Optional URL where error occurred
 * @param correlationId - Optional correlation ID from request (IMPORTANT: pass the request's correlation ID to maintain traceability)
 */
export function serializeError(error: unknown, url?: string, correlationId?: string): SerializedError {
  const timestamp = new Date().toISOString();

  // Handle strict backend BaseError responses
  if (isBackendError(error)) {
    const backendError = error.response.data;
    return {
      name: backendError.error.type,
      message: backendError.error.message,
      code: backendError.error.code,
      statusCode: error.response?.status,
      field: backendError.error.field,
      details: backendError.error.details,
      correlationId: backendError.correlationId || correlationId,
      timestamp: backendError.timestamp,
      url,
    };
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    type ExtendedError = Error & { code?: string; statusCode?: number; details?: unknown };
    const extErr = error as ExtendedError;
    return {
      name: error.name,
      message: error.message,
      stack: (() => {
        try {
          return error.stack?.split('\n').slice(0, 5);
        } catch {
          return ['[error.stack threw]'];
        }
      })(),
      // Extract custom properties if they exist
      code: extErr.code,
      statusCode: extErr.statusCode,
      details: extErr.details,
      correlationId,
      timestamp,
      url,
    };
  }

  // Handle fetch/network errors
  if (error && typeof error === 'object') {
    type ErrorWithResponse = {
      response?: { data?: Record<string, unknown>; status?: number };
      message?: string;
      code?: string;
      config?: { url?: string };
      name?: string;
    };
    const err = error as ErrorWithResponse;

    // Check for Response object
    if (err.response) {
      const respData = err.response.data;
      const respError = respData?.error as Record<string, unknown> | undefined;
      return {
        name: 'HTTPError',
        message: (respError?.message as string) || err.message || 'Request failed',
        code: (respError?.code as string) || err.code,
        statusCode: err.response?.status,
        details: err.response?.data,
        correlationId,
        timestamp,
        url: err.config?.url || url,
      };
    }

    // Generic object with message
    if (err.message) {
      return {
        name: err.name || 'Error',
        message: err.message,
        code: err.code,
        details: err,
        correlationId,
        timestamp,
        url,
      };
    }
  }

  // Unknown error type
  return {
    name: 'UnknownError',
    message: String(error),
    correlationId,
    timestamp,
    url,
  };
}

/**
 * Check if error indicates backend is unavailable (connection refused, network error, 502/503, etc.)
 */
function isBackendUnavailableError(error: SerializedError): boolean {
  // 502 Bad Gateway and 503 Service Unavailable explicitly indicate backend is down
  if (error.statusCode === 502 || error.statusCode === 503) {
    return true;
  }

  const message = (typeof error.message === 'string' ? error.message : String(error.message || '')).toLowerCase();
  const code = (typeof error.code === 'string' ? error.code : String(error.code || '')).toLowerCase();

  const unavailablePatterns = [
    'econnrefused',
    'enotfound',
    'econnreset',
    'etimedout',
    'network error',
    'failed to fetch',
    'network request failed',
    'socket hang up',
    'connection refused',
    'unable to connect',
    'err_network',
    'err_connection',
    'service temporarily unavailable',
    'bad gateway',
  ];

  return unavailablePatterns.some(pattern => message.includes(pattern) || code.includes(pattern));
}

/**
 * Translation function type for i18n (compatible with i18next TFunction)
 */
type TranslationFn = (key: string | string[], options?: Record<string, unknown>) => string;

/**
 * Get the translation key for a given error
 * Maps error codes and conditions to i18n keys
 */
function getErrorTranslationKey(error: SerializedError): string {
  // Backend unavailable / network errors
  if (isBackendUnavailableError(error)) {
    return 'errors.serviceUnavailable';
  }

  // Map error codes to translation keys
  const codeToKeyMap: Record<string, string> = {
    NOT_AUTHENTICATED: 'errors.pleaseLogin',
    INVALID_TOKEN: 'errors.sessionExpired',
    INSUFFICIENT_PERMISSIONS: 'errors.noPermission',
    NOT_FOUND: 'errors.notFound',
    ALREADY_EXISTS: 'errors.alreadyExists',
    VALIDATION_ERROR: 'errors.validationError',
    RATE_LIMIT_EXCEEDED: 'errors.rateLimitExceeded',
    SERVICE_UNAVAILABLE: 'errors.serviceUnavailable',
    TIMEOUT_ERROR: 'errors.timeout',
    ECONNREFUSED: 'errors.serviceUnavailable',
    ERR_NETWORK: 'errors.offline',
  };

  if (error.code && codeToKeyMap[error.code]) {
    return codeToKeyMap[error.code];
  }

  // For 5xx errors, show service unavailable
  if (error.statusCode && error.statusCode >= 500) {
    return 'errors.serviceUnavailable';
  }

  // No status code and no response typically means network/connection issue
  if (!error.statusCode && !error.code) {
    return 'errors.connectionFailed';
  }

  // For 4xx errors, return empty to show original message
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return '';
  }

  return 'errors.generic';
}

/**
 * Format error for user display with i18n translation support
 * This is the preferred function for displaying error messages in the UI
 */
export function getTranslatedFriendlyMessage(error: SerializedError, t: TranslationFn): string {
  const key = getErrorTranslationKey(error);

  // For 4xx errors without specific key, show original message
  if (!key) {
    return error.message || t('errors.generic', { defaultValue: 'Something went wrong. Please try again.' });
  }

  // Use translation with fallback
  return t(key, { defaultValue: error.message || 'Something went wrong. Please try again.' });
}

/**
 * Check if an error indicates backend unavailability (exported for UI use)
 * Use this to show backend-unavailable UI states
 */
export function checkIsBackendUnavailable(error: unknown): boolean {
  const serialized = serializeError(error);
  return isBackendUnavailableError(serialized);
}

/**
 * Log error with full context
 * @param error - The error to log
 * @param context - Optional context string
 * @param url - Optional URL where error occurred
 * @param correlationId - Optional correlation ID from request (IMPORTANT: pass to maintain traceability)
 */
export function logError(error: unknown, context?: string, url?: string, correlationId?: string): SerializedError {
  const serialized = serializeError(error, url, correlationId);

  const logData = {
    context,
    ...serialized,
  };

  // 404 on /api/auth/me is expected when user session is stale - don't log as error
  const is404OnAuthMe = serialized.statusCode === 404 && url?.includes('/api/v1/auth/me');

  if (is404OnAuthMe) {
    // Silent - session will be cleared automatically
    return serialized;
  }

  const isNoResponse = !serialized.statusCode;

  if (isNoResponse) {
    logger.warn('Network error (no response)', logData);
  } else if (serialized.statusCode! >= 500) {
    logger.error('Server Error', undefined, logData);
  } else if (serialized.statusCode! >= 400) {
    logger.warn('Client Error', logData);
  } else {
    logger.error('Error', undefined, logData);
  }

  return serialized;
}
