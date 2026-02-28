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
    getValidation: () => ({ validateBody: () => (_req: Request, _res: Response, next: NextFunction) => next(), validateQuery: () => (_req: Request, _res: Response, next: NextFunction) => next() }),
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

vi.mock('../../presentation/utils/response-helpers', () => ({
  ServiceErrors: {
    fromException: vi.fn((res: Response, _error: unknown, message: string) => {
      res.status(502).json({ success: false, message });
    }),
  },
}));

vi.mock('@aiponge/shared-contracts', () => ({
  CreateEntrySchema: {},
  UpdateEntrySchema: {},
  BatchAnalyzeSchema: {},
  PaginationSchema: {},
  AddEntryImageSchema: {},
  ReorderEntryImagesSchema: {},
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Entries Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/entries.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/entries', mod.default);
  });

  describe('GET /', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/app/entries');
      expect(res.status).toBe(401);
    });

    it('should return user entries', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: {
            entries: [{ id: 'e1', content: 'Test', userId: 'user-123' }],
            pagination: { total: 1, hasMore: false },
          },
        })
      );
      const res = await request(app)
        .get('/api/app/entries')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });

    it('should forward service errors', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Database error' }, 500)
      );
      const res = await request(app)
        .get('/api/app/entries')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });
  });

  describe('GET /:entryId', () => {
    it('should return a specific entry', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: { entry: { id: 'e1', content: 'Test', userId: 'user-123' } },
        })
      );
      const res = await request(app)
        .get('/api/app/entries/e1')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/id/'), expect.anything());
    });

    it('should return 404 for non-existent entry', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Entry not found' }, 404)
      );
      const res = await request(app)
        .get('/api/app/entries/nonexistent')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(404);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/id/'), expect.anything());
    });
  });

  describe('POST /', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .post('/api/app/entries')
        .send({ content: 'Test' });
      expect(res.status).toBe(401);
    });

    it('should create an entry', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: { entry: { id: 'new', content: 'New', userId: 'user-123' } },
        }, 201)
      );
      const res = await request(app)
        .post('/api/app/entries')
        .set('x-user-id', 'user-123')
        .send({ content: 'New entry' });
      expect(res.status).toBe(201);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries'), expect.anything());
    });

    it('should forward 400 for validation errors', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: false,
          error: { message: 'Content is required', code: 'VALIDATION_ERROR' },
        }, 400)
      );
      const res = await request(app)
        .post('/api/app/entries')
        .set('x-user-id', 'user-123')
        .send({});
      expect(res.status).toBe(400);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries'), expect.anything());
    });
  });

  describe('PATCH /:id', () => {
    it('should update an entry (ownership check + update)', async () => {
      mockGatewayFetch
        .mockResolvedValueOnce(
          mockResponse({
            success: true,
            data: { entry: { id: 'e1', content: 'Old', userId: 'user-123' } },
          })
        )
        .mockResolvedValueOnce(
          mockResponse({
            success: true,
            data: { entry: { id: 'e1', content: 'Updated', userId: 'user-123' } },
          })
        );
      const res = await request(app)
        .patch('/api/app/entries/e1')
        .set('x-user-id', 'user-123')
        .send({ content: 'Updated' });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });

    it('should return 404 when entry not found', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Not found' }, 404)
      );
      const res = await request(app)
        .patch('/api/app/entries/nonexistent')
        .set('x-user-id', 'user-123')
        .send({ content: 'Updated' });
      expect(res.status).toBe(404);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });

    it('should return 403 when updating another users entry', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: { entry: { id: 'e1', content: 'Content', userId: 'other-user' } },
        })
      );
      const res = await request(app)
        .patch('/api/app/entries/e1')
        .set('x-user-id', 'user-123')
        .send({ content: 'Hacked' });
      expect(res.status).toBe(403);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });
  });

  describe('DELETE /:id', () => {
    it('should delete an entry (ownership check + delete)', async () => {
      mockGatewayFetch
        .mockResolvedValueOnce(
          mockResponse({
            success: true,
            data: { entry: { id: 'e1', content: 'Content', userId: 'user-123' } },
          })
        )
        .mockResolvedValueOnce(
          mockResponse({ success: true })
        );
      const res = await request(app)
        .delete('/api/app/entries/e1')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });

    it('should return 404 when entry not found for delete', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Not found' }, 404)
      );
      const res = await request(app)
        .delete('/api/app/entries/nonexistent')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(404);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });

    it('should return 403 when deleting another users entry', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: { entry: { id: 'e1', content: 'Content', userId: 'other-user' } },
        })
      );
      const res = await request(app)
        .delete('/api/app/entries/e1')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(403);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/'), expect.anything());
    });
  });

  describe('GET /:entryId/images', () => {
    it('should return entry images', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: { images: [{ id: 'img1', url: 'https://example.com/img.jpg' }] },
        })
      );
      const res = await request(app)
        .get('/api/app/entries/e1/images')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/e1/illustrations'), expect.anything());
    });
  });

  describe('POST /:entryId/images', () => {
    it('should add image to entry', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: { image: { id: 'img1', url: 'https://example.com/new.jpg' } },
        }, 201)
      );
      const res = await request(app)
        .post('/api/app/entries/e1/images')
        .set('x-user-id', 'user-123')
        .send({ url: 'https://example.com/new.jpg' });
      expect(res.status).toBe(201);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/e1/illustrations'), expect.anything());
    });
  });
});
