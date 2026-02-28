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
  MusicGenerateSchema: {},
  GenerateLyricsSchema: {},
  USER_ROLES: { MEMBER: 'member', ADMIN: 'admin', LIBRARIAN: 'librarian' },
  isPrivilegedRole: (role: string) => role === 'admin' || role === 'librarian',
  normalizeRole: (role: string) => (role || 'member').toLowerCase(),
  CONTENT_LIMITS: { MAX_TRACKS_PER_ALBUM: 20 },
  sendStructuredError: vi.fn((res: Response, status: number, error: unknown) => {
    res.status(status).json(error);
  }),
  createStructuredError: vi.fn((...args: unknown[]) => ({ code: args[0], type: args[1], message: args[2] })),
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Librarian Content Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/librarian-content.routes');
    app = express();
    app.use(express.json());
    app.use('/api/v1/librarian', mod.librarianContentRoutes);
  });

  describe('GET /config/defaults', () => {
    it('should return 200 with config defaults', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { theme: 'default', language: 'en' } })
      );

      const res = await request(app)
        .get('/api/v1/librarian/config/defaults')
        .set('x-user-id', 'librarian-123')
        .set('x-user-role', 'librarian');

      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/config/librarian-defaults'), expect.anything());
    });
  });

  describe('GET /templates', () => {
    it('should return 200 with templates list', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: [{ id: 'tpl-1', name: 'Template 1' }] })
      );

      const res = await request(app)
        .get('/api/v1/librarian/templates')
        .set('x-user-id', 'librarian-123')
        .set('x-user-role', 'librarian');

      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/templates'), expect.anything());
    });
  });

  describe('GET /books', () => {
    it('should return 200 with books list', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: [{ id: 'book-1', title: 'Book 1' }] })
      );

      const res = await request(app)
        .get('/api/v1/librarian/books')
        .set('x-user-id', 'librarian-123')
        .set('x-user-role', 'librarian');

      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/books'), expect.anything());
    });
  });

  describe('POST /templates', () => {
    it('should create a template and return 200', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'tpl-new', name: 'New Template' } })
      );

      const res = await request(app)
        .post('/api/v1/librarian/templates')
        .set('x-user-id', 'librarian-123')
        .set('x-user-role', 'librarian')
        .send({ name: 'New Template', content: 'template content' });

      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/templates'), expect.anything());
    });
  });
});
