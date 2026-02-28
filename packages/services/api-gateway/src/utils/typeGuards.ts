/**
 * Standard service response envelope
 */
export interface StructuredError {
  type: string;
  code: string;
  message: string;
  correlationId?: string;
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string | StructuredError;
  timestamp?: string;
  metadata?: {
    correlationId?: string;
    timestamp?: string;
    [key: string]: unknown;
  };
}

/**
 * Type guard to check if a response is a valid ServiceResponse envelope
 */
export function isServiceResponse<T>(response: unknown): response is ServiceResponse<T> {
  if (!response || typeof response !== 'object') {
    return false;
  }

  const obj = response as Record<string, unknown>;

  // Must have a boolean success field
  if (typeof obj.success !== 'boolean') {
    return false;
  }

  // If success is true, should have data (though it could be undefined in edge cases)
  // If success is false, should have error
  if (obj.success === false && !('error' in obj)) {
    return false;
  }

  return true;
}

/**
 * Checks if a response looks like an error (has error field but no success field)
 */
export function isErrorResponse(response: unknown): response is { error: string | StructuredError } {
  if (!response || typeof response !== 'object') {
    return false;
  }

  const obj = response as Record<string, unknown>;

  // Has error field but no success field (or success is not boolean)
  return 'error' in obj && typeof obj.success !== 'boolean';
}

/**
 * Safely wraps a response in ServiceResponse envelope
 * Detects error responses and wraps them as failures
 */
export function wrapInServiceResponse<T>(response: unknown): ServiceResponse<T> {
  if (response === null || response === undefined) {
    return {
      success: false,
      error: {
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Empty response from service',
      },
      timestamp: new Date().toISOString(),
    };
  }

  if (typeof response !== 'object') {
    return {
      success: true,
      data: response as T,
    };
  }

  const obj = response as Record<string, unknown>;

  if ('success' in obj) {
    if (obj.success === false) {
      const upstreamError = obj.error;
      const isStructured =
        upstreamError && typeof upstreamError === 'object' && 'code' in (upstreamError as Record<string, unknown>);
      return {
        success: false,
        error: isStructured
          ? (upstreamError as StructuredError)
          : {
              type: 'InternalError',
              code: 'INTERNAL_ERROR',
              message: String(upstreamError || (obj.message as string) || 'Service returned failure'),
            },
        timestamp: (obj.timestamp as string) || new Date().toISOString(),
      };
    }

    if (obj.success === true && isServiceResponse<T>(response)) {
      return response as ServiceResponse<T>;
    }
  }

  if (isErrorResponse(response)) {
    const err = response.error;
    const isStructured = err && typeof err === 'object' && 'code' in err;
    return {
      success: false,
      error: isStructured
        ? err
        : {
            type: 'InternalError',
            code: 'INTERNAL_ERROR',
            message: typeof err === 'string' ? err : String(err),
          },
      timestamp: new Date().toISOString(),
    };
  }

  return {
    success: true,
    data: response as T,
  };
}

export function extractErrorMessage(error: string | StructuredError | undefined, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}
