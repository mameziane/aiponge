import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

const mockAuthenticate = vi.hoisted(() => vi.fn());

const { StandardAuthMiddleware: MockStandardAuthMiddleware } = vi.hoisted(() => {
  const cls = function(this: Record<string, unknown>) { this.authenticate = mockAuthenticate; } as unknown as new () => Record<string, unknown>;
  return { StandardAuthMiddleware: cls };
});

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));
vi.mock('@aiponge/platform-core', () => ({
  StandardAuthMiddleware: MockStandardAuthMiddleware,
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

import {
  authenticationMiddleware,
  requireRoles,
  requireApiKey,
  requireServiceAuth,
  skipAuth,
} from '../../presentation/middleware/AuthenticationMiddleware';

function createMockReq(overrides = {}) {
  return { headers: {}, params: {}, query: {}, body: {}, user: undefined, cookies: {}, ip: '127.0.0.1', method: 'GET', path: '/', get: vi.fn((h: string) => ({} as Record<string, string>)[h]), ...overrides } as unknown as Request;
}
function createMockRes() {
  const res = { _statusCode: 200, _data: undefined, locals: {}, status: vi.fn(function(this: Record<string, unknown>, c: number) { this._statusCode = c; return this; }), json: vi.fn(function(this: Record<string, unknown>, d: unknown) { this._data = d; return this; }), send: vi.fn(function(this: Record<string, unknown>, d: unknown) { this._data = d; return this; }), set: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as unknown as Response;
  return res;
}

describe('AuthenticationMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticationMiddleware', () => {
    it('should return a request handler from StandardAuthMiddleware.authenticate', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      const result = authenticationMiddleware();
      expect(mockAuthenticate).toHaveBeenCalledWith({
        allowApiKey: undefined,
        allowServiceAuth: true,
        skipPaths: ['/health', '/metrics'],
      });
      expect(result).toBe(handler);
    });

    it('should return a function that can be invoked as a request handler', () => {
      const mockHandler = vi.fn();
      mockAuthenticate.mockReturnValue(mockHandler);

      const result = authenticationMiddleware();
      expect(typeof result).toBe('function');

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      result(req, res, next);

      expect(mockHandler).toHaveBeenCalledWith(req, res, next);
    });

    it('should verify config passed includes allowServiceAuth: true', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      authenticationMiddleware();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowServiceAuth: true }),
      );
    });

    it('should verify default skipPaths contains health check endpoints', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      authenticationMiddleware();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ skipPaths: expect.arrayContaining(['/health', '/metrics']) }),
      );
    });

    it('should pass allowApiKey config', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      authenticationMiddleware({ allowApiKey: true });
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowApiKey: true }),
      );
    });

    it('should use custom skipPaths when provided', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      authenticationMiddleware({ skipPaths: ['/custom'] });
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ skipPaths: ['/custom'] }),
      );
    });

    it('should always enable allowServiceAuth', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      authenticationMiddleware({});
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowServiceAuth: true }),
      );
    });
  });

  describe('requireRoles', () => {
    it('should return a request handler', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      const result = requireRoles(['admin', 'user']);
      expect(typeof result).toBe('function');
      expect(result).toBe(handler);
    });

    it('should call authenticationMiddleware with default config', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      requireRoles(['admin', 'user']);
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({
          allowServiceAuth: true,
          skipPaths: ['/health', '/metrics'],
        }),
      );
    });

    it('should ensure allowServiceAuth is true in roles middleware', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      requireRoles(['admin']);
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowServiceAuth: true }),
      );
    });

    it('should invoke the returned handler when called with request', () => {
      const mockHandler = vi.fn();
      mockAuthenticate.mockReturnValue(mockHandler);

      const result = requireRoles(['admin']);
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      result(req, res, next);
      expect(mockHandler).toHaveBeenCalledWith(req, res, next);
    });
  });

  describe('requireApiKey', () => {
    it('should return a request handler', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      const result = requireApiKey();
      expect(typeof result).toBe('function');
      expect(result).toBe(handler);
    });

    it('should call authenticationMiddleware with allowApiKey true', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      requireApiKey();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowApiKey: true }),
      );
    });

    it('should ensure allowServiceAuth is true', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      requireApiKey();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowServiceAuth: true }),
      );
    });

    it('should invoke the returned handler when called with request', () => {
      const mockHandler = vi.fn();
      mockAuthenticate.mockReturnValue(mockHandler);

      const result = requireApiKey();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      result(req, res, next);
      expect(mockHandler).toHaveBeenCalledWith(req, res, next);
    });
  });

  describe('requireServiceAuth', () => {
    it('should return a request handler', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      const result = requireServiceAuth();
      expect(typeof result).toBe('function');
      expect(result).toBe(handler);
    });

    it('should call authenticationMiddleware with default config', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      requireServiceAuth();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({
          allowServiceAuth: true,
          skipPaths: ['/health', '/metrics'],
        }),
      );
    });

    it('should ensure allowServiceAuth is true', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      requireServiceAuth();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowServiceAuth: true }),
      );
    });

    it('should invoke the returned handler when called with request', () => {
      const mockHandler = vi.fn();
      mockAuthenticate.mockReturnValue(mockHandler);

      const result = requireServiceAuth();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      result(req, res, next);
      expect(mockHandler).toHaveBeenCalledWith(req, res, next);
    });
  });

  describe('skipAuth', () => {
    it('should return a request handler', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      const result = skipAuth();
      expect(typeof result).toBe('function');
      expect(result).toBe(handler);
    });

    it('should call authenticationMiddleware with empty config', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      skipAuth();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({}),
      );
    });

    it('should ensure allowServiceAuth is true even when skipping auth', () => {
      const handler = vi.fn();
      mockAuthenticate.mockReturnValue(handler);

      skipAuth();
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ allowServiceAuth: true }),
      );
    });

    it('should invoke the returned handler when called with request', () => {
      const mockHandler = vi.fn();
      mockAuthenticate.mockReturnValue(mockHandler);

      const result = skipAuth();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      result(req, res, next);
      expect(mockHandler).toHaveBeenCalledWith(req, res, next);
    });
  });
});
