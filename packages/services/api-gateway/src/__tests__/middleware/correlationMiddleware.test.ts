import { describe, it, expect, vi, beforeEach } from 'vitest';
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
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
}));

import {
  apiGatewayCorrelationMiddleware,
  getCorrelationId,
  createCorrelationErrorResponse,
  RequestWithCorrelationId,
} from '../../presentation/middleware/correlationMiddleware';

function createMockReq(overrides = {}): unknown {
  const headers: Record<string, string> = {};
  return {
    headers,
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/test',
    route: undefined,
    get: vi.fn((h: string) => headers[h.toLowerCase()]),
    ...overrides,
  };
}
function createMockRes() {
  const resHeaders: Record<string, string> = {};
  const finishListeners: (() => void)[] = [];
  const res = {
    statusCode: 200,
    _headers: resHeaders,
    setHeader: vi.fn(function (this: Record<string, unknown>, k: string, v: string) {
      resHeaders[k] = v;
      return this;
    }),
    set: vi.fn(function (this: Record<string, unknown>, k: string, v: string) {
      resHeaders[k] = v;
      return this;
    }),
    getHeader: vi.fn(function (_k: string) {
      return resHeaders[_k];
    }),
    get: vi.fn(function (_k: string) {
      return resHeaders[_k];
    }),
    on: vi.fn(function (_event: string, cb: () => void) {
      if (_event === 'finish') finishListeners.push(cb);
    }),
    _emitFinish: () => finishListeners.forEach(cb => cb()),
    end: vi.fn().mockReturnThis(),
  } as unknown as Response & { _emitFinish: () => void };
  return res;
}

describe('correlationMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('apiGatewayCorrelationMiddleware', () => {
    it('should generate correlation ID if not present', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      apiGatewayCorrelationMiddleware(req as Request, res, next);
      expect((req as Record<string, unknown>).correlationId).toBeDefined();
      expect(typeof (req as Record<string, unknown>).correlationId).toBe('string');
      expect(next).toHaveBeenCalled();
    });

    it('should pass through existing correlation ID', () => {
      const req = createMockReq({
        headers: { 'x-correlation-id': 'existing-id-123' },
      });
      const res = createMockRes();
      const next = vi.fn();
      apiGatewayCorrelationMiddleware(req as Request, res, next);
      expect((req as Record<string, unknown>).correlationId).toBe('existing-id-123');
    });

    it('should set correlation ID on response header', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      apiGatewayCorrelationMiddleware(req as Request, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', (req as Record<string, unknown>).correlationId);
    });

    it('should attach startTime to request', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      apiGatewayCorrelationMiddleware(req as Request, res, next);
      expect((req as Record<string, unknown>).startTime).toBeDefined();
      expect(typeof (req as Record<string, unknown>).startTime).toBe('number');
    });

    it('should log request completion on finish event', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      apiGatewayCorrelationMiddleware(req as Request, res, next);
      res._emitFinish();
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should log warn level for error status codes', () => {
      const req = createMockReq();
      const res = createMockRes();
      res.statusCode = 500;
      const next = vi.fn();
      apiGatewayCorrelationMiddleware(req as Request, res, next);
      res._emitFinish();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('getCorrelationId', () => {
    it('should return correlation ID from request', () => {
      const req = { correlationId: 'test-id' } as RequestWithCorrelationId;
      expect(getCorrelationId(req)).toBe('test-id');
    });

    it('should return unknown when no correlation ID', () => {
      const req = {} as RequestWithCorrelationId;
      expect(getCorrelationId(req)).toBe('unknown');
    });
  });

  describe('createCorrelationErrorResponse', () => {
    it('should create error response with correlation ID', () => {
      const req = { correlationId: 'err-corr-id' } as RequestWithCorrelationId;
      const error = new Error('Something failed');
      const result = createCorrelationErrorResponse(req, error, 500);
      expect(result.success).toBe(false);
      expect(result.correlationId).toBe('err-corr-id');
      expect(result.error.message).toBe('Something failed');
    });
  });
});
