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
  getValidation: () => ({
    validateBody: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    validateQuery: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  }),
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
  MusicGenerateSchema: {},
  GenerateLyricsSchema: {},
  USER_ROLES: { MEMBER: 'member', ADMIN: 'admin', LIBRARIAN: 'librarian' },
  isPrivilegedRole: (role: string) => role === 'admin' || role === 'librarian',
  normalizeRole: (role: string) => (role || 'member').toLowerCase(),
  CONTENT_LIMITS: { MAX_TRACKS_PER_ALBUM: 20 },
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Init Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/init.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/init', mod.default);
  });

  describe('GET /', () => {
    it('should return 401 when no user ID', async () => {
      const res = await request(app).get('/api/app/init');
      expect(res.status).toBe(401);
    });

    it('should return 200 with composite startup data for authenticated user', async () => {
      const profileResp = mockResponse({ success: true, data: { name: 'Test User' } });
      const creditsBalanceResp = mockResponse({ success: true, data: { balance: 10 } });
      const creditsPolicyResp = mockResponse({ success: true, data: { maxCredits: 100 } });
      const guestConversionResp = mockResponse({ success: true, data: { canConvert: true } });
      const recentEntriesResp = mockResponse({ success: true, data: { entries: [{ id: 'e1', content: 'test' }] } });

      mockGatewayFetch
        .mockResolvedValueOnce(profileResp)
        .mockResolvedValueOnce(creditsBalanceResp)
        .mockResolvedValueOnce(creditsPolicyResp)
        .mockResolvedValueOnce(guestConversionResp)
        .mockResolvedValueOnce(recentEntriesResp);

      const res = await request(app).get('/api/app/init').set('x-user-id', 'user-123').set('x-request-id', 'req-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('profile');
      expect(res.body.data).toHaveProperty('credits');
      expect(res.body.data).toHaveProperty('recentEntries');
      expect(res.body.timestamp).toBeDefined();

      expect(mockGatewayFetch).toHaveBeenCalledTimes(5);
      const urls = mockGatewayFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(urls).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/profiles/'),
          expect.stringContaining('/credits/'),
          expect.stringContaining('/entries/'),
        ])
      );
    });

    it('should handle partial failures gracefully', async () => {
      const profileResp = mockResponse({ success: true, data: { name: 'Test User' } });
      const failResp = { ok: false, status: 500, json: vi.fn().mockResolvedValue(null), headers: new Map() };

      mockGatewayFetch
        .mockResolvedValueOnce(profileResp)
        .mockResolvedValueOnce(failResp)
        .mockResolvedValueOnce(failResp)
        .mockResolvedValueOnce(failResp)
        .mockResolvedValueOnce(failResp);

      const res = await request(app).get('/api/app/init').set('x-user-id', 'user-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
