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
  injectOptionalUserId: (req: Request, _res: Response, next: NextFunction) => {
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

describe('Lyrics Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/lyrics.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/lyrics', mod.default);
  });

  describe('POST / (create lyrics)', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .post('/api/app/lyrics')
        .send({ content: 'test content' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should create lyrics successfully', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'lyrics-1', content: 'Generated lyrics' } })
      );
      const res = await request(app)
        .post('/api/app/lyrics')
        .set('x-user-id', 'user-123')
        .send({ content: 'My journal entry text' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics'), expect.anything());
    });

    it('should forward service error on failure', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'AI service unavailable' }, 503)
      );
      const res = await request(app)
        .post('/api/app/lyrics')
        .set('x-user-id', 'user-123')
        .send({ content: 'My journal entry text' });
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics'), expect.anything());
    });
  });

  describe('GET /id/:lyricsId (get lyrics by ID)', () => {
    it('should allow guest access (no auth required)', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'lyrics-1', content: 'Some lyrics' }, source: 'shared' })
      );
      const res = await request(app).get('/api/app/lyrics/id/lyrics-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/'), expect.anything());
    });

    it('should return lyrics for authenticated user', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'lyrics-1', content: 'Some lyrics' }, source: 'own' })
      );
      const res = await request(app)
        .get('/api/app/lyrics/id/lyrics-1')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/'), expect.anything());
    });

    it('should forward 404 when lyrics not found', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Lyrics not found' }, 404)
      );
      const res = await request(app).get('/api/app/lyrics/id/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/'), expect.anything());
    });

    it('should pass type query parameter', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'lyrics-1' } })
      );
      await request(app).get('/api/app/lyrics/id/lyrics-1?type=shared');
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('?visibility=shared'),
        expect.any(Object)
      );
    });
  });

  describe('GET /entry/:entryId (get lyrics by entry ID)', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/app/lyrics/entry/entry-1');
      expect(res.status).toBe(401);
    });

    it('should return lyrics for entry', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, data: { id: 'lyrics-1', entryId: 'entry-1' } })
      );
      const res = await request(app)
        .get('/api/app/lyrics/entry/entry-1')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/entry/'), expect.anything());
    });

    it('should forward 404 when entry has no lyrics', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'No lyrics found for entry' }, 404)
      );
      const res = await request(app)
        .get('/api/app/lyrics/entry/entry-no-lyrics')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/entry/'), expect.anything());
    });
  });

  describe('DELETE /:lyricsId', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).delete('/api/app/lyrics/lyrics-1');
      expect(res.status).toBe(401);
    });

    it('should delete lyrics successfully', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: true, message: 'Lyrics deleted' })
      );
      const res = await request(app)
        .delete('/api/app/lyrics/lyrics-1')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/'), expect.anything());
    });

    it('should forward 404 when lyrics not found', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Lyrics not found' }, 404)
      );
      const res = await request(app)
        .delete('/api/app/lyrics/nonexistent')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/'), expect.anything());
    });

    it('should forward 500 on service error', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Internal error' }, 500)
      );
      const res = await request(app)
        .delete('/api/app/lyrics/lyrics-1')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/lyrics/'), expect.anything());
    });
  });
});
