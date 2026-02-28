/**
 * Shared Response Helpers for aiponge Microservices
 *
 * Factory functions to create service-specific response helpers with consistent
 * response formats matching the ServiceResponse<T> contract from @aiponge/shared-contracts.
 *
 * Usage:
 *   import { createResponseHelpers } from '@aiponge/platform-core';
 *   const { sendSuccess, sendCreated, ServiceErrors } = createResponseHelpers('my-service');
 */

import { Response } from 'express';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';

type RequestWithHeaders = { headers: Record<string, string | string[] | undefined> };

type MessageInput = string | { code?: string; message: string } | undefined;

function normalizeMessage(input: MessageInput, fallback: string): string {
  if (!input) return fallback;
  if (typeof input === 'string') return input;
  return input.message || fallback;
}

export interface ServiceErrorHelpers {
  fromException: (res: Response, error: unknown, fallbackMessage: string, req?: RequestWithHeaders) => void;

  notFound: (res: Response, resource: string, req?: RequestWithHeaders) => void;

  badRequest: (
    res: Response,
    message: MessageInput,
    req?: RequestWithHeaders,
    details?: Record<string, unknown>
  ) => void;

  unauthorized: (res: Response, message?: MessageInput, req?: RequestWithHeaders) => void;

  forbidden: (
    res: Response,
    message?: MessageInput,
    req?: RequestWithHeaders,
    details?: Record<string, unknown>
  ) => void;

  paymentRequired: (
    res: Response,
    message?: MessageInput,
    req?: RequestWithHeaders,
    details?: Record<string, unknown>
  ) => void;

  conflict: (res: Response, message: MessageInput, req?: RequestWithHeaders) => void;

  timeout: (res: Response, message?: MessageInput, req?: RequestWithHeaders, details?: Record<string, unknown>) => void;

  gone: (res: Response, message: MessageInput, req?: RequestWithHeaders) => void;

  internal: (res: Response, message: MessageInput, originalError?: unknown, req?: RequestWithHeaders) => void;

  serviceUnavailable: (res: Response, message: MessageInput, req?: RequestWithHeaders) => void;

  database: (res: Response, message: MessageInput, originalError?: unknown, req?: RequestWithHeaders) => void;
}

export interface GatewayServiceErrorHelpers extends ServiceErrorHelpers {
  fromUpstream: (res: Response, error: unknown, fallbackMessage: string, req?: RequestWithHeaders) => void;
}

export interface ResponseHelpers {
  sendSuccess: <T>(res: Response, data: T, statusCode?: number) => void;
  sendCreated: <T>(res: Response, data: T) => void;
  ServiceErrors: ServiceErrorHelpers;
}

export interface GatewayResponseHelpers extends Omit<ResponseHelpers, 'ServiceErrors'> {
  sendSuccess: <T>(res: Response, data: T, statusCode?: number) => void;
  sendCreated: <T>(res: Response, data: T) => void;
  forwardServiceError: (
    res: Response,
    statusCode: number,
    errorBody: { success: false; error: unknown; timestamp?: string },
    req?: RequestWithHeaders
  ) => void;
  ServiceErrors: GatewayServiceErrorHelpers;
}

function createServiceErrors(serviceName: string): ServiceErrorHelpers {
  return {
    fromException: (res: Response, error: unknown, fallbackMessage: string, req?: RequestWithHeaders) => {
      StructuredErrors.fromException(res, error, fallbackMessage, {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
      });
    },

    notFound: (res: Response, resource: string, req?: RequestWithHeaders) => {
      StructuredErrors.notFound(res, resource, {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
      });
    },

    badRequest: (res: Response, message: MessageInput, req?: RequestWithHeaders, details?: Record<string, unknown>) => {
      StructuredErrors.validation(res, normalizeMessage(message, 'Bad request'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
        details,
      });
    },

    unauthorized: (res: Response, message: MessageInput = 'Unauthorized', req?: RequestWithHeaders) => {
      StructuredErrors.unauthorized(res, normalizeMessage(message, 'Unauthorized'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
      });
    },

    forbidden: (
      res: Response,
      message: MessageInput = 'Forbidden',
      req?: RequestWithHeaders,
      details?: Record<string, unknown>
    ) => {
      StructuredErrors.forbidden(res, normalizeMessage(message, 'Forbidden'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
        ...details,
      });
    },

    paymentRequired: (
      res: Response,
      message: MessageInput = 'Payment required',
      req?: RequestWithHeaders,
      details?: Record<string, unknown>
    ) => {
      StructuredErrors.paymentRequired(res, normalizeMessage(message, 'Payment required'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
        details,
      });
    },

    conflict: (res: Response, message: MessageInput, req?: RequestWithHeaders) => {
      StructuredErrors.conflict(res, normalizeMessage(message, 'Conflict'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
      });
    },

    timeout: (
      res: Response,
      message: MessageInput = 'Request timed out',
      req?: RequestWithHeaders,
      details?: Record<string, unknown>
    ) => {
      StructuredErrors.timeout(res, normalizeMessage(message, 'Request timed out'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
        details,
      });
    },

    gone: (res: Response, message: MessageInput, req?: RequestWithHeaders) => {
      StructuredErrors.gone(res, normalizeMessage(message, 'Gone'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
      });
    },

    internal: (res: Response, message: MessageInput, originalError?: unknown, req?: RequestWithHeaders) => {
      StructuredErrors.internal(res, normalizeMessage(message, 'Internal error'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
        originalError,
      });
    },

    serviceUnavailable: (res: Response, message: MessageInput, req?: RequestWithHeaders) => {
      StructuredErrors.serviceUnavailable(res, normalizeMessage(message, 'Service unavailable'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
      });
    },

    database: (res: Response, message: MessageInput, originalError?: unknown, req?: RequestWithHeaders) => {
      StructuredErrors.database(res, normalizeMessage(message, 'Database error'), {
        service: serviceName,
        correlationId: req ? getCorrelationId(req) : undefined,
        originalError,
      });
    },
  };
}

function createSendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}

function createSendCreated<T>(res: Response, data: T): void {
  createSendSuccess(res, data, 201);
}

/**
 * Create response helpers for a specific service
 *
 * @param serviceName - The name of the service (e.g., 'user-service', 'music-service')
 * @returns Response helper functions configured for the service
 *
 * @example
 * ```typescript
 * import { createResponseHelpers } from '@aiponge/platform-core';
 *
 * const { sendSuccess, sendCreated, ServiceErrors } = createResponseHelpers('my-service');
 *
 * // In a controller:
 * async getUser(req: Request, res: Response) {
 *   try {
 *     const user = await this.userService.findById(req.params.id);
 *     if (!user) {
 *       ServiceErrors.notFound(res, 'User', req);
 *       return;
 *     }
 *     sendSuccess(res, user);
 *   } catch (error) {
 *     ServiceErrors.fromException(res, error, 'Failed to get user', req);
 *   }
 * }
 * ```
 */
export function createResponseHelpers(serviceName: string): ResponseHelpers {
  return {
    sendSuccess: createSendSuccess,
    sendCreated: createSendCreated,
    ServiceErrors: createServiceErrors(serviceName),
  };
}

/**
 * Create response helpers for the API Gateway with additional upstream error handling
 *
 * @param serviceName - The service name (typically 'api-gateway')
 * @returns Extended response helper functions including upstream error forwarding
 */
export function createGatewayResponseHelpers(serviceName: string = 'api-gateway'): GatewayResponseHelpers {
  const baseHelpers = createResponseHelpers(serviceName);

  const forwardServiceError = (
    res: Response,
    statusCode: number,
    errorBody: { success: false; error: unknown; timestamp?: string },
    req?: RequestWithHeaders
  ): void => {
    const correlationId = req ? getCorrelationId(req) : undefined;

    if (typeof errorBody.error === 'object' && errorBody.error !== null) {
      const error = errorBody.error as Record<string, unknown>;
      if (!error.correlationId && correlationId) {
        error.correlationId = correlationId;
      }
    }

    res.status(statusCode).json(errorBody);
  };

  const fromUpstream = (res: Response, error: unknown, fallbackMessage: string, req?: RequestWithHeaders): void => {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status: number; data: unknown } };
      if (axiosError.response?.data && typeof axiosError.response.data === 'object') {
        const responseData = axiosError.response.data as { success?: boolean; error?: unknown };
        if (responseData.success === false && responseData.error) {
          forwardServiceError(res, axiosError.response.status, responseData as { success: false; error: unknown }, req);
          return;
        }
      }
    }
    baseHelpers.ServiceErrors.fromException(res, error, fallbackMessage, req);
  };

  return {
    sendSuccess: baseHelpers.sendSuccess,
    sendCreated: baseHelpers.sendCreated,
    forwardServiceError,
    ServiceErrors: {
      ...baseHelpers.ServiceErrors,
      fromUpstream,
    },
  };
}

// Note: getCorrelationId and extractErrorInfo are available from @aiponge/shared-contracts
// or from @aiponge/platform-core (via auth/correlation). Not re-exported here to avoid conflicts.

let _serviceHelpers: ResponseHelpers | null = null;

export function initResponseHelpers(serviceName: string): ResponseHelpers {
  _serviceHelpers = createResponseHelpers(serviceName);
  return _serviceHelpers;
}

function resolve(): ResponseHelpers {
  if (!_serviceHelpers) {
    throw new Error(
      'Response helpers not initialized. Call initResponseHelpers(serviceName) during service bootstrap.'
    );
  }
  return _serviceHelpers;
}

export function getResponseHelpers(): ResponseHelpers {
  const serviceErrorsProxy = new Proxy({} as ServiceErrorHelpers, {
    get(_, prop: string) {
      return (resolve().ServiceErrors as unknown as Record<string, unknown>)[prop];
    },
  });

  return {
    sendSuccess: (...args: Parameters<ResponseHelpers['sendSuccess']>) => resolve().sendSuccess(...args),
    sendCreated: (...args: Parameters<ResponseHelpers['sendCreated']>) => resolve().sendCreated(...args),
    ServiceErrors: serviceErrorsProxy,
  };
}
