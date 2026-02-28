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
  errorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  extractAuthContext: vi.fn((req: Request) => ({ userId: req.headers?.['x-user-id'] || null })),
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
  requireAdmin: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-user-role'] !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  },
}));

vi.mock('../../presentation/utils/response-helpers', () => ({
  ServiceErrors: {
    fromException: vi.fn((res: Response, _error: unknown, message: string) => {
      res.status(502).json({ success: false, message });
    }),
    badRequest: vi.fn((res: Response, message: string) => {
      res.status(400).json({ success: false, message });
    }),
    forbidden: vi.fn((res: Response, message: string) => {
      res.status(403).json({ success: false, message });
    }),
    notFound: vi.fn((res: Response, message: string) => {
      res.status(404).json({ success: false, message });
    }),
    internal: vi.fn((res: Response, message: string) => {
      res.status(500).json({ success: false, message });
    }),
    serviceUnavailable: vi.fn((res: Response, message: string) => {
      res.status(503).json({ success: false, message });
    }),
  },
}));

vi.mock('../../presentation/middleware/SafetyScreeningMiddleware', () => ({
  safetyScreeningMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../presentation/middleware/ResponseCacheMiddleware', () => ({
  createResponseCacheMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  getCacheStats: vi.fn(() => ({ size: 0, hits: 0, misses: 0 })),
  clearCache: vi.fn(),
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../presentation/middleware/IdempotencyMiddleware', () => ({
  getIdempotencyCacheStats: vi.fn(() => ({ size: 0 })),
}));

vi.mock('../../presentation/middleware/RedisRateLimitMiddleware', () => ({
  isSharedRedisReady: false,
}));

vi.mock('../../presentation/controllers/AdminAggregationController', () => ({
  adminController: {
    getUserProfileData: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getUserCreditsStats: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getProductMetrics: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
  },
}));

vi.mock('../../presentation/controllers/AdminHealthController', () => ({
  adminHealthController: {
    getSystemHealthOverview: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getCircuitBreakerStatsEndpoint: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getQualityMetrics: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getServiceMetrics: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getSystemTopology: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getSystemDiagnostics: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getTestEndpoints: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    testEndpoint: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getRecentErrors: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: [] });
    }),
    getErrorByCorrelationId: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getErrorStats: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getMonitoringConfig: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    updateMonitoringConfig: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true });
    }),
    getMonitoringHealthSummary: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getMonitoringIssues: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: [] });
    }),
    getAggregatedResilienceStats: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
  },
}));

vi.mock('../../presentation/controllers/AdminProvidersController', () => ({
  adminProvidersController: {
    getProviders: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: [] });
    }),
    getAIProvidersConfig: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    getProviderConfigurations: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: [] });
    }),
    getProviderConfigurationById: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    createProviderConfiguration: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    updateProviderConfiguration: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    deleteProviderConfiguration: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true });
    }),
    discoverProviders: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: [] });
    }),
    setProviderAsPrimary: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true });
    }),
    healthCheckProviderConfiguration: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true });
    }),
    testProviderConfiguration: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true });
    }),
    getMusicApiCredits: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true, data: {} });
    }),
    refreshMusicApiCredits: vi.fn(async (_req: Request, res: Response) => {
      res.json({ success: true });
    }),
  },
}));

vi.mock('@aiponge/shared-contracts', () => ({
  USER_ROLES: { MEMBER: 'member', ADMIN: 'admin', LIBRARIAN: 'librarian' },
  isPrivilegedRole: (role: string) => role === 'admin' || role === 'librarian',
  normalizeRole: (role: string) => (role || 'member').toLowerCase(),
  sendStructuredError: vi.fn((res: Response, status: number, error: unknown) => {
    res.status(status).json(error);
  }),
  createStructuredError: vi.fn((...args: unknown[]) => ({ code: args[0], type: args[1], message: args[2] })),
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
  extractErrorInfo: vi.fn(() => ({})),
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Admin Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/admin.routes');
    app = express();
    app.use(express.json());
    app.use('/api/admin', mod.adminRoutes);
  });

  describe('GET /cache/stats', () => {
    it('should return 200 with cache stats', async () => {
      const res = await request(app).get('/api/admin/cache/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('responseCache');
      expect(res.body.data).toHaveProperty('idempotencyCache');
    });
  });

  describe('POST /cache/invalidate', () => {
    it('should return 400 without pattern', async () => {
      const res = await request(app).post('/api/admin/cache/invalidate').send({});
      expect(res.status).toBe(400);
    });

    it('should return 200 with valid pattern', async () => {
      const res = await request(app).post('/api/admin/cache/invalidate').send({ pattern: '/api/app/library/*' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /templates/summary', () => {
    it('should return 200 proxying to user-service', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { total: 10 } }));

      const res = await request(app).get('/api/admin/templates/summary');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /health-overview', () => {
    it('should return 200 with health overview', async () => {
      const res = await request(app).get('/api/admin/health-overview');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /providers', () => {
    it('should return 200 with providers list', async () => {
      const res = await request(app).get('/api/admin/providers');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
