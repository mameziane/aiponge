import { describe, it, expect } from 'vitest';
import { GatewayError, GatewayErrorCode } from '../errors';

describe('GatewayError', () => {
  describe('constructor', () => {
    it('should create error with default values', () => {
      const error = new GatewayError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(GatewayErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('GatewayError');
    });

    it('should create error with custom status code and code', () => {
      const error = new GatewayError('Not found', 404, GatewayErrorCode.SERVICE_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(GatewayErrorCode.SERVICE_NOT_FOUND);
    });

    it('should preserve cause error', () => {
      const cause = new Error('Original error');
      const error = new GatewayError('Wrapped error', 500, GatewayErrorCode.PROXY_ERROR, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('static factory methods', () => {
    it('serviceNotFound should return 404 error', () => {
      const error = GatewayError.serviceNotFound('user-service');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(GatewayErrorCode.SERVICE_NOT_FOUND);
      expect(error.message).toContain('user-service');
    });

    it('serviceUnavailable should return 503 error', () => {
      const error = GatewayError.serviceUnavailable('api-service', 'connection refused');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(GatewayErrorCode.SERVICE_UNAVAILABLE);
      expect(error.message).toContain('connection refused');
    });

    it('serviceUnavailable without reason should work', () => {
      const error = GatewayError.serviceUnavailable('api-service');
      expect(error.statusCode).toBe(503);
      expect(error.message).toContain('unavailable');
    });

    it('routeNotFound should return 404 error', () => {
      const error = GatewayError.routeNotFound('/api/unknown');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(GatewayErrorCode.ROUTE_NOT_FOUND);
    });

    it('proxyError should return 502 error', () => {
      const cause = new Error('ECONNREFUSED');
      const error = GatewayError.proxyError('http://localhost:3000', 'connection failed', cause);
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe(GatewayErrorCode.PROXY_ERROR);
      expect(error.cause).toBe(cause);
    });

    it('rateLimitExceeded should return 429 error', () => {
      const error = GatewayError.rateLimitExceeded('192.168.1.1', 100);
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(GatewayErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.message).toContain('100');
    });

    it('corsError should return 403 error', () => {
      const error = GatewayError.corsError('http://evil.com', 'origin not allowed');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(GatewayErrorCode.CORS_ERROR);
    });

    it('idempotencyError should return 409 error', () => {
      const error = GatewayError.idempotencyError('req-123', 'duplicate request');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe(GatewayErrorCode.IDEMPOTENCY_ERROR);
    });

    it('authenticationError should return 401 error', () => {
      const error = GatewayError.authenticationError('invalid token');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(GatewayErrorCode.AUTHENTICATION_ERROR);
    });

    it('authorizationError should return 403 error', () => {
      const error = GatewayError.authorizationError('/admin', 'insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(GatewayErrorCode.AUTHORIZATION_ERROR);
    });

    it('authorizationError without reason should work', () => {
      const error = GatewayError.authorizationError('/admin');
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Access denied');
    });

    it('invalidRequest should return 400 error', () => {
      const error = GatewayError.invalidRequest('missing required field');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(GatewayErrorCode.INVALID_REQUEST);
    });

    it('validationError should return 400 error', () => {
      const error = GatewayError.validationError('email', 'invalid format');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(GatewayErrorCode.VALIDATION_ERROR);
      expect(error.message).toContain('email');
    });

    it('upstreamError should return the specified status code', () => {
      const error = GatewayError.upstreamError('user-service', 503, 'service overloaded');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(GatewayErrorCode.UPSTREAM_ERROR);
    });

    it('timeout should return 504 error', () => {
      const error = GatewayError.timeout('fetch user data', 5000);
      expect(error.statusCode).toBe(504);
      expect(error.code).toBe(GatewayErrorCode.TIMEOUT);
      expect(error.message).toContain('5000ms');
    });

    it('circuitBreakerOpen should return 503 error', () => {
      const error = GatewayError.circuitBreakerOpen('payment-service');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(GatewayErrorCode.CIRCUIT_BREAKER_OPEN);
    });

    it('internalError should return 500 error', () => {
      const error = GatewayError.internalError('unexpected failure');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(GatewayErrorCode.INTERNAL_ERROR);
    });

    it('configurationError should return 500 error', () => {
      const error = GatewayError.configurationError('timeout', 'must be positive');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(GatewayErrorCode.CONFIGURATION_ERROR);
    });

    it('creditsError should return 402 error', () => {
      const error = GatewayError.creditsError('generate-music', 'insufficient credits');
      expect(error.statusCode).toBe(402);
      expect(error.code).toBe(GatewayErrorCode.CREDITS_ERROR);
    });
  });

  describe('GatewayErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(GatewayErrorCode.SERVICE_NOT_FOUND).toBe('SERVICE_NOT_FOUND');
      expect(GatewayErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(GatewayErrorCode.ROUTE_NOT_FOUND).toBe('ROUTE_NOT_FOUND');
      expect(GatewayErrorCode.PROXY_ERROR).toBe('PROXY_ERROR');
      expect(GatewayErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(GatewayErrorCode.CORS_ERROR).toBe('CORS_ERROR');
      expect(GatewayErrorCode.IDEMPOTENCY_ERROR).toBe('IDEMPOTENCY_ERROR');
      expect(GatewayErrorCode.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR');
      expect(GatewayErrorCode.AUTHORIZATION_ERROR).toBe('AUTHORIZATION_ERROR');
      expect(GatewayErrorCode.INVALID_REQUEST).toBe('INVALID_REQUEST');
      expect(GatewayErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(GatewayErrorCode.UPSTREAM_ERROR).toBe('UPSTREAM_ERROR');
      expect(GatewayErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(GatewayErrorCode.CIRCUIT_BREAKER_OPEN).toBe('CIRCUIT_BREAKER_OPEN');
      expect(GatewayErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(GatewayErrorCode.CONFIGURATION_ERROR).toBe('CONFIGURATION_ERROR');
      expect(GatewayErrorCode.CREDITS_ERROR).toBe('CREDITS_ERROR');
    });
  });
});
