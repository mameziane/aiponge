import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));
vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  serializeError: (e: unknown) => ({ message: (e as Error)?.message }),
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
}));

import { createIdempotencyMiddleware } from '../../presentation/middleware/IdempotencyMiddleware';

function createMockReq(overrides = {}) {
  return {
    headers: {} as Record<string, string | string[]>,
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'POST',
    path: '/',
    get: vi.fn(),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const resHeaders: Record<string, string> = {};
  const res = {
    statusCode: 200,
    _data: undefined as unknown,
    locals: {},
    _headers: resHeaders,
    writableEnded: false,
    status: vi.fn(function (this: Record<string, unknown>, c: number) { this.statusCode = c; return this; }),
    json: vi.fn(function (this: Record<string, unknown>, d: unknown) { this._data = d; return this; }),
    send: vi.fn(function (this: Record<string, unknown>, d: unknown) { this._data = d; return this; }),
    set: vi.fn(function (_k: string, v: string) { resHeaders[_k] = v; return res; }),
    setHeader: vi.fn(function (_k: string, v: string) { resHeaders[_k] = v; return res; }),
    getHeader: vi.fn(function (_k: string) { return resHeaders[_k]; }),
    end: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response & { _data: unknown; _headers: Record<string, string> };
  return res;
}

describe('IdempotencyMiddleware', () => {
  let getRedisClient: () => null;
  let isRedisReady: () => boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    getRedisClient = () => null;
    isRedisReady = () => false;
  });

  it('should pass through non-mutation methods (GET)', async () => {
    const middleware = createIdempotencyMiddleware({}, getRedisClient, isRedisReady);
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should pass through when no idempotency key header', async () => {
    const middleware = createIdempotencyMiddleware({}, getRedisClient, isRedisReady);
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should reject idempotency key longer than 128 characters', async () => {
    const middleware = createIdempotencyMiddleware({}, getRedisClient, isRedisReady);
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-idempotency-key': 'x'.repeat(129) },
    });
    const res = createMockRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should process first request with valid idempotency key', async () => {
    const middleware = createIdempotencyMiddleware({}, getRedisClient, isRedisReady);
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-idempotency-key': 'test-key-123' },
    });
    const res = createMockRes();
    const next = vi.fn();
    middleware(req, res, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
    });
  });

  it('should return cached response for duplicate idempotency key', async () => {
    const middleware = createIdempotencyMiddleware({}, getRedisClient, isRedisReady);

    const req1 = createMockReq({
      method: 'POST',
      headers: { 'x-idempotency-key': 'dup-key' },
    });
    const res1 = createMockRes();
    res1.statusCode = 200;
    const next1 = vi.fn();
    middleware(req1, res1, next1);

    await vi.waitFor(() => {
      expect(next1).toHaveBeenCalled();
    });

    res1.json({ result: 'ok' });

    await new Promise(r => setTimeout(r, 50));

    const req2 = createMockReq({
      method: 'POST',
      headers: { 'x-idempotency-key': 'dup-key' },
    });
    const res2 = createMockRes();
    const next2 = vi.fn();
    middleware(req2, res2, next2);

    await vi.waitFor(() => {
      expect(res2.status).toHaveBeenCalled();
    });
    expect(res2._headers['X-Idempotent-Replayed']).toBe('true');
  });

  describe('idempotency window', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return cached response for same idempotency key within window', async () => {
      const middleware = createIdempotencyMiddleware({}, getRedisClient, isRedisReady);

      const req1 = createMockReq({
        method: 'POST',
        headers: { 'x-idempotency-key': 'timer-key-1' },
      });
      const res1 = createMockRes();
      const next1 = vi.fn();
      middleware(req1, res1, next1);

      await vi.advanceTimersByTimeAsync(50);
      expect(next1).toHaveBeenCalled();

      res1.statusCode = 200;
      res1.json({ result: 'first' });

      await vi.advanceTimersByTimeAsync(50);

      vi.advanceTimersByTime(3600000);

      const req2 = createMockReq({
        method: 'POST',
        headers: { 'x-idempotency-key': 'timer-key-1' },
      });
      const res2 = createMockRes();
      const next2 = vi.fn();
      middleware(req2, res2, next2);

      await vi.advanceTimersByTimeAsync(50);
      expect(res2.status).toHaveBeenCalled();
      expect(res2._headers['X-Idempotent-Replayed']).toBe('true');
    });

    it('should process new request after idempotency window expires', async () => {
      const middleware = createIdempotencyMiddleware({}, getRedisClient, isRedisReady);

      const req1 = createMockReq({
        method: 'POST',
        headers: { 'x-idempotency-key': 'timer-key-2' },
      });
      const res1 = createMockRes();
      const next1 = vi.fn();
      middleware(req1, res1, next1);

      await vi.advanceTimersByTimeAsync(50);
      expect(next1).toHaveBeenCalled();

      res1.statusCode = 200;
      res1.json({ result: 'first' });

      await vi.advanceTimersByTimeAsync(50);

      vi.advanceTimersByTime(86400 * 1000 + 1000);

      const req2 = createMockReq({
        method: 'POST',
        headers: { 'x-idempotency-key': 'timer-key-2' },
      });
      const res2 = createMockRes();
      const next2 = vi.fn();
      middleware(req2, res2, next2);

      await vi.advanceTimersByTimeAsync(50);
      expect(next2).toHaveBeenCalled();
      expect(res2._headers['X-Idempotent-Replayed']).toBeUndefined();
    });
  });
});
