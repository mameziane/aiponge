/**
 * Error Scenarios and Resilience Integration Tests
 * Tests circuit breaker behavior, service failures, timeouts, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { resilience, configureResilience } from '../../utils/CircuitBreakerManager';
import { BaseAggregationController } from '../../presentation/controllers/BaseAggregationController';
import { apiGatewayCorrelationMiddleware } from '../../presentation/middleware/correlationMiddleware';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@aiponge/platform-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    HttpClient: vi.fn(),
  };
});

vi.mock('../../config/GatewayConfig', () => ({
  GatewayConfig: {
    circuitBreaker: {
      defaults: {
        errorThreshold: 50,
        resetTimeout: 5000,
        volumeThreshold: 3,
      },
    },
    services: {
      getConfig: vi.fn(() => ({
        timeout: 1000,
        retries: 0,
      })),
    },
  },
}));

// Test controller that uses circuit breaker
class TestResilienceController extends BaseAggregationController {
  constructor() {
    super('test-resilience-controller');
  }

  // Endpoint that calls a service with circuit breaker
  testServiceCall = this.asyncHandler(async (req, res) => {
    const behavior = req.query.behavior as string;

    const result = await this.withCircuitBreaker('test-service', async () => {
      if (behavior === 'success') {
        return { success: true, data: { message: 'OK' } };
      } else if (behavior === 'timeout') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { success: true, data: { message: 'OK' } };
      } else {
        throw new Error('Service failure');
      }
    });

    this.sendSuccessResponse(res, result);
  });

  // Endpoint that aggregates multiple services with circuit breaker
  testAggregation = this.asyncHandler(async (req, res) => {
    const service1Behavior = req.query.service1 as string;
    const service2Behavior = req.query.service2 as string;

    const results = await this.fanOut([
      () =>
        this.withCircuitBreaker('aggregation-service-1', async () => {
          if (service1Behavior === 'fail') throw new Error('Service 1 failed');
          return { success: true, data: { service: 'service1' } };
        }),
      () =>
        this.withCircuitBreaker('aggregation-service-2', async () => {
          if (service2Behavior === 'fail') throw new Error('Service 2 failed');
          return { success: true, data: { service: 'service2' } };
        }),
    ]);

    const data = {
      service1: this.extractData(results[0], null),
      service2: this.extractData(results[1], null),
    };

    this.sendSuccessResponse(res, data);
  });

  // Get circuit breaker stats endpoint
  getStats = this.asyncHandler(async (_req, res) => {
    const stats = this.getCircuitBreakerStats();
    this.sendSuccessResponse(res, stats);
  });
}

describe('Error Scenarios and Resilience Integration Tests', () => {
  let app: Express;
  let controller: TestResilienceController;

  beforeEach(() => {
    resilience.shutdownAll();

    const fastCircuitConfig = {
      circuitBreaker: {
        timeout: 500,
        errorThresholdPercentage: 50,
        resetTimeout: 2000,
        volumeThreshold: 3,
        rollingCountTimeout: 5000,
        rollingCountBuckets: 3,
      },
    };
    configureResilience('test-service', fastCircuitConfig);
    configureResilience('aggregation-service-1', fastCircuitConfig);
    configureResilience('aggregation-service-2', fastCircuitConfig);

    app = express();
    app.use(express.json());
    app.use(apiGatewayCorrelationMiddleware);

    controller = new TestResilienceController();

    // Register routes
    app.get('/test/service-call', controller.testServiceCall);
    app.get('/test/aggregation', controller.testAggregation);
    app.get('/test/stats', controller.getStats);
  });

  afterEach(() => {
    // Clean up circuit breakers
    resilience.shutdownAll();
  });

  describe('Circuit Breaker Behavior', () => {
    it('should allow successful requests through', async () => {
      const response = await request(app).get('/test/service-call?behavior=success').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        success: true,
        data: { message: 'OK' },
      });
    });

    it('should handle single service failure', async () => {
      await request(app).get('/test/service-call?behavior=fail').expect(500);

      // Check that circuit breaker recorded the failure
      const statsResponse = await request(app).get('/test/stats').expect(200);

      const testServiceStats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'test-service');
      expect(testServiceStats).toBeDefined();
      expect(testServiceStats.failures).toBeGreaterThan(0);
    });

    it('should open circuit after threshold failures', async () => {
      const errorThreshold = 50;
      const volumeThreshold = 3;

      const failureCount = Math.ceil(volumeThreshold * (errorThreshold / 100)) + volumeThreshold;

      for (let i = 0; i < failureCount; i++) {
        await request(app).get('/test/service-call?behavior=fail').expect(500);
      }

      const statsResponse = await request(app).get('/test/stats').expect(200);

      const testServiceStats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'test-service');

      expect(testServiceStats.state).toBe('open');
      expect(testServiceStats.failures).toBeGreaterThanOrEqual(volumeThreshold);
    });

    it('should reject requests when circuit is open', async () => {
      const errorThreshold = 50;
      const volumeThreshold = 3;
      const failureCount = Math.ceil(volumeThreshold * (errorThreshold / 100)) + volumeThreshold;

      for (let i = 0; i < failureCount; i++) {
        await request(app).get('/test/service-call?behavior=fail').expect(500);
      }

      await request(app).get('/test/service-call?behavior=success').expect(500);

      const statsResponse = await request(app).get('/test/stats').expect(200);

      const testServiceStats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'test-service');

      expect(testServiceStats.state).toBe('open');
      expect(testServiceStats.rejects).toBeGreaterThan(0);
    });

    it('should handle timeout scenarios', { timeout: 5000 }, async () => {
      await request(app).get('/test/service-call?behavior=timeout').expect(500);

      const statsResponse = await request(app).get('/test/stats').expect(200);

      const testServiceStats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'test-service');

      expect(testServiceStats.timeouts).toBeGreaterThan(0);
    });
  });

  describe('Service Aggregation with Failures', () => {
    it('should handle partial failures in aggregation', async () => {
      const response = await request(app).get('/test/aggregation?service1=success&service2=fail').expect(200);

      expect(response.body.success).toBe(true);
      // extractData returns the data field, not the full envelope
      expect(response.body.data.service1).toEqual({ service: 'service1' });
      expect(response.body.data.service2).toBeNull(); // Failed service returns default value
    });

    it('should handle all services failing in aggregation', async () => {
      const response = await request(app).get('/test/aggregation?service1=fail&service2=fail').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        service1: null,
        service2: null,
      });
    });

    it('should isolate failures between different services', async () => {
      // Fail service 1 multiple times
      for (let i = 0; i < 5; i++) {
        await request(app).get('/test/aggregation?service1=fail&service2=success').expect(200);
      }

      const statsResponse = await request(app).get('/test/stats').expect(200);

      const service1Stats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'aggregation-service-1');
      const service2Stats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'aggregation-service-2');

      // Service 1 should have failures
      expect(service1Stats.failures).toBeGreaterThan(0);

      // Service 2 should have successes
      expect(service2Stats.successes).toBeGreaterThan(0);
      // Note: Service 2 may have some failures due to circuit breaker mechanics
      expect(service2Stats.failures).toBeLessThan(service2Stats.successes);
    });
  });

  describe('Circuit Breaker Statistics', () => {
    it('should track successful requests', async () => {
      await request(app).get('/test/service-call?behavior=success').expect(200);

      await request(app).get('/test/service-call?behavior=success').expect(200);

      const statsResponse = await request(app).get('/test/stats').expect(200);

      const testServiceStats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'test-service');

      // Should have at least 2 successes (may have more due to stats endpoint)
      expect(testServiceStats.successes).toBeGreaterThanOrEqual(2);
      expect(testServiceStats.fires).toBeGreaterThanOrEqual(2);
      expect(testServiceStats.state).toBe('closed');
    });

    it('should provide latency metrics', async () => {
      await request(app).get('/test/service-call?behavior=success').expect(200);

      const statsResponse = await request(app).get('/test/stats').expect(200);

      const testServiceStats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'test-service');

      expect(testServiceStats.latencyMean).toBeGreaterThanOrEqual(0);
      expect(testServiceStats.percentiles).toBeDefined();
    });

    it('should track multiple circuit breakers independently', async () => {
      await request(app).get('/test/aggregation?service1=success&service2=success').expect(200);

      const statsResponse = await request(app).get('/test/stats').expect(200);

      expect(statsResponse.body.data.length).toBeGreaterThanOrEqual(2);

      const service1Stats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'aggregation-service-1');
      const service2Stats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'aggregation-service-2');

      expect(service1Stats).toBeDefined();
      expect(service2Stats).toBeDefined();
    });
  });

  describe('Error Propagation and Response Format', () => {
    it('should return consistent error response format', async () => {
      const response = await request(app).get('/test/service-call?behavior=fail').expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          code: expect.any(String),
          type: expect.any(String),
          message: expect.any(String),
        }),
        timestamp: expect.any(String),
      });
    });

    it('should include correlation ID in error responses', async () => {
      const correlationId = 'test-correlation-123';

      const response = await request(app)
        .get('/test/service-call?behavior=fail')
        .set('x-correlation-id', correlationId)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.timestamp).toBeDefined();
      // Verify correlation ID is propagated in response headers
      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });

    it('should handle async handler errors gracefully', async () => {
      // Create a route that throws an unexpected error
      app.get(
        '/test/unexpected-error',
        controller.asyncHandler(async (_req, _res) => {
          throw new Error('Unexpected error');
        })
      );

      const response = await request(app).get('/test/unexpected-error').expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Request handler failed',
      });
    });
  });

  describe('Recovery Scenarios', () => {
    it('should reset circuit breaker when resetAll is called', async () => {
      // Cause some failures
      await request(app).get('/test/service-call?behavior=fail').expect(500);

      // Reset circuit breakers
      resilience.resetAll();

      // Should work again
      const response = await request(app).get('/test/service-call?behavior=success').expect(200);

      expect(response.body.success).toBe(true);

      const statsResponse = await request(app).get('/test/stats').expect(200);

      const testServiceStats = statsResponse.body.data.find((s: Record<string, unknown>) => s.name === 'test-service');

      expect(testServiceStats.state).toBe('closed');
    });
  });
});
