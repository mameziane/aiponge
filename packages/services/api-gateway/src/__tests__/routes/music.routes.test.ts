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

vi.mock('@aiponge/platform-core', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    ServiceLocator: {
      getServiceUrl: vi.fn(() => 'http://localhost:3020'),
      getServicePort: vi.fn(() => 3020),
    },
    serializeError: vi.fn((e: unknown) => String(e)),
    getValidation: () => ({
      validateBody: () => (_req: Request, _res: Response, next: NextFunction) => next(),
      validateQuery: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    }),
  };
});

vi.mock('@services/gatewayFetch', () => ({
  gatewayFetch: mockGatewayFetch,
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../config/GatewayConfig', () => ({
  HttpConfig: { defaults: { timeout: 5000, retries: 0 } },
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
  sendSuccess: vi.fn((res: Response, data: unknown) => {
    res.json({ success: true, data });
  }),
  sendCreated: vi.fn((res: Response, data: unknown) => {
    res.status(201).json({ success: true, data });
  }),
  forwardServiceError: vi.fn(),
  extractErrorInfo: vi.fn(() => ({})),
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
  ServiceErrors: {
    fromException: vi.fn((res: Response, _error: unknown, message: string) => {
      res.status(502).json({ success: false, message });
    }),
    badRequest: vi.fn((res: Response, message: string) => {
      res.status(400).json({ success: false, message });
    }),
    unauthorized: vi.fn((res: Response, message: string) => {
      res.status(401).json({ success: false, message });
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
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('@aiponge/shared-contracts', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    MusicGenerateSchema: {},
    GenerateLyricsSchema: {},
    USER_ROLES: { MEMBER: 'member', ADMIN: 'admin', LIBRARIAN: 'librarian' },
    isPrivilegedRole: (role: string) => role === 'admin' || role === 'librarian',
    normalizeRole: (role: string) => (role || 'member').toLowerCase(),
    CONTENT_LIMITS: { MAX_TRACKS_PER_ALBUM: 20 },
  };
});

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Music Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGatewayFetch.mockReset();
    const mod = await import('../../presentation/routes/app/music.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/music', mod.default);
  });

  describe('POST /generate', () => {
    it('should return 401 when no user ID', async () => {
      const res = await request(app).post('/api/app/music/generate').send({ entryContent: 'test' });
      expect(res.status).toBe(401);
    });

    it('should generate music for authenticated user (happy path)', async () => {
      const musicResp = mockResponse({
        success: true,
        data: { trackId: 'track-123', title: 'Test Song' },
      });

      mockGatewayFetch.mockResolvedValueOnce(musicResp);

      const res = await request(app)
        .post('/api/app/music/generate')
        .set('x-user-id', 'user-123')
        .set('x-request-id', 'req-123')
        .send({ entryContent: 'test content', genres: ['pop'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Route now proxies directly to music-service (quota checking handled by music-service)
      expect(mockGatewayFetch).toHaveBeenCalledTimes(1);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/generate-track'),
        expect.anything()
      );
    });

    it('should forward quota exceeded error from music-service', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse(
          {
            success: false,
            message: 'Monthly limit reached',
          },
          403
        )
      );

      const res = await request(app)
        .post('/api/app/music/generate')
        .set('x-user-id', 'user-123')
        .send({ entryContent: 'test' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should skip quota check for privileged roles', async () => {
      const musicResp = mockResponse({
        success: true,
        data: { trackId: 'track-456' },
      });

      mockGatewayFetch.mockResolvedValueOnce(musicResp);

      const res = await request(app)
        .post('/api/app/music/generate')
        .set('x-user-id', 'admin-user')
        .set('x-user-role', 'admin')
        .send({ entryContent: 'test' });

      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/library/generate-track'),
        expect.anything()
      );
    });
  });

  describe('POST /generate-album', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .post('/api/app/music/generate-album')
        .send({ entries: [{ content: 'test' }] });
      expect(res.status).toBe(401);
    });

    it('should proxy album generation to music-service for regular user', async () => {
      const albumResp = mockResponse({ success: true, data: { albumId: 'album-1' } });
      mockGatewayFetch.mockResolvedValueOnce(albumResp);

      const res = await request(app)
        .post('/api/app/music/generate-album')
        .set('x-user-id', 'user-123')
        .send({ entries: [{ content: 'test' }] });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/generate-album'),
        expect.anything()
      );
    });

    it('should proxy album generation to library endpoint for privileged user', async () => {
      const albumResp = mockResponse({ success: true, data: { albumId: 'album-2' } });
      mockGatewayFetch.mockResolvedValueOnce(albumResp);

      const res = await request(app)
        .post('/api/app/music/generate-album')
        .set('x-user-id', 'admin-123')
        .set('x-user-role', 'admin')
        .send({ entries: [{ content: 'test' }] });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/library/generate-album'),
        expect.anything()
      );
    });

    it('should forward validation errors from music-service', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: false, message: 'No entries provided' }, 400));

      const res = await request(app)
        .post('/api/app/music/generate-album')
        .set('x-user-id', 'user-123')
        .send({ entries: [] });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should forward permission errors from music-service', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({ success: false, message: 'Multi-language not allowed' }, 403)
      );

      const res = await request(app)
        .post('/api/app/music/generate-album')
        .set('x-user-id', 'user-123')
        .set('x-user-role', 'member')
        .send({ entries: [{ content: 'test' }], languageMode: 'all' });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /tracks/batch', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .patch('/api/app/music/tracks/batch')
        .send({ trackIds: ['t1'] });
      expect(res.status).toBe(401);
    });

    it('should proxy batch update', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { updated: 1 } }));
      const res = await request(app)
        .patch('/api/app/music/tracks/batch')
        .set('x-user-id', 'user-123')
        .send({ trackIds: ['t1'], visibility: 'private' });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/library/tracks/batch'),
        expect.anything()
      );
    });
  });

  describe('POST /favorites/batch', () => {
    it('should proxy batch favorites', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      const res = await request(app)
        .post('/api/app/music/favorites/batch')
        .set('x-user-id', 'user-123')
        .send({ trackIds: ['t1', 't2'] });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/library/favorites/batch'),
        expect.anything()
      );
    });
  });
});
