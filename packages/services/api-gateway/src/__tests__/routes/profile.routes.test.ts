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

const mockGatewayFetch = vi.hoisted(() => vi.fn());

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  ServiceLocator: {
    getServiceUrl: vi.fn(() => 'http://localhost:3020'),
    getServicePort: vi.fn(() => 3020),
  },
  serializeError: vi.fn((e: unknown) => String(e)),
  getValidation: () => ({ validateBody: () => (_req: Request, _res: Response, next: NextFunction) => next(), validateQuery: () => (_req: Request, _res: Response, next: NextFunction) => next() }),
}));

vi.mock('@services/gatewayFetch', () => ({
  gatewayFetch: mockGatewayFetch,
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../config/GatewayConfig', () => ({
  GatewayConfig: {
    rateLimit: { isRedisEnabled: false, redis: {} },
    http: { defaults: { timeout: 5000, retries: 0 } },
    server: { port: 8080, host: '0.0.0.0', nodeEnv: 'test' },
  },
}));

vi.mock('../../config/PolicyRegistry', () => ({
  ServiceManifest: { exists: vi.fn(() => false), getDefaultPolicies: vi.fn(() => ({})) },
  PolicyRegistry: {
    getDefaultPolicies: vi.fn(() => ({
      rateLimit: false,
      auth: { required: true, injectUserId: true },
      logging: { level: 'info' },
      cache: false,
    })),
    getRateLimitConfig: vi.fn(() => ({ maxRequests: 0, windowMs: 60000, keyType: 'ip', segment: 'default' })),
  },
}));

vi.mock('../../presentation/middleware/authorizationMiddleware', () => ({
  injectAuthenticatedUserId: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-user-id']) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
  },
}));

vi.mock('../../presentation/utils/response-helpers', () => ({
  ServiceErrors: {
    fromException: vi.fn((res: Response, _error: unknown, message: string) => {
      res.status(502).json({ success: false, message });
    }),
  },
}));

vi.mock('../../presentation/middleware/SafetyScreeningMiddleware', () => ({
  safetyScreeningMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../presentation/middleware/ResponseCacheMiddleware', () => ({
  createResponseCacheMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  USER_ROLES: { MEMBER: 'member', ADMIN: 'admin', LIBRARIAN: 'librarian' },
  isPrivilegedRole: (role: string) => role === 'admin' || role === 'librarian',
  normalizeRole: (role: string) => (role || 'member').toLowerCase(),
}));

vi.mock('@aiponge/shared-contracts/api/input-schemas', () => ({
  UpdateProfileSchema: {},
  UpdatePreferencesSchema: {},
  UpdatePuzzleProgressSchema: {},
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Profile Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/profile.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/profile', mod.default);
  });

  describe('GET /', () => {
    it('should return 401 without user-id', async () => {
      const res = await request(app).get('/api/app/profile');
      expect(res.status).toBe(401);
    });

    it('should return 200 with user-id', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'user-123', displayName: 'Test' } })
      );

      const res = await request(app)
        .get('/api/app/profile')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/profiles/'), expect.anything());
    });
  });

  describe('PATCH /', () => {
    it('should return 401 without user-id', async () => {
      const res = await request(app)
        .patch('/api/app/profile')
        .send({ displayName: 'New Name' });
      expect(res.status).toBe(401);
    });

    it('should return 200 with user-id', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'user-123', displayName: 'New Name' } })
      );

      const res = await request(app)
        .patch('/api/app/profile')
        .set('x-user-id', 'user-123')
        .send({ displayName: 'New Name' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/profiles/'), expect.anything());
    });
  });

  describe('PATCH /preferences', () => {
    it('should return 401 without user-id', async () => {
      const res = await request(app)
        .patch('/api/app/profile/preferences')
        .send({ preferences: { theme: 'dark' } });
      expect(res.status).toBe(401);
    });

    it('should return 200 with user-id', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { preferences: { theme: 'dark' } } })
      );

      const res = await request(app)
        .patch('/api/app/profile/preferences')
        .set('x-user-id', 'user-123')
        .send({ preferences: { theme: 'dark' } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/users/'), expect.anything());
    });
  });

  describe('GET /wellness', () => {
    it('should return 401 without user-id', async () => {
      const res = await request(app).get('/api/app/profile/wellness');
      expect(res.status).toBe(401);
    });

    it('should return 200 with user-id', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { score: 85 } })
      );

      const res = await request(app)
        .get('/api/app/profile/wellness')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/analytics/users/'), expect.anything());
    });
  });
});
