import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  getServiceUrl: vi.fn().mockReturnValue('http://localhost:3007'),
  getServicePort: vi.fn().mockReturnValue(8080),
  serializeError: vi.fn().mockReturnValue({ message: 'error' }),
  withServiceResilience: vi.fn().mockImplementation((_service: string, _op: string, fn: () => Promise<unknown>) => fn()),
  DomainError: class DomainError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  ServiceLocator: {
    getServiceUrl: vi.fn().mockReturnValue('http://localhost:3007'),
    getServicePort: vi.fn().mockReturnValue(8080),
    getValidatedServicePort: vi.fn().mockReturnValue(8080),
  },
  createHttpClient: vi.fn(),
  timeoutHierarchy: {
    getGatewayTimeout: vi.fn().mockReturnValue(5000),
    getServiceTimeout: vi.fn().mockReturnValue(5000),
  },
  createServiceUrlsConfig: vi.fn(() => ({
    SERVICE_URLS: {},
    SERVICE_PORTS: {},
    getServiceUrl: vi.fn(() => 'http://localhost:3007'),
    getServicePort: vi.fn(() => 3007),
    getOwnPort: vi.fn(() => 8080),
    createServiceHttpClient: vi.fn(),
    getHttpConfig: vi.fn(() => ({ timeout: 5000, retries: 0 })),
  })),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock('../../presentation/middleware/correlationMiddleware', () => ({
  getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
}));

import { MusicServiceClient } from '../../clients/MusicServiceClient';

function createMockHttpClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockRequest() {
  return {
    headers: { 'x-correlation-id': 'test-correlation-id' },
  } as unknown as Request;
}

describe('MusicServiceClient', () => {
  let client: MusicServiceClient;
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let mockReq: Request;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpClient = createMockHttpClient();
    mockReq = createMockRequest();
    client = new MusicServiceClient(mockHttpClient as unknown as Parameters<typeof MusicServiceClient.prototype.constructor>[0], mockReq);
  });

  describe('getRecentMusic', () => {
    it('should fetch recent music for a user', async () => {
      const mockTracks = [
        { id: '1', title: 'Track 1', createdAt: '2025-01-01' },
        { id: '2', title: 'Track 2', createdAt: '2025-01-02' },
      ];
      mockHttpClient.get.mockResolvedValue({ success: true, data: mockTracks });

      const result = await client.getRecentMusic('user-123');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/recent?userId=user-123'),
        expect.objectContaining({ headers: { 'x-correlation-id': 'test-correlation-id' } })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTracks);
    });

    it('should include limit parameter when provided', async () => {
      mockHttpClient.get.mockResolvedValue({ success: true, data: [] });

      await client.getRecentMusic('user-123', 5);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/recent?userId=user-123&limit=5'),
        expect.any(Object)
      );
    });

    it('should handle empty response', async () => {
      mockHttpClient.get.mockResolvedValue(null);

      const result = await client.getRecentMusic('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Empty response from service',
      });
    });

    it('should handle error response from service', async () => {
      mockHttpClient.get.mockResolvedValue({ success: false, error: 'User not found' });

      const result = await client.getRecentMusic('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'User not found',
      });
    });

    it('should handle network timeout', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Request timeout'));

      await expect(client.getRecentMusic('user-123')).rejects.toThrow('Request timeout');
    });

    it('should handle connection refused', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(client.getRecentMusic('user-123')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('getTrackById', () => {
    it('should fetch a track by ID', async () => {
      const mockTrack = { id: 'track-1', title: 'My Track', genre: 'Pop', createdAt: '2025-01-01' };
      mockHttpClient.get.mockResolvedValue({ success: true, data: mockTrack });

      const result = await client.getTrackById('track-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/track-1'),
        expect.objectContaining({ headers: { 'x-correlation-id': 'test-correlation-id' } })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTrack);
    });

    it('should handle null response', async () => {
      mockHttpClient.get.mockResolvedValue(null);

      const result = await client.getTrackById('track-1');

      expect(result.success).toBe(false);
    });

    it('should handle error response with message field', async () => {
      mockHttpClient.get.mockResolvedValue({ success: false, message: 'Track not found' });

      const result = await client.getTrackById('track-1');

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Track not found',
      });
    });

    it('should handle network error', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getTrackById('track-1')).rejects.toThrow('Network error');
    });

    it('should wrap plain object responses as success', async () => {
      const mockTrack = { id: 'track-1', title: 'My Track', createdAt: '2025-01-01' };
      mockHttpClient.get.mockResolvedValue(mockTrack);

      const result = await client.getTrackById('track-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTrack);
    });

    it('should handle error-only response without success field', async () => {
      mockHttpClient.get.mockResolvedValue({ error: 'Internal server error' });

      const result = await client.getTrackById('track-1');

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    });
  });
});
