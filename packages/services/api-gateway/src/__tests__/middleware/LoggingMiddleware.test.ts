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

import { loggingMiddleware } from '../../presentation/middleware/LoggingMiddleware';

function createMockReq(overrides = {}) {
  return {
    headers: {} as Record<string, string>,
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/test',
    get: vi.fn(),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const res = {
    statusCode: 200,
    _data: undefined as unknown,
    send: vi.fn(function (this: Record<string, unknown>, d: unknown) {
      this._data = d;
      return this;
    }),
    json: vi.fn(function (this: Record<string, unknown>, d: unknown) {
      this._data = d;
      return this;
    }),
    set: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response;
  return res;
}

describe('LoggingMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call next', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    loggingMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should attach request ID to headers', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    loggingMiddleware(req, res, next);
    expect(req.headers['x-request-id']).toBeDefined();
    expect(typeof req.headers['x-request-id']).toBe('string');
  });

  it('should log request info on entry', () => {
    const req = createMockReq({ method: 'POST', path: '/api/data' });
    const res = createMockRes();
    const next = vi.fn();
    loggingMiddleware(req, res, next);
    expect(mockLogger.info).toHaveBeenCalled();
    const logMessage = mockLogger.info.mock.calls[0][0] as string;
    expect(logMessage).toContain('POST');
    expect(logMessage).toContain('/api/data');
  });

  it('should log response info on send', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    loggingMiddleware(req, res, next);
    res.send('ok');
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
