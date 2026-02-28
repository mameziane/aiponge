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
  injectOptionalUserId: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../presentation/middleware/ResponseCacheMiddleware', () => ({
  createResponseCacheMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('@aiponge/shared-contracts/api/input-schemas', () => ({
  CreateBookGenerationSchema: {},
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Books Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/books.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/books/generate', mod.booksGenerateRouter);
    app.use('/api/app/library/user', mod.savedLibraryRouter);
    app.use('/api/app/library/books', mod.libraryBooksRouter);
    app.use('/api/app/library', mod.contentLibraryRouter);
  });

  describe('Book Generation', () => {
    describe('GET /api/app/books/generate/access', () => {
      it('should return 401 when not authenticated', async () => {
        const res = await request(app).get('/api/app/books/generate/access');
        expect(res.status).toBe(401);
      });

      it('should check access', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ success: true, data: { hasAccess: true } })
        );
        const res = await request(app)
          .get('/api/app/books/generate/access')
          .set('x-user-id', 'user-123');
        expect(res.status).toBe(200);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/books/generation/access'), expect.anything());
      });

      it('should forward 403 for access denied', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ error: 'Paid tier feature' }, 403)
        );
        const res = await request(app)
          .get('/api/app/books/generate/access')
          .set('x-user-id', 'user-123');
        expect(res.status).toBe(403);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/books/generation/access'), expect.anything());
      });
    });

    describe('POST /api/app/books/generate', () => {
      it('should generate a book', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ success: true, data: { requestId: 'gen-123' } })
        );
        const res = await request(app)
          .post('/api/app/books/generate')
          .set('x-user-id', 'user-123')
          .send({ title: 'My Book' });
        expect(res.status).toBe(201);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/books/generation'), expect.anything());
      });

      it('should forward 402 for insufficient credits', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ error: 'Insufficient credits' }, 402)
        );
        const res = await request(app)
          .post('/api/app/books/generate')
          .set('x-user-id', 'user-123')
          .send({ title: 'My Book' });
        expect(res.status).toBe(402);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/books/generation'), expect.anything());
      });
    });

    describe('GET /api/app/books/generate/:requestId', () => {
      it('should return generation status', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ success: true, data: { requestId: 'gen-123', status: 'completed' } })
        );
        const res = await request(app)
          .get('/api/app/books/generate/gen-123')
          .set('x-user-id', 'user-123');
        expect(res.status).toBe(200);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/books/generation/'), expect.anything());
      });

      it('should forward 404 for non-existent request', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ error: 'Not found' }, 404)
        );
        const res = await request(app)
          .get('/api/app/books/generate/nonexistent')
          .set('x-user-id', 'user-123');
        expect(res.status).toBe(404);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/books/generation/'), expect.anything());
      });
    });
  });

  describe('Saved Library', () => {
    describe('GET /api/app/library/user', () => {
      it('should return 401 when not authenticated', async () => {
        const res = await request(app).get('/api/app/library/user');
        expect(res.status).toBe(401);
      });

      it('should return user library', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ success: true, data: { books: [] } })
        );
        const res = await request(app)
          .get('/api/app/library/user')
          .set('x-user-id', 'user-123');
        expect(res.status).toBe(200);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/saved'), expect.anything());
      });
    });
  });

  describe('Content Library', () => {
    describe('GET /api/app/library/book-types', () => {
      it('should return book types', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ success: true, data: [{ id: 't1', name: 'Journal' }] })
        );
        const res = await request(app)
          .get('/api/app/library/book-types')
          .set('x-user-id', 'user-123');
        expect(res.status).toBe(200);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/book-types'), expect.anything());
      });
    });

    describe('POST /api/app/library/chapters', () => {
      it('should create chapter', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ success: true, data: { id: 'ch1' } })
        );
        const res = await request(app)
          .post('/api/app/library/chapters')
          .set('x-user-id', 'user-123')
          .send({ title: 'Chapter 1', bookId: 'book-1' });
        expect(res.status).toBe(200);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/chapters'), expect.anything());
      });
    });

    describe('POST /api/app/library/entries', () => {
      it('should create library entry', async () => {
        mockGatewayFetch.mockResolvedValueOnce(
          mockResponse({ success: true, data: { id: 'e1' } })
        );
        const res = await request(app)
          .post('/api/app/library/entries')
          .set('x-user-id', 'user-123')
          .send({ content: 'Hello', chapterId: 'ch1' });
        expect(res.status).toBe(200);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/entries'), expect.anything());
      });
    });

    describe('Network errors', () => {
      it('should handle downstream errors', async () => {
        mockGatewayFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const res = await request(app)
          .get('/api/app/library/book-types')
          .set('x-user-id', 'user-123');
        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/book-types'), expect.anything());
      });
    });
  });
});
