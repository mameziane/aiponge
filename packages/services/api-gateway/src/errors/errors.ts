import { DomainError } from '@aiponge/platform-core';

export enum GatewayErrorCode {
  SERVICE_NOT_FOUND = 'SERVICE_NOT_FOUND',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  PROXY_ERROR = 'PROXY_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CORS_ERROR = 'CORS_ERROR',
  IDEMPOTENCY_ERROR = 'IDEMPOTENCY_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  TIMEOUT = 'TIMEOUT',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  CREDITS_ERROR = 'CREDITS_ERROR',
}

export class GatewayError extends DomainError {
  declare public readonly name: string;
  public readonly code: GatewayErrorCode;

  constructor(
    message: string,
    statusCode: number = 500,
    code: GatewayErrorCode = GatewayErrorCode.INTERNAL_ERROR,
    cause?: Error
  ) {
    super(message, statusCode, cause);
    this.name = 'GatewayError';
    this.code = code;
  }

  static serviceNotFound(serviceName: string): GatewayError {
    return new GatewayError(`Service not found: ${serviceName}`, 404, GatewayErrorCode.SERVICE_NOT_FOUND);
  }

  static serviceUnavailable(serviceName: string, reason?: string): GatewayError {
    const msg = reason ? `Service ${serviceName} unavailable: ${reason}` : `Service ${serviceName} is unavailable`;
    return new GatewayError(msg, 503, GatewayErrorCode.SERVICE_UNAVAILABLE);
  }

  static routeNotFound(path: string): GatewayError {
    return new GatewayError(`Route not found: ${path}`, 404, GatewayErrorCode.ROUTE_NOT_FOUND);
  }

  static proxyError(target: string, reason: string, cause?: Error): GatewayError {
    return new GatewayError(`Proxy error to ${target}: ${reason}`, 502, GatewayErrorCode.PROXY_ERROR, cause);
  }

  static rateLimitExceeded(identifier: string, limit: number): GatewayError {
    return new GatewayError(
      `Rate limit exceeded for ${identifier}: ${limit} requests`,
      429,
      GatewayErrorCode.RATE_LIMIT_EXCEEDED
    );
  }

  static corsError(origin: string, reason: string): GatewayError {
    return new GatewayError(`CORS error for origin ${origin}: ${reason}`, 403, GatewayErrorCode.CORS_ERROR);
  }

  static idempotencyError(key: string, reason: string): GatewayError {
    return new GatewayError(`Idempotency error for key ${key}: ${reason}`, 409, GatewayErrorCode.IDEMPOTENCY_ERROR);
  }

  static authenticationError(reason: string): GatewayError {
    return new GatewayError(`Authentication failed: ${reason}`, 401, GatewayErrorCode.AUTHENTICATION_ERROR);
  }

  static authorizationError(resource: string, reason?: string): GatewayError {
    const msg = reason ? `Access denied to ${resource}: ${reason}` : `Access denied to ${resource}`;
    return new GatewayError(msg, 403, GatewayErrorCode.AUTHORIZATION_ERROR);
  }

  static invalidRequest(reason: string): GatewayError {
    return new GatewayError(`Invalid request: ${reason}`, 400, GatewayErrorCode.INVALID_REQUEST);
  }

  static validationError(field: string, reason: string): GatewayError {
    return new GatewayError(`Validation failed for ${field}: ${reason}`, 400, GatewayErrorCode.VALIDATION_ERROR);
  }

  static upstreamError(service: string, statusCode: number, reason: string): GatewayError {
    return new GatewayError(`Upstream error from ${service}: ${reason}`, statusCode, GatewayErrorCode.UPSTREAM_ERROR);
  }

  static timeout(operation: string, timeoutMs: number): GatewayError {
    return new GatewayError(`Operation ${operation} timed out after ${timeoutMs}ms`, 504, GatewayErrorCode.TIMEOUT);
  }

  static circuitBreakerOpen(service: string): GatewayError {
    return new GatewayError(`Circuit breaker open for service ${service}`, 503, GatewayErrorCode.CIRCUIT_BREAKER_OPEN);
  }

  static internalError(reason: string, cause?: Error): GatewayError {
    return new GatewayError(`Internal gateway error: ${reason}`, 500, GatewayErrorCode.INTERNAL_ERROR, cause);
  }

  static configurationError(setting: string, reason: string): GatewayError {
    return new GatewayError(`Configuration error for ${setting}: ${reason}`, 500, GatewayErrorCode.CONFIGURATION_ERROR);
  }

  static creditsError(operation: string, reason: string): GatewayError {
    return new GatewayError(`Credits error during ${operation}: ${reason}`, 402, GatewayErrorCode.CREDITS_ERROR);
  }
}
