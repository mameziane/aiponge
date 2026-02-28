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
  serviceRegistrationClient: {
    discover: vi.fn().mockResolvedValue([]),
    register: vi.fn(),
  },
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

vi.mock('../../utils/logger', () => ({
  default: mockLogger,
}));

vi.mock('../../utils/metrics', () => ({
  metrics: {
    getCounter: vi.fn(() => 0),
    getHistogramStats: vi.fn(() => ({ count: 0, sum: 0, avg: 0 })),
  },
  prometheusHandler: (_req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain');
    res.status(200).send('');
  },
}));

vi.mock('../../config/environment', () => ({
  environmentConfig: { defaultRequestTimeoutMs: 5000 },
  getServiceUrl: vi.fn(() => 'http://localhost:3020/health'),
  getAllEnabledServices: vi.fn(() => []),
  isServiceEnabled: vi.fn(() => false),
}));

vi.mock('../../errors', () => ({
  GatewayError: {
    timeout: vi.fn((op: string, ms: number) => new Error(`Timeout: ${op} after ${ms}ms`)),
    upstreamError: vi.fn((service: string, status: number, msg: string) => new Error(msg)),
  },
}));

vi.mock('../../types/request.types', () => ({}));
vi.mock('../../types', () => ({}));

vi.mock('../../presentation/utils/response-helpers', () => ({
  ServiceErrors: {
    fromException: vi.fn((res: Response, _error: unknown, message: string) => {
      res.status(502).json({ success: false, message });
    }),
  },
}));

describe('Health Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/health.routes');
    app = express();
    app.use(express.json());
    app.use(mod.default);
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.uptime).toBeDefined();
      expect(res.body.memory).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('should return 200 with liveness status', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.alive).toBe(true);
      expect(res.body.service).toBe('api-gateway');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/startup', () => {
    it('should return 200 with startup status', async () => {
      const res = await request(app).get('/health/startup');

      expect(res.status).toBe(200);
      expect(res.body.started).toBe(true);
      expect(res.body.service).toBe('api-gateway');
    });
  });

  describe('GET /version', () => {
    it('should return 200 with version info', async () => {
      const res = await request(app).get('/version');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('API Gateway');
      expect(res.body.nodeVersion).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });
  });
});
