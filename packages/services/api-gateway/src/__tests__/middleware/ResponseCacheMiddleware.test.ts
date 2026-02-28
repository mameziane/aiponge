import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));
vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  serializeError: (e: unknown) => ({ message: (e as Error)?.message }),
  isFeatureEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
}));
vi.mock('../../utils/metrics', () => ({
  trackCacheHit: vi.fn(),
  trackCacheMiss: vi.fn(),
  trackCacheEviction: vi.fn(),
}));
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn().mockRejectedValue(new Error('no redis')),
    on: vi.fn(),
    get: vi.fn(),
    setEx: vi.fn(),
    del: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    quit: vi.fn(),
  })),
}));

import { createResponseCacheMiddleware, clearCache } from '../../presentation/middleware/ResponseCacheMiddleware';

function createMockReq(overrides = {}) {
  return {
    headers: {} as Record<string, string>,
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/test',
    url: '/test',
    originalUrl: '/test',
    get: vi.fn((h: string) => (overrides as Record<string, Record<string, string>>).headers?.[h.toLowerCase()]),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const resHeaders: Record<string, string> = {};
  const finishListeners: (() => void)[] = [];
  const res = {
    statusCode: 200,
    _data: undefined as unknown,
    _headers: resHeaders,
    status: vi.fn(function (this: Record<string, unknown>, c: number) {
      this.statusCode = c;
      return this;
    }),
    json: vi.fn(function (this: Record<string, unknown>, d: unknown) {
      this._data = d;
      return this;
    }),
    send: vi.fn(function (this: Record<string, unknown>, d: unknown) {
      this._data = d;
      return this;
    }),
    set: vi.fn(function (_k: string, v: string) {
      resHeaders[_k] = v;
      return res;
    }),
    setHeader: vi.fn(function (_k: string, v: string) {
      resHeaders[_k] = v;
      return res;
    }),
    getHeader: vi.fn(function (_k: string) {
      return resHeaders[_k];
    }),
    get: vi.fn(function (_k: string) {
      return resHeaders[_k];
    }),
    end: vi.fn().mockReturnThis(),
    on: vi.fn(function (_event: string, cb: () => void) {
      if (_event === 'finish') finishListeners.push(cb);
    }),
    _emitFinish: () => finishListeners.forEach(cb => cb()),
  } as unknown as Response & { _data: unknown; _headers: Record<string, string>; _emitFinish: () => void };
  return res;
}

describe('ResponseCacheMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should skip non-GET methods', async () => {
    const middleware = createResponseCacheMiddleware({ ttlMs: 60000 });
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should set X-Cache MISS on first request', async () => {
    const middleware = createResponseCacheMiddleware({ ttlMs: 60000 });
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._headers['X-Cache']).toBe('MISS');
  });

  it('should bypass cache when cache-control: no-cache', async () => {
    const middleware = createResponseCacheMiddleware({ ttlMs: 60000 });
    const req = createMockReq({
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._headers['X-Cache']).toBe('BYPASS');
  });

  it('should bypass cache when x-bypass-cache header is true', async () => {
    const middleware = createResponseCacheMiddleware({ ttlMs: 60000 });
    const req = createMockReq({
      method: 'GET',
      headers: { 'x-bypass-cache': 'true' },
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._headers['X-Cache']).toBe('BYPASS');
  });

  it('should skip when excludeWhen returns true', async () => {
    const middleware = createResponseCacheMiddleware({
      ttlMs: 60000,
      excludeWhen: () => true,
    });
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  describe('cache TTL', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      clearCache();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should serve cache hit within TTL', async () => {
      const middleware = createResponseCacheMiddleware({ ttlMs: 60000 });

      const req1 = createMockReq({ method: 'GET', url: '/ttl-test', originalUrl: '/ttl-test', path: '/ttl-test' });
      const res1 = createMockRes();
      const next1 = vi.fn();
      await middleware(req1, res1, next1);
      expect(next1).toHaveBeenCalled();
      expect(res1._headers['X-Cache']).toBe('MISS');

      res1.statusCode = 200;
      res1.json({ data: 'cached-value' });
      res1._emitFinish();

      vi.advanceTimersByTime(30000);

      const req2 = createMockReq({ method: 'GET', url: '/ttl-test', originalUrl: '/ttl-test', path: '/ttl-test' });
      const res2 = createMockRes();
      const next2 = vi.fn();
      await middleware(req2, res2, next2);
      expect(res2._headers['X-Cache']).toBe('HIT');
      expect(next2).not.toHaveBeenCalled();
    });

    it('should cache miss after TTL expires', async () => {
      const middleware = createResponseCacheMiddleware({ ttlMs: 60000 });

      const req1 = createMockReq({
        method: 'GET',
        url: '/ttl-expire',
        originalUrl: '/ttl-expire',
        path: '/ttl-expire',
      });
      const res1 = createMockRes();
      const next1 = vi.fn();
      await middleware(req1, res1, next1);
      expect(next1).toHaveBeenCalled();

      res1.statusCode = 200;
      res1.json({ data: 'will-expire' });
      res1._emitFinish();

      vi.advanceTimersByTime(60001);

      const req2 = createMockReq({
        method: 'GET',
        url: '/ttl-expire',
        originalUrl: '/ttl-expire',
        path: '/ttl-expire',
      });
      const res2 = createMockRes();
      const next2 = vi.fn();
      await middleware(req2, res2, next2);
      expect(res2._headers['X-Cache']).toBe('MISS');
      expect(next2).toHaveBeenCalled();
    });
  });
});
