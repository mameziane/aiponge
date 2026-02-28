import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

let authenticateCallback: ((err?: unknown) => void) | undefined;
const mockAuthHandler = vi.hoisted(() =>
  vi.fn((_req: Request, _res: Response, next: NextFunction) => {
    authenticateCallback = next;
  })
);
const mockAuthenticate = vi.hoisted(() => vi.fn().mockReturnValue(mockAuthHandler));

const { StandardAuthMiddleware: MockStandardAuthMiddleware } = vi.hoisted(() => {
  const cls = function (this: Record<string, unknown>) {
    this.authenticate = mockAuthenticate;
  } as unknown as new () => Record<string, unknown>;
  return { StandardAuthMiddleware: cls };
});

vi.mock('@aiponge/platform-core', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    StandardAuthMiddleware: MockStandardAuthMiddleware,
    AuthenticatedRequest: {},
  };
});

vi.mock('@aiponge/shared-contracts', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    USER_ROLES: { ADMIN: 'admin', LIBRARIAN: 'librarian', USER: 'user' },
    PRIVILEGED_ROLES: ['admin', 'librarian'],
    isValidRole: (role: string) => ['admin', 'librarian', 'user'].includes(role),
  };
});

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
}));

import {
  adminAuthMiddleware,
  librarianAuthMiddleware,
  developmentOnlyMiddleware,
} from '../../presentation/middleware/adminAuthMiddleware';

function createMockReq(overrides = {}) {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    user: undefined,
    cookies: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/',
    get: vi.fn((h: string) => (({}) as Record<string, string>)[h]),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const res = {
    _statusCode: 200,
    _data: undefined,
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
  } as unknown as Response;
  return res;
}

describe('adminAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCallback = undefined;
  });

  it('should strip x-user-* headers before authentication', () => {
    const req = createMockReq({
      headers: {
        'x-user-id': 'spoofed-user',
        'x-user-role': 'admin',
        'x-internal-service': 'true',
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    expect(req.headers['x-user-id']).toBeUndefined();
    expect(req.headers['x-user-role']).toBeUndefined();
    expect(req.headers['x-internal-service']).toBeUndefined();
  });

  it('should grant access for admin role with valid user ID', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    req.user = { id: 'admin-user-1', role: 'admin', email: 'admin@example.com' };
    authenticateCallback!();

    expect(res.locals.userId).toBe('admin-user-1');
    expect(req.headers['x-user-id']).toBe('admin-user-1');
    expect(req.headers['x-user-role']).toBe('admin');
    expect(next).toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith('Admin access granted', { userId: 'admin-user-1' });
  });

  it('should pass errors from StandardAuthMiddleware to next', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);
    authenticateCallback!(new Error('Auth failed'));

    expect(next).toHaveBeenCalledWith(new Error('Auth failed'));
  });

  it('should return 401 when no user ID in token', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    req.user = { email: 'test@example.com' };
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          details: expect.objectContaining({
            code: 'ADMIN_AUTH_REQUIRED',
          }),
        }),
      })
    );
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should return 401 when no user at all', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 403 for non-admin role (user)', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    req.user = { id: 'regular-user', role: 'user' };
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          details: expect.objectContaining({
            code: 'ADMIN_ROLE_REQUIRED',
          }),
        }),
      })
    );
  });

  it('should return 403 for librarian role (not admin)', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    req.user = { id: 'librarian-user', role: 'librarian' };
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should lowercase role from roles array', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    req.user = { id: 'admin-user-2', roles: ['Admin'] };
    authenticateCallback!();

    expect(next).toHaveBeenCalled();
    expect(req.headers['x-user-role']).toBe('admin');
  });
});

describe('librarianAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCallback = undefined;
  });

  it('should strip x-user-* headers before authentication', () => {
    const req = createMockReq({
      headers: {
        'x-user-id': 'spoofed-user',
        'x-user-role': 'admin',
        'x-internal-service': 'true',
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);

    expect(req.headers['x-user-id']).toBeUndefined();
    expect(req.headers['x-user-role']).toBeUndefined();
    expect(req.headers['x-internal-service']).toBeUndefined();
  });

  it('should grant access for admin role', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);

    req.user = { id: 'admin-1', role: 'admin' };
    authenticateCallback!();

    expect(next).toHaveBeenCalled();
    expect(res.locals.userId).toBe('admin-1');
    expect(req.headers['x-user-role']).toBe('admin');
  });

  it('should grant access for librarian role', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);

    req.user = { id: 'librarian-1', role: 'librarian' };
    authenticateCallback!();

    expect(next).toHaveBeenCalled();
    expect(res.locals.userId).toBe('librarian-1');
    expect(req.headers['x-user-role']).toBe('librarian');
  });

  it('should pass errors from StandardAuthMiddleware to next', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);
    authenticateCallback!(new Error('Auth failed'));

    expect(next).toHaveBeenCalledWith(new Error('Auth failed'));
  });

  it('should return 401 when no user ID in token', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);

    req.user = { email: 'test@example.com' };
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          details: expect.objectContaining({
            code: 'LIBRARIAN_AUTH_REQUIRED',
          }),
        }),
      })
    );
  });

  it('should return 403 for regular user role', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);

    req.user = { id: 'regular-user', role: 'user' };
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          details: expect.objectContaining({
            code: 'LIBRARIAN_ROLE_REQUIRED',
          }),
        }),
      })
    );
  });

  it('should return 403 for invalid/unknown role', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);

    req.user = { id: 'user-1', role: 'superuser' };
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when no role is present', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    librarianAuthMiddleware(req, res, next);

    req.user = { id: 'user-1' };
    authenticateCallback!();

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('developmentOnlyMiddleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should call next in development environment', () => {
    process.env.NODE_ENV = 'development';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    developmentOnlyMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next in test environment', () => {
    process.env.NODE_ENV = 'test';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    developmentOnlyMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 404 in production environment', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockReq({ path: '/dev-only-endpoint' });
    const res = createMockRes();
    const next = vi.fn();

    developmentOnlyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'NOT_FOUND',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
