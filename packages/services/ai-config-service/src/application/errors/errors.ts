import { DomainErrorCode, createDomainServiceError } from '@aiponge/platform-core';

const ConfigDomainCodes = {
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_INITIALIZATION_FAILED: 'PROVIDER_INITIALIZATION_FAILED',
  PROVIDER_INVOCATION_FAILED: 'PROVIDER_INVOCATION_FAILED',
  INVALID_PROVIDER_CONFIG: 'INVALID_PROVIDER_CONFIG',
  INVALID_MODEL: 'INVALID_MODEL',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  FRAMEWORK_NOT_FOUND: 'FRAMEWORK_NOT_FOUND',
  FRAMEWORK_ERROR: 'FRAMEWORK_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  API_KEY_MISSING: 'API_KEY_MISSING',
  API_KEY_INVALID: 'API_KEY_INVALID',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
} as const;

export const ConfigErrorCode = { ...DomainErrorCode, ...ConfigDomainCodes } as const;
export type ConfigErrorCodeType = (typeof ConfigErrorCode)[keyof typeof ConfigErrorCode];

const ConfigErrorBase = createDomainServiceError('Config', ConfigErrorCode);

export class ConfigError extends ConfigErrorBase {
  static providerNotFound(providerId: string) {
    return new ConfigError(`Provider not found: ${providerId}`, 404, ConfigErrorCode.PROVIDER_NOT_FOUND);
  }

  static providerUnavailable(provider: string, reason?: string) {
    const msg = reason ? `Provider ${provider} unavailable: ${reason}` : `Provider ${provider} is unavailable`;
    return new ConfigError(msg, 503, ConfigErrorCode.PROVIDER_UNAVAILABLE);
  }

  static providerInitializationFailed(provider: string, reason: string, cause?: Error) {
    return new ConfigError(
      `Failed to initialize provider ${provider}: ${reason}`,
      500,
      ConfigErrorCode.PROVIDER_INITIALIZATION_FAILED,
      cause
    );
  }

  static providerInvocationFailed(provider: string, operation: string, cause?: Error) {
    return new ConfigError(
      `Provider ${provider} invocation failed during ${operation}`,
      502,
      ConfigErrorCode.PROVIDER_INVOCATION_FAILED,
      cause
    );
  }

  static invalidProviderConfig(provider: string, reason: string) {
    return new ConfigError(
      `Invalid configuration for provider ${provider}: ${reason}`,
      400,
      ConfigErrorCode.INVALID_PROVIDER_CONFIG
    );
  }

  static invalidModel(model: string, provider: string, reason?: string) {
    const msg = reason
      ? `Invalid model ${model} for ${provider}: ${reason}`
      : `Invalid model ${model} for provider ${provider}`;
    return new ConfigError(msg, 400, ConfigErrorCode.INVALID_MODEL);
  }

  static modelNotFound(model: string, provider: string) {
    return new ConfigError(`Model ${model} not found for provider ${provider}`, 404, ConfigErrorCode.MODEL_NOT_FOUND);
  }

  static frameworkNotFound(frameworkId: string) {
    return new ConfigError(`Framework not found: ${frameworkId}`, 404, ConfigErrorCode.FRAMEWORK_NOT_FOUND);
  }

  static frameworkError(framework: string, reason: string, cause?: Error) {
    return new ConfigError(`Framework ${framework} error: ${reason}`, 500, ConfigErrorCode.FRAMEWORK_ERROR, cause);
  }

  static cacheError(operation: string, reason: string, cause?: Error) {
    return new ConfigError(`Cache ${operation} failed: ${reason}`, 500, ConfigErrorCode.CACHE_ERROR, cause);
  }

  static rateLimitExceeded(provider: string, limit: number) {
    return new ConfigError(
      `Rate limit exceeded for ${provider}: ${limit} requests/min`,
      429,
      ConfigErrorCode.RATE_LIMIT_EXCEEDED
    );
  }

  static circuitBreakerOpen(provider: string) {
    return new ConfigError(`Circuit breaker open for provider ${provider}`, 503, ConfigErrorCode.CIRCUIT_BREAKER_OPEN);
  }

  static timeout(operation: string, timeoutMs: number) {
    return new ConfigError(`Operation ${operation} timed out after ${timeoutMs}ms`, 504, ConfigErrorCode.TIMEOUT);
  }

  static apiKeyMissing(provider: string) {
    return new ConfigError(`API key missing for provider ${provider}`, 401, ConfigErrorCode.API_KEY_MISSING);
  }

  static apiKeyInvalid(provider: string) {
    return new ConfigError(`Invalid API key for provider ${provider}`, 401, ConfigErrorCode.API_KEY_INVALID);
  }

  static quotaExceeded(provider: string, resource: string) {
    return new ConfigError(`Quota exceeded for ${provider}: ${resource}`, 429, ConfigErrorCode.QUOTA_EXCEEDED);
  }
}
