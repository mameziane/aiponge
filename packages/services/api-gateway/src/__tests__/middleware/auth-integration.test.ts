import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

let simulatedUser: Record<string, unknown> | undefined = undefined;
let simulatedError: (Error & { status?: number }) | undefined = undefined;

const mockAuthHandler = vi.hoisted(() =>
  vi.fn((req: Request, _res: Response, next: NextFunction) => {
    if (simulatedError) {
      return next(simulatedError);
    }
    if (simulatedUser) {
      req.user = simulatedUser;
    }
    next();
  }),
);

const mockAuthenticate = vi.hoisted(() => vi.fn().mockReturnValue(mockAuthHandler));

const { StandardAuthMiddleware: MockStandardAuthMiddleware } = vi.hoisted(() => {
  const cls = function (this: Record<string, unknown>) {
    this.authenticate = mockAuthenticate;
  } as unknown as new () => Record<string, unknown>;
  return { StandardAuthMiddleware: cls };
});

vi.mock('@aiponge/platform-core', () => ({
  StandardAuthMiddleware: MockStandardAuthMiddleware,
  AuthenticatedRequest: {},
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  serializeError: vi.fn((e: unknown) => String(e)),
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
}));

vi.mock('@aiponge/shared-contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    USER_ROLES: { MEMBER: 'member', ADMIN: 'admin', LIBRARIAN: 'librarian' },
    PRIVILEGED_ROLES: ['admin', 'librarian'],
    isValidRole: (role: string) => ['member', 'admin', 'librarian'].includes(role),
    isPrivilegedRole: (role: string) => role === 'admin' || role === 'librarian',
    normalizeRole: (role: string) => (role || 'member').toLowerCase(),
  };
});

describe('Auth Middleware Integration', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    simulatedUser = undefined;
    simulatedError = undefined;

    const { jwtAuthMiddleware, optionalJwtAuthMiddleware } = await import(
      '../../presentation/middleware/jwtAuthMiddleware'
    );
    const { adminAuthMiddleware } = await import(
      '../../presentation/middleware/adminAuthMiddleware'
    );

    app = express();
    app.use(express.json());

    app.get('/test/jwt', jwtAuthMiddleware, (_req, res) => {
      res.json({
        userId: res.locals.userId,
        userRole: res.locals.userRole,
        authenticated: res.locals.authenticated,
      });
    });

    app.get('/test/admin', adminAuthMiddleware, (_req, res) => {
      res.json({
        userId: res.locals.userId,
        role: _req.headers['x-user-role'],
      });
    });

    app.get('/test/optional', optionalJwtAuthMiddleware, (_req, res) => {
      res.json({
        userId: res.locals.userId ?? null,
        userRole: res.locals.userRole ?? null,
        authenticated: res.locals.authenticated ?? false,
        guest: !res.locals.userId,
      });
    });

    app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      res.status(err.status || 401).json({ error: { message: err.message } });
    });
  });

  describe('jwtAuthMiddleware', () => {
    it('should return 401 when no authorization header is provided', async () => {
      simulatedError = new Error('No token provided') as Error & { status?: number };
      simulatedError.status = 401;

      const res = await request(app).get('/test/jwt');

      expect(res.status).toBe(401);
    });

    it('should return 401 when token is invalid', async () => {
      simulatedError = new Error('Invalid token') as Error & { status?: number };
      simulatedError.status = 401;

      const res = await request(app)
        .get('/test/jwt')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should return 200 with user context when token is valid', async () => {
      simulatedUser = { id: 'user-123', role: 'member', email: 'test@example.com' };

      const res = await request(app)
        .get('/test/jwt')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user-123');
      expect(res.body.userRole).toBe('member');
      expect(res.body.authenticated).toBe(true);
    });

    it('should lowercase roles from token', async () => {
      simulatedUser = { id: 'user-456', role: 'ADMIN' };

      const res = await request(app)
        .get('/test/jwt')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.userRole).toBe('admin');
    });

    it('should return 401 when token has no user ID', async () => {
      simulatedUser = { email: 'noid@example.com' };

      const res = await request(app)
        .get('/test/jwt')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(401);
      expect(res.body.error.details.code).toBe('INVALID_TOKEN');
    });
  });

  describe('adminAuthMiddleware', () => {
    it('should return 401 when no token is provided', async () => {
      simulatedError = new Error('No token provided') as Error & { status?: number };
      simulatedError.status = 401;

      const res = await request(app).get('/test/admin');

      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not admin', async () => {
      simulatedUser = { id: 'user-789', role: 'member' };

      const res = await request(app)
        .get('/test/admin')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.error.details.code).toBe('ADMIN_ROLE_REQUIRED');
    });

    it('should return 200 when user is admin', async () => {
      simulatedUser = { id: 'admin-1', role: 'admin' };

      const res = await request(app)
        .get('/test/admin')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('admin-1');
      expect(res.body.role).toBe('admin');
    });
  });

  describe('optionalJwtAuthMiddleware', () => {
    it('should return 200 as guest when no token is provided', async () => {
      const res = await request(app).get('/test/optional');

      expect(res.status).toBe(200);
      expect(res.body.guest).toBe(true);
      expect(res.body.userId).toBeNull();
      expect(res.body.authenticated).toBe(false);
    });

    it('should return 200 with user context when valid token is provided', async () => {
      simulatedUser = { id: 'user-opt-1', role: 'member' };

      const res = await request(app)
        .get('/test/optional')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.guest).toBe(false);
      expect(res.body.userId).toBe('user-opt-1');
      expect(res.body.userRole).toBe('member');
      expect(res.body.authenticated).toBe(true);
    });

    it('should return 200 as guest when token is invalid', async () => {
      simulatedError = new Error('Invalid token') as Error & { status?: number };

      const res = await request(app)
        .get('/test/optional')
        .set('Authorization', 'Bearer bad-token');

      expect(res.status).toBe(200);
      expect(res.body.guest).toBe(true);
      expect(res.body.userId).toBeNull();
      expect(res.body.authenticated).toBe(false);
    });
  });
});
