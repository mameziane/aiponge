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
vi.mock('../../config/environment', () => ({
  environmentConfig: {
    corsOrigins: ['https://example.com'],
    corsFrontendHost: 'localhost',
    corsFrontendPorts: [3000],
  },
}));

import {
  csrfProtectionMiddleware,
  createCsrfProtectionMiddleware,
} from '../../presentation/middleware/CsrfProtectionMiddleware';

function createMockReq(overrides = {}) {
  const headers: Record<string, string> = {};
  return {
    headers,
    params: {},
    query: {},
    body: {},
    user: undefined,
    cookies: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/',
    get: vi.fn((h: string) => headers[h.toLowerCase()]),
    header: vi.fn((h: string) => headers[h.toLowerCase()]),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const res = {
    _statusCode: 200,
    _data: undefined as unknown,
    _headers: {} as Record<string, string>,
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
    set: vi.fn(function (this: Record<string, unknown>, k: string, v: string) {
      (this._headers as Record<string, string>)[k] = v;
      return this;
    }),
    setHeader: vi.fn(function (this: Record<string, unknown>, k: string, v: string) {
      (this._headers as Record<string, string>)[k] = v;
      return this;
    }),
    getHeader: vi.fn(function (this: Record<string, unknown>, k: string) {
      return (this._headers as Record<string, string>)[k];
    }),
    end: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response & { _statusCode: number; _data: unknown; _headers: Record<string, string> };
  return res;
}

describe('CsrfProtectionMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REPLIT_DOMAINS;
    delete process.env.REPLIT_DEV_DOMAIN;
  });

  describe('csrfProtectionMiddleware', () => {
    it('should skip safe methods (GET)', () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should skip safe methods (HEAD)', () => {
      const req = createMockReq({ method: 'HEAD' });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should skip safe methods (OPTIONS)', () => {
      const req = createMockReq({ method: 'OPTIONS' });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject POST without origin and no authorization header', () => {
      const req = createMockReq({ method: 'POST' });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._data.error.details.code).toBe('CSRF_ORIGIN_REQUIRED');
    });

    it('should allow POST without origin if authorization header is present', () => {
      const req = createMockReq({
        method: 'POST',
        headers: { authorization: 'Bearer token123' },
      });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should accept valid origin', () => {
      const headers: Record<string, string> = {};
      const req = createMockReq({
        method: 'POST',
        headers,
        get: vi.fn((h: string) => {
          if (h === 'Origin') return 'https://example.com';
          return headers[h.toLowerCase()];
        }),
      });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject disallowed origin', () => {
      const req = createMockReq({
        method: 'POST',
        get: vi.fn((h: string) => {
          if (h === 'Origin') return 'https://evil.com';
          return undefined;
        }),
      });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._data.error.details.code).toBe('CSRF_ORIGIN_DENIED');
    });

    it('should extract origin from Referer header', () => {
      const req = createMockReq({
        method: 'POST',
        get: vi.fn((h: string) => {
          if (h === 'Origin') return undefined;
          if (h === 'Referer') return 'https://example.com/page';
          return undefined;
        }),
      });
      const res = createMockRes();
      const next = vi.fn();
      csrfProtectionMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createCsrfProtectionMiddleware', () => {
    it('should skip paths in skipPaths', () => {
      const middleware = createCsrfProtectionMiddleware({ skipPaths: ['/health'] });
      const req = createMockReq({ method: 'POST', path: '/health' });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should bypass CSRF for API clients with authorization when requireOriginForApi is false', () => {
      const middleware = createCsrfProtectionMiddleware({ requireOriginForApi: false });
      const req = createMockReq({
        method: 'POST',
        headers: { authorization: 'Bearer token' },
      });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
