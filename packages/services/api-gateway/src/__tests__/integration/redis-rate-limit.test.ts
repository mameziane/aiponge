/**
 * Integration Tests for Redis Rate Limiting
 * Tests Redis connection lifecycle, retry logic, state events, and multi-instance support
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockRedisInstance, MockRedisConstructor, mockLogger } = vi.hoisted(() => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  const mockRedisInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
    status: 'ready',
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return mockRedisInstance;
    },
    emit(event: string, ...args: unknown[]) {
      if (listeners[event]) {
        listeners[event].forEach(h => h(...args));
      }
    },
    removeAllListeners() {
      for (const key of Object.keys(listeners)) {
        delete listeners[key];
      }
    },
    _listeners: listeners,
  };

  const MockRedisConstructor = vi.fn(function () {
    return mockRedisInstance;
  }) as unknown as ReturnType<typeof vi.fn> & { Cluster: ReturnType<typeof vi.fn> };
  MockRedisConstructor.Cluster = vi.fn(function () {
    return mockRedisInstance;
  });

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };

  return { mockRedisInstance, MockRedisConstructor, mockLogger };
});

vi.mock('ioredis', () => ({
  default: MockRedisConstructor,
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock('@aiponge/platform-core', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    serializeError: vi.fn((e: unknown) => ({ message: (e as Error)?.message || 'unknown' })),
  };
});

vi.mock('@aiponge/shared-contracts', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiponge/shared-contracts')>();
  return {
    ...actual,
    RATE_LIMIT: {
      MIN_RETRY_DELAY_MS: 5000,
      MAX_RETRY_DELAY_MS: 60000,
      DEFAULT_WINDOW_MS: 60000,
      DEFAULT_MAX_REQUESTS: 100,
    },
  };
});

vi.mock('../../errors', () => ({
  GatewayError: {
    serviceUnavailable: vi.fn((service: string, msg: string) => new Error(`${service}: ${msg}`)),
  },
}));

import {
  createRedisRateLimitMiddleware,
  getRedisRateLimitStatus,
  onRedisStateChange,
  cleanupRedisStateListeners,
  type RedisStateEvent,
} from '../../presentation/middleware/RedisRateLimitMiddleware';

describe('Redis Rate Limiting Integration Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupRedisStateListeners();

    mockRedisInstance.removeAllListeners();
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.quit.mockResolvedValue(undefined);
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.setEx.mockResolvedValue('OK');
    mockRedisInstance.incr.mockResolvedValue(1);
    mockRedisInstance.expire.mockResolvedValue(1);
    mockRedisInstance.ttl.mockResolvedValue(60);
    mockRedisInstance.status = 'ready';

    mockReq = {
      ip: '127.0.0.1',
      headers: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      getHeader: vi.fn(),
      header: vi.fn().mockReturnThis(),
      headersSent: false,
      locals: {},
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    cleanupRedisStateListeners();
  });

  describe('Successful Redis Connection', () => {
    it('should connect to Redis successfully on first attempt', async () => {
      const middleware = createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0,
          keyPrefix: 'test:',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(MockRedisConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
          db: 0,
          lazyConnect: true,
        })
      );

      expect(mockRedisInstance.connect).toHaveBeenCalled();
    });

    it('should emit connected event on successful connection', async () => {
      const events: RedisStateEvent[] = [];
      const unsubscribe = onRedisStateChange(event => {
        events.push(event);
      });

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      mockRedisInstance.emit('ready');

      await new Promise(resolve => setTimeout(resolve, 50));

      const connectedEvents = events.filter(e => e.type === 'connected');
      expect(connectedEvents.length).toBeGreaterThan(0);

      unsubscribe();
    });
  });

  describe('Connection Failure and Retry', () => {
    it.skip('should retry connection on initial failure', async () => {
      vi.useFakeTimers();

      const events: RedisStateEvent[] = [];
      onRedisStateChange(event => {
        events.push(event);
      });

      mockRedisInstance.connect.mockRejectedValueOnce(new Error('Connection refused'));

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await vi.advanceTimersByTimeAsync(100);

      expect(events.some(e => e.type === 'connecting')).toBe(true);
      expect(events.some(e => e.type === 'failed')).toBe(true);

      const failedEvent = events.find(e => e.type === 'failed') as RedisStateEvent & { retryIn?: number };
      expect(failedEvent?.retryIn).toBeGreaterThan(0);

      vi.useRealTimers();
      cleanupRedisStateListeners();
    });

    it.skip('should eventually connect after retries', async () => {
      vi.useFakeTimers();

      const events: RedisStateEvent[] = [];
      onRedisStateChange(event => {
        events.push(event);
      });

      mockRedisInstance.connect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(undefined);

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(events.filter(e => e.type === 'failed')).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(6000);
      expect(events.filter(e => e.type === 'failed')).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(12000);

      mockRedisInstance.emit('ready');

      await vi.advanceTimersByTimeAsync(100);

      expect(events.some(e => e.type === 'connected')).toBe(true);

      vi.useRealTimers();
      cleanupRedisStateListeners();
    });

    it.skip('should use exponential backoff for retries', async () => {
      vi.useFakeTimers();

      const events: RedisStateEvent[] = [];
      onRedisStateChange(event => {
        events.push(event);
      });

      mockRedisInstance.connect.mockRejectedValue(new Error('Connection refused'));

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await vi.advanceTimersByTimeAsync(100);
      const firstFailure = events.find(e => e.type === 'failed') as RedisStateEvent & { retryIn?: number };
      const firstRetryDelay = firstFailure?.retryIn || 0;

      await vi.advanceTimersByTimeAsync(firstRetryDelay + 100);
      const secondFailure = events.filter(e => e.type === 'failed')[1] as RedisStateEvent & { retryIn?: number };
      const secondRetryDelay = secondFailure?.retryIn || 0;

      expect(secondRetryDelay).toBeGreaterThan(firstRetryDelay);
      expect(secondRetryDelay).toBeLessThanOrEqual(firstRetryDelay * 2.5);

      vi.useRealTimers();
      cleanupRedisStateListeners();
    });
  });

  describe('Disconnection and Reconnection', () => {
    it('should emit disconnected event when Redis connection ends', async () => {
      const events: RedisStateEvent[] = [];
      onRedisStateChange(event => {
        events.push(event);
      });

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      mockRedisInstance.emit('end');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.some(e => e.type === 'disconnected')).toBe(true);

      cleanupRedisStateListeners();
    });

    it('should handle runtime reconnection via retryStrategy', async () => {
      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(MockRedisConstructor).toHaveBeenCalled();

      if (MockRedisConstructor.mock.calls.length > 0) {
        const config = (MockRedisConstructor.mock.calls as unknown[][])[0][0] as Record<string, unknown> & {
          retryStrategy: (times: number) => number;
        };
        expect(config).toBeDefined();
        expect(config).toHaveProperty('retryStrategy');

        const retryStrategy = config.retryStrategy;
        expect(typeof retryStrategy).toBe('function');

        const delay1 = retryStrategy(1);
        const delay2 = retryStrategy(2);
        const delay3 = retryStrategy(10);

        expect(delay1).toBeGreaterThanOrEqual(1000);
        expect(delay2).toBeGreaterThan(delay1);
        expect(delay3).toBeLessThanOrEqual(30000);
      }

      cleanupRedisStateListeners();
    });
  });

  describe('Status Reporting', () => {
    it('should report accurate connection status', async () => {
      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const status = getRedisRateLimitStatus();
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('isConnecting');
      expect(status).toHaveProperty('retryAttempt');
    });
  });

  describe('Multi-Instance Support', () => {
    it('should support multiple concurrent listeners', async () => {
      const events1: RedisStateEvent[] = [];
      const events2: RedisStateEvent[] = [];

      const unsubscribe1 = onRedisStateChange(event => {
        events1.push(event);
      });

      const unsubscribe2 = onRedisStateChange(event => {
        events2.push(event);
      });

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      mockRedisInstance.emit('ready');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1.some(e => e.type === 'connected')).toBe(true);
      expect(events2.some(e => e.type === 'connected')).toBe(true);

      unsubscribe1();
      unsubscribe2();
    });

    it('should allow independent unsubscription', async () => {
      const events1: RedisStateEvent[] = [];
      const events2: RedisStateEvent[] = [];

      const unsubscribe1 = onRedisStateChange(event => {
        events1.push(event);
      });

      const unsubscribe2 = onRedisStateChange(event => {
        events2.push(event);
      });

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      unsubscribe1();

      mockRedisInstance.emit('ready');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1.some(e => e.type === 'connected')).toBe(false);
      expect(events2.some(e => e.type === 'connected')).toBe(true);

      unsubscribe2();
    });
  });

  describe('Fallback Behavior', () => {
    it('should fall back to in-memory when Redis unavailable', async () => {
      mockRedisInstance.connect.mockRejectedValue(new Error('Connection refused'));
      mockRedisInstance.status = 'end';

      const middleware = createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 2,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      await middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should rate limit using in-memory when Redis fails', async () => {
      mockRedisInstance.connect.mockRejectedValue(new Error('Connection refused'));
      mockRedisInstance.status = 'end';

      const rawMax = 8;
      const fallbackDivisor =
        process.env.NODE_ENV === 'production' ? parseInt(process.env.RATE_LIMIT_FALLBACK_DIVISOR || '4', 10) : 1;
      const effectiveMax = Math.ceil(rawMax / fallbackDivisor);

      const middleware = createRedisRateLimitMiddleware({
        windowMs: 1000,
        maxRequests: rawMax,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      for (let i = 1; i <= effectiveMax; i++) {
        await middleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(i);
      }

      mockNext.mockClear();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clean up all listeners', async () => {
      const events1: RedisStateEvent[] = [];
      const events2: RedisStateEvent[] = [];

      onRedisStateChange(event => {
        events1.push(event);
      });

      onRedisStateChange(event => {
        events2.push(event);
      });

      cleanupRedisStateListeners();

      createRedisRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const initialLength1 = events1.length;
      const initialLength2 = events2.length;

      mockRedisInstance.emit('ready');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1.length).toBe(initialLength1);
      expect(events2.length).toBe(initialLength2);
    });
  });
});
