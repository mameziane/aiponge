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

vi.mock('@aiponge/platform-core', () => {
  class DomainError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode = 500, _cause?: unknown) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'DomainError';
    }
  }
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
    ServiceLocator: {
      getServiceUrl: vi.fn(() => 'http://localhost:3020'),
      getServicePort: vi.fn(() => 3020),
    },
    serializeError: vi.fn((e: unknown) => String(e)),
    DomainError,
    createGatewayResponseHelpers: vi.fn(() => ({
      sendSuccess: vi.fn(),
      sendCreated: vi.fn(),
      forwardServiceError: vi.fn(),
      ServiceErrors: {
        fromException: vi.fn((res: Response, _error: unknown, message: string) => {
          res.status(502).json({ success: false, message });
        }),
      },
    })),
  };
});

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

vi.mock('../../presentation/middleware/ResponseCacheMiddleware', () => ({
  createResponseCacheMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../presentation/utils/response-helpers', () => ({
  ServiceErrors: {
    fromException: vi.fn((res: Response, _error: unknown, message: string) => {
      res.status(502).json({ success: false, message });
    }),
  },
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Credits Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/credits.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/credits', mod.default);
  });

  describe('GET /policy', () => {
    it('should return credit policy without authentication', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { songCost: 1, minimumBalance: 0 } }));
      const res = await request(app).get('/api/app/credits/policy');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/credits/policy'));
    });

    it('should forward service error status', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Error' }, 500));
      const res = await request(app).get('/api/app/credits/policy');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/credits/policy'));
    });
  });

  describe('GET /balance', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/app/credits/balance');
      expect(res.status).toBe(401);
    });

    it('should return balance for authenticated user', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { balance: 50 } }));
      const res = await request(app).get('/api/app/credits/balance').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/credits/'), expect.anything());
    });

    it('should forward 404 from service', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'User not found' }, 404));
      const res = await request(app).get('/api/app/credits/balance').set('x-user-id', 'nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/credits/'), expect.anything());
    });
  });

  describe('GET /transactions', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/app/credits/transactions');
      expect(res.status).toBe(401);
    });

    it('should return transactions', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { transactions: [] } }));
      const res = await request(app).get('/api/app/credits/transactions').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/credits/'), expect.anything());
    });
  });

  describe('POST /validate', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/app/credits/validate').send({ amount: 5 });
      expect(res.status).toBe(401);
    });

    it('should validate sufficient credits', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { valid: true } }));
      const res = await request(app).post('/api/app/credits/validate').set('x-user-id', 'user-123').send({ amount: 5 });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/credits/'), expect.anything());
    });

    it('should forward 402 for insufficient credits', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Insufficient credits' }, 402));
      const res = await request(app)
        .post('/api/app/credits/validate')
        .set('x-user-id', 'user-123')
        .send({ amount: 100 });
      expect(res.status).toBe(402);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/credits/'), expect.anything());
    });
  });

  describe('POST /grant-revenuecat', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .post('/api/app/credits/grant-revenuecat')
        .send({ productId: 'p1', transactionId: 't1' });
      expect(res.status).toBe(401);
    });

    it('should return 400 when productId or transactionId missing', async () => {
      const res = await request(app)
        .post('/api/app/credits/grant-revenuecat')
        .set('x-user-id', 'user-123')
        .send({ productId: 'p1' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('productId and transactionId are required');
    });

    it('should grant credits successfully', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { creditsGranted: 50 } }));
      const res = await request(app)
        .post('/api/app/credits/grant-revenuecat')
        .set('x-user-id', 'user-123')
        .send({ productId: 'p1', transactionId: 't1' });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/credits/grant-revenuecat'),
        expect.anything()
      );
    });

    it('should forward 409 for duplicate transaction', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Already processed' }, 409));
      const res = await request(app)
        .post('/api/app/credits/grant-revenuecat')
        .set('x-user-id', 'user-123')
        .send({ productId: 'p1', transactionId: 'dup' });
      expect(res.status).toBe(409);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/credits/grant-revenuecat'),
        expect.anything()
      );
    });
  });
});
