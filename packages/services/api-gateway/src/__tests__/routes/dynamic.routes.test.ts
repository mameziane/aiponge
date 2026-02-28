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

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  ServiceLocator: {
    getServiceUrl: vi.fn(() => 'http://localhost:3020'),
    getServicePort: vi.fn(() => 3020),
  },
  serializeError: vi.fn((e: unknown) => String(e)),
  serviceRegistrationClient: {},
  createHttpClient: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
  })),
  signUserIdHeader: vi.fn(),
  HttpClient: vi.fn(),
}));

vi.mock('@services/gatewayFetch', () => ({
  gatewayFetch: vi.fn(),
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

vi.mock('../../presentation/utils/response-helpers', () => ({
  ServiceErrors: {
    fromException: vi.fn((res: Response, _error: unknown, message: string) => {
      res.status(502).json({ success: false, message });
    }),
  },
}));

vi.mock('../../presentation/middleware/ResponseCacheMiddleware', () => ({
  createResponseCacheMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../errors', () => ({
  GatewayError: class GatewayError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'GatewayError';
    }
  },
}));

const mockDynamicRouter = {
  getAllRoutes: vi.fn(() => []),
  addRoute: vi.fn(),
  removeRoute: vi.fn(() => true),
  getAvailableServices: vi.fn(async () => []),
  getServiceStats: vi.fn(async () => null),
  getMetrics: vi.fn(() => ({
    totalRequests: 100,
    successfulRequests: 95,
    failedRequests: 5,
    averageResponseTime: 150,
    requestsByService: new Map(),
    errorsByService: new Map(),
  })),
  clearMetrics: vi.fn(),
  isDiscoveryHealthy: vi.fn(async () => true),
  getRouteConfig: vi.fn(() => null),
};

describe('Dynamic Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { DynamicRoutesHandler } = await import('../../presentation/routes/dynamic.routes');
    const handler = new DynamicRoutesHandler(
      mockDynamicRouter as unknown as ConstructorParameters<typeof DynamicRoutesHandler>[0]
    );
    app = express();
    app.use(express.json());
    app.use('/api', handler.getRouter());
  });

  describe('GET /gateway/status', () => {
    it('should return 200 with gateway status', async () => {
      const res = await request(app).get('/api/gateway/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gateway).toHaveProperty('status', 'running');
    });
  });

  describe('GET /gateway/routes', () => {
    it('should return 200 with routes list', async () => {
      const res = await request(app).get('/api/gateway/routes');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('routes');
      expect(res.body).toHaveProperty('total', 0);
    });
  });

  describe('GET /gateway/metrics', () => {
    it('should return 200 with metrics', async () => {
      const res = await request(app).get('/api/gateway/metrics');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.metrics.totalRequests).toBe(100);
    });
  });

  describe('POST /gateway/routes', () => {
    it('should return 400 when path or serviceName missing', async () => {
      const res = await request(app).post('/api/gateway/routes').send({});
      expect(res.status).toBe(400);
    });

    it('should return 201 with valid route config', async () => {
      const res = await request(app).post('/api/gateway/routes').send({ path: '/test', serviceName: 'test-service' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /gateway/health', () => {
    it('should return 200 when healthy', async () => {
      mockDynamicRouter.isDiscoveryHealthy.mockResolvedValueOnce(true);
      mockDynamicRouter.getAvailableServices.mockResolvedValueOnce([
        { name: 'test-service', host: 'localhost', port: 3000 },
      ]);

      const res = await request(app).get('/api/gateway/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });
});
