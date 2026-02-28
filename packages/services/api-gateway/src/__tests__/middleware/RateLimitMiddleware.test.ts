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
  extractAuthContext: (req: Request) => ({ userId: req?.headers?.['x-user-id'] || undefined }),
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
}));

import { rateLimitMiddleware } from '../../presentation/middleware/RateLimitMiddleware';

function createMockReq(overrides = {}) {
  return {
    headers: {} as Record<string, string | string[]>,
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/',
    get: vi.fn(),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const res = {
    _statusCode: 200,
    _data: undefined as unknown,
    locals: {},
    status: vi.fn(function (this: Record<string, unknown>, c: number) {
      this._statusCode = c;
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
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response & { _statusCode: number; _data: unknown };
  return res;
}

describe('RateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow requests under limit', async () => {
    const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 5 });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should return 429 when rate limit exceeded', async () => {
    const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 2 });
    const next = vi.fn();

    for (let i = 0; i < 2; i++) {
      const req = createMockReq();
      const res = createMockRes();
      await middleware(req, res, next);
    }

    const req = createMockReq();
    const res = createMockRes();
    await middleware(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res._data.error).toBe('Too many requests');
  });

  it('should track different IPs separately', async () => {
    const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 1, keyType: 'per-ip' });
    const next1 = vi.fn();
    const next2 = vi.fn();

    const req1 = createMockReq({ ip: '1.1.1.1' });
    const res1 = createMockRes();
    await middleware(req1, res1, next1);
    expect(next1).toHaveBeenCalled();

    const req2 = createMockReq({ ip: '2.2.2.2' });
    const res2 = createMockRes();
    await middleware(req2, res2, next2);
    expect(next2).toHaveBeenCalled();
  });

  it('should extract IP from x-forwarded-for header', async () => {
    const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 1 });
    const next = vi.fn();

    const req = createMockReq({ headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } });
    const res = createMockRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should use authenticated max requests for authenticated users', async () => {
    const middleware = rateLimitMiddleware({
      windowMs: 60000,
      maxRequests: 1,
      authenticatedMaxRequests: 5,
    });
    const next = vi.fn();

    const req1 = createMockReq();
    const res1 = createMockRes();
    res1.locals = { userId: 'user-1' };
    await middleware(req1, res1, next);

    const req2 = createMockReq();
    const res2 = createMockRes();
    res2.locals = { userId: 'user-1' };
    await middleware(req2, res2, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should use global key type', async () => {
    const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 2, keyType: 'global' });
    const next = vi.fn();

    const req1 = createMockReq({ ip: '1.1.1.1' });
    const res1 = createMockRes();
    await middleware(req1, res1, next);

    const req2 = createMockReq({ ip: '2.2.2.2' });
    const res2 = createMockRes();
    await middleware(req2, res2, next);

    const req3 = createMockReq({ ip: '3.3.3.3' });
    const res3 = createMockRes();
    const next3 = vi.fn();
    await middleware(req3, res3, next3);
    expect(res3.status).toHaveBeenCalledWith(429);
  });

  describe('window expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should reset counter after window expires', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 1 });
      const next = vi.fn();

      const req1 = createMockReq();
      const res1 = createMockRes();
      await middleware(req1, res1, next);
      expect(next).toHaveBeenCalledTimes(1);

      const req2 = createMockReq();
      const res2 = createMockRes();
      await middleware(req2, res2, vi.fn());
      expect(res2.status).toHaveBeenCalledWith(429);

      vi.advanceTimersByTime(60001);

      const req3 = createMockReq();
      const res3 = createMockRes();
      const next3 = vi.fn();
      await middleware(req3, res3, next3);
      expect(next3).toHaveBeenCalled();
    });

    it('should return Retry-After header when rate limited', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 1 });
      const next = vi.fn();

      const req1 = createMockReq();
      const res1 = createMockRes();
      await middleware(req1, res1, next);

      vi.advanceTimersByTime(10000);

      const req2 = createMockReq();
      const res2 = createMockRes();
      await middleware(req2, res2, vi.fn());
      expect(res2.status).toHaveBeenCalledWith(429);
      expect(res2._data.error).toBe('Too many requests');
    });
  });
});
