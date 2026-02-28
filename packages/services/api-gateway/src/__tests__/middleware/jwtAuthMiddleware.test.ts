import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

let authenticateCallback: ((err?: unknown) => void) | undefined;
const mockAuthHandler = vi.hoisted(() => vi.fn((_req: Request, _res: Response, next: NextFunction) => {
  authenticateCallback = next;
}));
const mockAuthenticate = vi.hoisted(() => vi.fn().mockReturnValue(mockAuthHandler));

const { StandardAuthMiddleware: MockStandardAuthMiddleware } = vi.hoisted(() => {
  const cls = function(this: Record<string, unknown>) { this.authenticate = mockAuthenticate; } as unknown as new () => Record<string, unknown>;
  return { StandardAuthMiddleware: cls };
});

vi.mock('@aiponge/platform-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    StandardAuthMiddleware: MockStandardAuthMiddleware,
    AuthenticatedRequest: {},
  };
});

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
}));

import { jwtAuthMiddleware, optionalJwtAuthMiddleware } from '../../presentation/middleware/jwtAuthMiddleware';

function createMockReq(overrides = {}) {
  return { headers: {}, params: {}, query: {}, body: {}, user: undefined, cookies: {}, ip: '127.0.0.1', method: 'GET', path: '/', get: vi.fn((h: string) => ({} as Record<string, string>)[h]), ...overrides } as unknown as Request;
}
function createMockRes() {
  const res = { _statusCode: 200, _data: undefined, locals: {}, status: vi.fn(function(this: Record<string, unknown>, c: number) { this._statusCode = c; return this; }), json: vi.fn(function(this: Record<string, unknown>, d: unknown) { this._data = d; return this; }), send: vi.fn(function(this: Record<string, unknown>, d: unknown) { this._data = d; return this; }), set: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as unknown as Response;
  return res;
}

describe('jwtAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCallback = undefined;
  });

  describe('happy path', () => {
    it('should set userId and role in res.locals and headers when token is valid', () => {
      const req = createMockReq({ headers: { authorization: 'Bearer valid-token' } });
      const res = createMockRes();
      const next = vi.fn();

      jwtAuthMiddleware(req, res, next);

      req.user = { id: 'user-123', role: 'admin', email: 'test@example.com' };
      authenticateCallback!();

      expect(res.locals.userId).toBe('user-123');
      expect(res.locals.userRole).toBe('admin');
      expect(res.locals.authenticated).toBe(true);
      expect(req.headers['x-user-id']).toBe('user-123');
      expect(req.headers['x-user-role']).toBe('admin');
      expect(next).toHaveBeenCalled();
    });

    it('should use roles array fallback when role is not set', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      jwtAuthMiddleware(req, res, next);

      req.user = { id: 'user-456', roles: ['User'], email: 'test@example.com' };
      authenticateCallback!();

      expect(res.locals.userRole).toBe('user');
      expect(req.headers['x-user-role']).toBe('user');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('authentication failures', () => {
    it('should pass error to next when StandardAuthMiddleware fails', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      jwtAuthMiddleware(req, res, next);

      const error = new Error('Invalid token');
      authenticateCallback!(error);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should return 401 when token has no user ID', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      jwtAuthMiddleware(req, res, next);

      req.user = { email: 'test@example.com' };
      authenticateCallback!();

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          details: expect.objectContaining({
            code: 'INVALID_TOKEN',
          }),
        }),
      }));
      expect(next).not.toHaveBeenCalledWith();
    });

    it('should return 401 when no user is set at all', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      jwtAuthMiddleware(req, res, next);
      authenticateCallback!();

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('edge cases', () => {
    it('should not set x-user-role header when role is undefined', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      jwtAuthMiddleware(req, res, next);

      req.user = { id: 'user-789' };
      authenticateCallback!();

      expect(res.locals.userId).toBe('user-789');
      expect(res.locals.userRole).toBeUndefined();
      expect(req.headers['x-user-role']).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should lowercase the role', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      jwtAuthMiddleware(req, res, next);

      req.user = { id: 'user-1', role: 'ADMIN' };
      authenticateCallback!();

      expect(res.locals.userRole).toBe('admin');
      expect(req.headers['x-user-role']).toBe('admin');
    });
  });
});

describe('optionalJwtAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCallback = undefined;
  });

  it('should call next immediately when no auth header is present', () => {
    const req = createMockReq({ headers: {} });
    const res = createMockRes();
    const next = vi.fn();

    optionalJwtAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockAuthHandler).not.toHaveBeenCalled();
  });

  it('should call next immediately when auth header does not start with Bearer', () => {
    const req = createMockReq({ headers: { authorization: 'Basic abc123' } });
    const res = createMockRes();
    const next = vi.fn();

    optionalJwtAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should set user info when Bearer token is valid', () => {
    const req = createMockReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = createMockRes();
    const next = vi.fn();

    optionalJwtAuthMiddleware(req, res, next);

    req.user = { id: 'user-opt-1', role: 'user', email: 'opt@example.com' };
    authenticateCallback!();

    expect(res.locals.userId).toBe('user-opt-1');
    expect(res.locals.authenticated).toBe(true);
    expect(req.headers['x-user-id']).toBe('user-opt-1');
    expect(next).toHaveBeenCalled();
  });

  it('should continue as guest when auth fails', () => {
    const req = createMockReq({ headers: { authorization: 'Bearer invalid-token' } });
    const res = createMockRes();
    const next = vi.fn();

    optionalJwtAuthMiddleware(req, res, next);

    authenticateCallback!(new Error('Invalid token'));

    expect(next).toHaveBeenCalled();
    expect(res.locals.userId).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('should not set user info when userId is missing from decoded token', () => {
    const req = createMockReq({ headers: { authorization: 'Bearer some-token' } });
    const res = createMockRes();
    const next = vi.fn();

    optionalJwtAuthMiddleware(req, res, next);

    req.user = { email: 'nouser@example.com' };
    authenticateCallback!();

    expect(res.locals.userId).toBeUndefined();
    expect(res.locals.authenticated).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
