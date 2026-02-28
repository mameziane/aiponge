import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
}));

import {
  verifyUserOwnership,
  injectAuthenticatedUserId,
  injectOptionalUserId,
} from '../../presentation/middleware/authorizationMiddleware';

function createMockReq(overrides = {}) {
  return { headers: {}, params: {}, query: {}, body: {}, user: undefined, cookies: {}, ip: '127.0.0.1', method: 'GET', path: '/', get: vi.fn((h: string) => ({} as Record<string, string>)[h]), ...overrides } as unknown as Request;
}
function createMockRes() {
  const res = { _statusCode: 200, _data: undefined, locals: {}, status: vi.fn(function(this: Record<string, unknown>, c: number) { this._statusCode = c; return this; }), json: vi.fn(function(this: Record<string, unknown>, d: unknown) { this._data = d; return this; }), send: vi.fn(function(this: Record<string, unknown>, d: unknown) { this._data = d; return this; }), set: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as unknown as Response;
  return res;
}

describe('verifyUserOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call next when authenticated user matches requested userId in body', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      body: { userId: 'user-123' },
    });
    const res = createMockRes();
    const next = vi.fn();

    verifyUserOwnership(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next when authenticated user matches requested userId in query', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      query: { userId: 'user-123' },
    });
    const res = createMockRes();
    const next = vi.fn();

    verifyUserOwnership(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next when authenticated user matches requested userId in params', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      params: { userId: 'user-123' },
    });
    const res = createMockRes();
    const next = vi.fn();

    verifyUserOwnership(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next when no requestedUserId is present', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
    });
    const res = createMockRes();
    const next = vi.fn();

    verifyUserOwnership(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 401 when no authenticated user ID', () => {
    const req = createMockReq({ headers: {} });
    const res = createMockRes();
    const next = vi.fn();

    verifyUserOwnership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        message: 'Authentication required',
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when user tries to access another user resources', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      body: { userId: 'user-456' },
    });
    const res = createMockRes();
    const next = vi.fn();

    verifyUserOwnership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        message: expect.stringContaining('Unauthorized'),
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when userId mismatch in query', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      query: { userId: 'user-999' },
    });
    const res = createMockRes();
    const next = vi.fn();

    verifyUserOwnership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('injectAuthenticatedUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should inject userId from x-user-id header into body and query', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      body: {},
      query: {},
      path: '/api/test',
    });
    const res = createMockRes();
    const next = vi.fn();

    injectAuthenticatedUserId(req, res, next);

    expect(req.body.userId).toBe('user-123');
    expect(req.query.userId).toBe('user-123');
    expect(next).toHaveBeenCalled();
  });

  it('should fallback to res.locals.userId when header is missing', () => {
    const req = createMockReq({
      headers: {},
      body: {},
      query: {},
      path: '/api/test',
    });
    const res = createMockRes();
    res.locals.userId = 'user-from-locals';
    const next = vi.fn();

    injectAuthenticatedUserId(req, res, next);

    expect(req.headers['x-user-id']).toBe('user-from-locals');
    expect(req.body.userId).toBe('user-from-locals');
    expect(next).toHaveBeenCalled();
  });

  it('should fallback userRole from res.locals when header is missing', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      body: {},
      query: {},
      path: '/api/test',
    });
    const res = createMockRes();
    res.locals.userRole = 'admin';
    const next = vi.fn();

    injectAuthenticatedUserId(req, res, next);

    expect(req.headers['x-user-role']).toBe('admin');
    expect(next).toHaveBeenCalled();
  });

  it('should return 401 when no userId is available from any source', () => {
    const req = createMockReq({
      headers: {},
      body: {},
      query: {},
      path: '/api/test',
    });
    const res = createMockRes();
    const next = vi.fn();

    injectAuthenticatedUserId(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        message: 'Authentication required',
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should override userId in body with authenticated user', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'real-user' },
      body: { userId: 'spoofed-user' },
      query: {},
      path: '/api/test',
    });
    const res = createMockRes();
    const next = vi.fn();

    injectAuthenticatedUserId(req, res, next);

    expect(req.body.userId).toBe('real-user');
    expect(next).toHaveBeenCalled();
  });

  it('should not override userId in query if already present', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      body: {},
      query: { userId: 'existing-query-user' },
      path: '/api/test',
    });
    const res = createMockRes();
    const next = vi.fn();

    injectAuthenticatedUserId(req, res, next);

    expect(req.query.userId).toBe('existing-query-user');
    expect(next).toHaveBeenCalled();
  });

  it('should log debug info for library routes', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      body: {},
      query: {},
      path: '/api/library/books',
      method: 'GET',
    });
    const res = createMockRes();
    res.locals.authenticated = true;
    const next = vi.fn();

    injectAuthenticatedUserId(req, res, next);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Auth context for library route',
      expect.objectContaining({ path: '/api/library/books' }),
    );
    expect(next).toHaveBeenCalled();
  });
});

describe('injectOptionalUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should inject userId when authenticated', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
      body: {},
      query: {},
    });
    const res = createMockRes();
    const next = vi.fn();

    injectOptionalUserId(req, res, next);

    expect(req.body.userId).toBe('user-123');
    expect(req.query.userId).toBe('user-123');
    expect(next).toHaveBeenCalled();
  });

  it('should fallback to res.locals.userId', () => {
    const req = createMockReq({
      headers: {},
      body: {},
      query: {},
    });
    const res = createMockRes();
    res.locals.userId = 'locals-user';
    const next = vi.fn();

    injectOptionalUserId(req, res, next);

    expect(req.headers['x-user-id']).toBe('locals-user');
    expect(req.body.userId).toBe('locals-user');
    expect(next).toHaveBeenCalled();
  });

  it('should allow guests through without userId', () => {
    const req = createMockReq({
      headers: {},
      body: {},
      query: {},
    });
    const res = createMockRes();
    const next = vi.fn();

    injectOptionalUserId(req, res, next);

    expect(req.body.userId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should not override existing query userId when not authenticated', () => {
    const req = createMockReq({
      headers: {},
      body: {},
      query: { userId: 'existing' },
    });
    const res = createMockRes();
    const next = vi.fn();

    injectOptionalUserId(req, res, next);

    expect(req.query.userId).toBe('existing');
    expect(next).toHaveBeenCalled();
  });
});
