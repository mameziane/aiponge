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

vi.mock('../../presentation/middleware/ResponseCacheMiddleware', () => ({
  createResponseCacheMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('@aiponge/shared-contracts/api/input-schemas', () => ({
  CreatePlaylistSchema: {},
  UpdatePlaylistSchema: {},
  AddToPlaylistSchema: {},
  GeneratePlaylistArtworkSchema: {},
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Playlists Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/playlists.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/playlists', mod.default);
  });

  describe('GET /user/:userId', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/app/playlists/user/user-123');
      expect(res.status).toBe(401);
    });

    it('should return user playlists', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { playlists: [] } }));
      const res = await request(app).get('/api/app/playlists/user/user-123').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/playlists/user/'), expect.anything());
    });

    it('should forward service error', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ error: 'Service error' }, 500));
      const res = await request(app).get('/api/app/playlists/user/user-123').set('x-user-id', 'user-123');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/playlists/user/'), expect.anything());
    });
  });

  describe('GET /:playlistId/tracks', () => {
    it('should return playlist tracks', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { tracks: [] } }));
      const res = await request(app).get('/api/app/playlists/pl-1/tracks').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/pl-1/tracks'),
        expect.anything()
      );
    });

    it('should forward 404 for non-existent playlist', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Playlist not found' }, 404));
      const res = await request(app).get('/api/app/playlists/nonexistent/tracks').set('x-user-id', 'user-123');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/nonexistent/tracks'),
        expect.anything()
      );
    });
  });

  describe('POST /:playlistId/generate-artwork', () => {
    it('should generate artwork successfully', async () => {
      mockGatewayFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: { artworkUrl: 'https://example.com/art.jpg', revisedPrompt: 'prompt' },
        })
      );
      const res = await request(app)
        .post('/api/app/playlists/pl-1/generate-artwork')
        .set('x-user-id', 'user-123')
        .send({ style: 'abstract' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.artworkUrl).toBe('https://example.com/art.jpg');
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/pl-1/generate-artwork'),
        expect.anything()
      );
    });

    it('should forward artwork generation failure', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ error: 'Generation failed' }, 500));
      const res = await request(app)
        .post('/api/app/playlists/pl-1/generate-artwork')
        .set('x-user-id', 'user-123')
        .send({ style: 'abstract' });
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/pl-1/generate-artwork'),
        expect.anything()
      );
    });
  });

  describe('POST /:playlistId/tracks', () => {
    it('should add track to playlist', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      const res = await request(app)
        .post('/api/app/playlists/pl-1/tracks')
        .set('x-user-id', 'user-123')
        .send({ trackId: 'track-1' });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/pl-1/tracks'),
        expect.anything()
      );
    });

    it('should forward 409 for duplicate track', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Already in playlist' }, 409));
      const res = await request(app)
        .post('/api/app/playlists/pl-1/tracks')
        .set('x-user-id', 'user-123')
        .send({ trackId: 'track-1' });
      expect(res.status).toBe(409);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/pl-1/tracks'),
        expect.anything()
      );
    });
  });

  describe('Smart playlist tracks (with error handling)', () => {
    it('should handle fetch errors from downstream', async () => {
      mockGatewayFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await request(app)
        .get('/api/app/playlists/smart/user-123/recently-played/tracks')
        .set('x-user-id', 'user-123');
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/smart/'),
        expect.anything()
      );
    });

    it('should return smart playlist tracks', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { tracks: [] } }));
      const res = await request(app)
        .get('/api/app/playlists/smart/user-123/recently-played/tracks')
        .set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists/smart/'),
        expect.anything()
      );
    });
  });
});
