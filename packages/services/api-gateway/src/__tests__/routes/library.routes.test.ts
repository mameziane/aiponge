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

vi.mock('../../presentation/middleware/ResponseCacheMiddleware', () => ({
  createResponseCacheMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  invalidateCachePattern: vi.fn().mockResolvedValue(undefined),
  CACHE_PRESETS: { explore: { ttlSeconds: 120 }, catalog: { ttlSeconds: 300 } },
}));

vi.mock('../../presentation/middleware/RateLimitMiddleware', () => ({
  rateLimitMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  LIBRARY_SOURCE: { SHARED: 'shared', PRIVATE: 'private' },
}));

function mockResponse(data: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Map([['content-type', 'application/json']]),
  };
}

describe('Library Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../presentation/routes/app/library.routes');
    app = express();
    app.use(express.json());
    app.use('/api/app/library', mod.default);
  });

  describe('GET /explore', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/app/library/explore');
      expect(res.status).toBe(401);
    });

    it('should return explore feed', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { sections: [] } }));
      const res = await request(app).get('/api/app/library/explore').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/explore'),
        expect.anything()
      );
    });

    it('should forward service errors', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Service unavailable' }, 503));
      const res = await request(app).get('/api/app/library/explore').set('x-user-id', 'user-123');
      expect(res.status).toBe(503);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/explore'),
        expect.anything()
      );
    });
  });

  describe('GET /shared', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/app/library/shared');
      expect(res.status).toBe(401);
    });

    it('should return shared library', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { tracks: [] } }));
      const res = await request(app).get('/api/app/library/shared').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/music/library'), expect.anything());
    });
  });

  describe('GET /private', () => {
    it('should return private library', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { tracks: [] } }));
      const res = await request(app).get('/api/app/library/private').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/music/library'), expect.anything());
    });
  });

  describe('GET /track/:trackId', () => {
    it('should return track details', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { id: 'track-1', title: 'Test' } }));
      const res = await request(app).get('/api/app/library/track/track-1');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/track/'),
        expect.anything()
      );
    });

    it('should forward 404 for non-existent track', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Track not found' }, 404));
      const res = await request(app).get('/api/app/library/track/nonexistent');
      expect(res.status).toBe(404);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/track/'),
        expect.anything()
      );
    });
  });

  describe('POST /track-play', () => {
    it('should record track play', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      const res = await request(app)
        .post('/api/app/library/track-play')
        .set('x-user-id', 'user-123')
        .send({ trackId: 'track-1' });
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/track-play'),
        expect.anything()
      );
    });
  });

  describe('POST /track/:trackId/like', () => {
    it('should like a track', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      const res = await request(app).post('/api/app/library/track/track-1/like').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/track/'),
        expect.anything()
      );
    });
  });

  describe('DELETE /track/:trackId/like', () => {
    it('should unlike a track', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      const res = await request(app).delete('/api/app/library/track/track-1/like').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/track/'),
        expect.anything()
      );
    });
  });

  describe('GET /liked-tracks', () => {
    it('should return liked tracks', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { trackIds: [] } }));
      const res = await request(app).get('/api/app/library/liked-tracks').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/liked-tracks'),
        expect.anything()
      );
    });
  });

  describe('GET /albums', () => {
    it('should return user albums', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { albums: [] } }));
      const res = await request(app).get('/api/app/library/albums').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/albums'), expect.anything());
    });
  });

  describe('GET /albums/:albumId', () => {
    it('should return album details', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ success: true, data: { id: 'album-1', tracks: [] } }));
      const res = await request(app).get('/api/app/library/albums/album-1').set('x-user-id', 'user-123');
      expect(res.status).toBe(200);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/albums/'), expect.anything());
    });

    it('should forward 404 for non-existent album', async () => {
      mockGatewayFetch.mockResolvedValueOnce(mockResponse({ message: 'Album not found' }, 404));
      const res = await request(app).get('/api/app/library/albums/nonexistent').set('x-user-id', 'user-123');
      expect(res.status).toBe(404);
      expect(mockGatewayFetch).toHaveBeenCalledWith(expect.stringContaining('/api/library/albums/'), expect.anything());
    });
  });

  describe('Network errors', () => {
    it('should handle downstream service failure', async () => {
      mockGatewayFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await request(app).get('/api/app/library/explore').set('x-user-id', 'user-123');
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(mockGatewayFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/library/explore'),
        expect.anything()
      );
    });
  });
});
