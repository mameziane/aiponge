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
  signUserIdHeader: vi.fn((userId: string) => ({ 'x-user-id-signed': userId })),
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

vi.mock('@aiponge/shared-contracts/safety', () => ({
  CRISIS_RESOURCES: {
    global: { url: 'https://findahelpline.com', name: 'Find A Helpline' },
    us: { url: 'https://988lifeline.org', name: '988 Suicide & Crisis Lifeline' },
  },
  getCrisisResourceByRegion: vi.fn(() => ({ url: 'https://findahelpline.com', name: 'Global Helpline' })),
  getAllCrisisResources: vi.fn(() => ({ global: { url: 'https://findahelpline.com' } })),
  getEmergencyMessage: vi.fn(() => 'If you are in danger, call emergency services.'),
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Safety Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/safety.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/safety', mod.default);
  });

  describe('POST /assess-risk', () => {
    it('should return 401 when no user ID', async () => {
      const res = await request(app).post('/api/app/safety/assess-risk').send({ text: 'test content' });
      expect(res.status).toBe(401);
    });

    it('should return 200 with safety assessment for authenticated user', async () => {
      const safetyResult = {
        severity: 'low',
        detected: true,
        flagId: 'flag-123',
        type: 'emotional_distress',
        matchedPatterns: ['sadness'],
        aiConfidence: 0.8,
      };

      mockGatewayFetch.mockResolvedValueOnce(mockResponse(safetyResult));

      const res = await request(app)
        .post('/api/app/safety/assess-risk')
        .set('x-user-id', 'user-123')
        .set('x-correlation-id', 'corr-123')
        .send({ text: 'I feel sad today', sourceType: 'entry' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.level).toBeDefined();
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/internal/safety/analyze'),
        expect.anything()
      );
    });

    it('should return fallback assessment when upstream fails', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({}, 500));

      const res = await request(app)
        .post('/api/app/safety/assess-risk')
        .set('x-user-id', 'user-123')
        .send({ text: 'test content' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.source).toBe('fallback');
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/internal/safety/analyze'),
        expect.anything()
      );
    });
  });

  describe('GET /resources', () => {
    it('should return crisis resources', async () => {
      const res = await request(app).get('/api/app/safety/resources');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('GET /resources/all', () => {
    it('should return all crisis resources', async () => {
      const res = await request(app).get('/api/app/safety/resources/all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
