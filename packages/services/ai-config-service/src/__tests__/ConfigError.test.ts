import { describe, it, expect } from 'vitest';

import { vi } from 'vitest';

vi.mock('@aiponge/platform-core', () => ({
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
      if (cause) this.cause = cause;
    }
  },
}));

import { ConfigError, ConfigErrorCode } from '../application/errors';

describe('ConfigError', () => {
  describe('constructor', () => {
    it('should create error with default values', () => {
      const error = new ConfigError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ConfigErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('ConfigError');
    });

    it('should create error with custom values', () => {
      const error = new ConfigError('Not found', 404, ConfigErrorCode.PROVIDER_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ConfigErrorCode.PROVIDER_NOT_FOUND);
    });

    it('should preserve cause error', () => {
      const cause = new Error('Root cause');
      const error = new ConfigError('Wrapped', 500, ConfigErrorCode.INTERNAL_ERROR, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('static factory methods', () => {
    it('providerNotFound should return 404', () => {
      const error = ConfigError.providerNotFound('openai');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ConfigErrorCode.PROVIDER_NOT_FOUND);
      expect(error.message).toContain('openai');
    });

    it('providerUnavailable should return 503', () => {
      const error = ConfigError.providerUnavailable('anthropic', 'rate limited');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(ConfigErrorCode.PROVIDER_UNAVAILABLE);
      expect(error.message).toContain('rate limited');
    });

    it('providerUnavailable without reason', () => {
      const error = ConfigError.providerUnavailable('anthropic');
      expect(error.message).toContain('unavailable');
    });

    it('providerInitializationFailed should return 500 with cause', () => {
      const cause = new Error('Missing API key');
      const error = ConfigError.providerInitializationFailed('openai', 'Missing API key', cause);
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ConfigErrorCode.PROVIDER_INITIALIZATION_FAILED);
      expect(error.cause).toBe(cause);
    });

    it('providerInvocationFailed should return 502', () => {
      const error = ConfigError.providerInvocationFailed('openai', 'generateText');
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe(ConfigErrorCode.PROVIDER_INVOCATION_FAILED);
    });

    it('invalidProviderConfig should return 400', () => {
      const error = ConfigError.invalidProviderConfig('openai', 'missing model');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ConfigErrorCode.INVALID_PROVIDER_CONFIG);
    });

    it('invalidModel should return 400', () => {
      const error = ConfigError.invalidModel('gpt-5', 'openai', 'not supported');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ConfigErrorCode.INVALID_MODEL);
    });

    it('invalidModel without reason', () => {
      const error = ConfigError.invalidModel('gpt-5', 'openai');
      expect(error.message).toContain('gpt-5');
    });

    it('modelNotFound should return 404', () => {
      const error = ConfigError.modelNotFound('gpt-5', 'openai');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ConfigErrorCode.MODEL_NOT_FOUND);
    });

    it('frameworkNotFound should return 404', () => {
      const error = ConfigError.frameworkNotFound('cbt');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ConfigErrorCode.FRAMEWORK_NOT_FOUND);
    });

    it('frameworkError should return 500', () => {
      const error = ConfigError.frameworkError('cbt', 'init failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ConfigErrorCode.FRAMEWORK_ERROR);
    });

    it('cacheError should return 500', () => {
      const error = ConfigError.cacheError('get', 'timeout');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ConfigErrorCode.CACHE_ERROR);
    });

    it('rateLimitExceeded should return 429', () => {
      const error = ConfigError.rateLimitExceeded('openai', 60);
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(ConfigErrorCode.RATE_LIMIT_EXCEEDED);
    });

    it('circuitBreakerOpen should return 503', () => {
      const error = ConfigError.circuitBreakerOpen('anthropic');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(ConfigErrorCode.CIRCUIT_BREAKER_OPEN);
    });

    it('validationError should return 400', () => {
      const error = ConfigError.validationError('temperature', 'must be 0-1');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ConfigErrorCode.VALIDATION_ERROR);
    });

    it('internalError should return 500', () => {
      const error = ConfigError.internalError('unexpected');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ConfigErrorCode.INTERNAL_ERROR);
    });

    it('serviceUnavailable should return 503', () => {
      const error = ConfigError.serviceUnavailable('config-service');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(ConfigErrorCode.SERVICE_UNAVAILABLE);
    });

    it('timeout should return 504', () => {
      const error = ConfigError.timeout('generateText', 30000);
      expect(error.statusCode).toBe(504);
      expect(error.code).toBe(ConfigErrorCode.TIMEOUT);
      expect(error.message).toContain('30000');
    });

    it('apiKeyMissing should return 401', () => {
      const error = ConfigError.apiKeyMissing('openai');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ConfigErrorCode.API_KEY_MISSING);
    });

    it('apiKeyInvalid should return 401', () => {
      const error = ConfigError.apiKeyInvalid('openai');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ConfigErrorCode.API_KEY_INVALID);
    });

    it('quotaExceeded should return 429', () => {
      const error = ConfigError.quotaExceeded('openai', 'tokens');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(ConfigErrorCode.QUOTA_EXCEEDED);
    });
  });

  describe('ConfigErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(ConfigErrorCode.PROVIDER_NOT_FOUND).toBe('PROVIDER_NOT_FOUND');
      expect(ConfigErrorCode.PROVIDER_UNAVAILABLE).toBe('PROVIDER_UNAVAILABLE');
      expect(ConfigErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ConfigErrorCode.CIRCUIT_BREAKER_OPEN).toBe('CIRCUIT_BREAKER_OPEN');
      expect(ConfigErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(ConfigErrorCode.API_KEY_MISSING).toBe('API_KEY_MISSING');
      expect(ConfigErrorCode.API_KEY_INVALID).toBe('API_KEY_INVALID');
      expect(ConfigErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
    });
  });
});
