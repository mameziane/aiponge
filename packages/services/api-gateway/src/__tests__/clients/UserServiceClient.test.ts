import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  getServiceUrl: vi.fn().mockReturnValue('http://localhost:3003'),
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
    getServiceUrl: vi.fn().mockReturnValue('http://localhost:3003'),
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
    getServiceUrl: vi.fn(() => 'http://localhost:3003'),
    getServicePort: vi.fn(() => 3003),
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

import { UserServiceClient } from '../../clients/UserServiceClient';

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

describe('UserServiceClient', () => {
  let client: UserServiceClient;
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let mockReq: Request;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpClient = createMockHttpClient();
    mockReq = createMockRequest();
    client = new UserServiceClient(mockHttpClient as unknown as Parameters<typeof UserServiceClient.prototype.constructor>[0], mockReq);
  });

  describe('getProfile', () => {
    it('should fetch user profile', async () => {
      const mockProfile = { id: 'p1', userId: 'user-1', name: 'Test User' };
      mockHttpClient.get.mockResolvedValue({ success: true, data: mockProfile });

      const result = await client.getProfile('user-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/profiles/user-1'),
        expect.objectContaining({ headers: { 'x-correlation-id': 'test-correlation-id' } })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockProfile);
    });

    it('should handle null response', async () => {
      mockHttpClient.get.mockResolvedValue(null);
      const result = await client.getProfile('user-1');
      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Empty response from service',
      });
    });

    it('should handle error response', async () => {
      mockHttpClient.get.mockResolvedValue({ success: false, error: 'Profile not found' });
      const result = await client.getProfile('user-1');
      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Profile not found',
      });
    });

    it('should handle network error', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(client.getProfile('user-1')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('getProfileSummary', () => {
    it('should fetch profile summary and return raw response', async () => {
      const mockSummary = { totalEntries: 10, streakDays: 5 };
      mockHttpClient.get.mockResolvedValue(mockSummary);

      const result = await client.getProfileSummary('user-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/profiles/user-1/summary'),
        expect.any(Object)
      );
      expect(result).toEqual(mockSummary);
    });

    it('should handle network timeout', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Timeout'));
      await expect(client.getProfileSummary('user-1')).rejects.toThrow('Timeout');
    });
  });

  describe('getProfileThemes', () => {
    it('should fetch profile themes and return raw response', async () => {
      const mockThemes = { themes: ['growth', 'reflection'] };
      mockHttpClient.get.mockResolvedValue(mockThemes);

      const result = await client.getProfileThemes('user-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/profiles/user-1/themes'),
        expect.any(Object)
      );
      expect(result).toEqual(mockThemes);
    });
  });

  describe('getProfileMetrics', () => {
    it('should fetch profile metrics and return raw response', async () => {
      const mockMetrics = { activityLevel: 'high' };
      mockHttpClient.get.mockResolvedValue(mockMetrics);

      const result = await client.getProfileMetrics('user-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/profiles/user-1/metrics'),
        expect.any(Object)
      );
      expect(result).toEqual(mockMetrics);
    });
  });

  describe('getEntries', () => {
    it('should fetch user entries', async () => {
      const mockEntries = [{ id: 'e1', userId: 'user-1', content: 'Hello', createdAt: '2025-01-01' }];
      mockHttpClient.get.mockResolvedValue({ success: true, data: mockEntries });

      const result = await client.getEntries('user-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/entries/user-1'),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockEntries);
    });

    it('should include limit parameter', async () => {
      mockHttpClient.get.mockResolvedValue({ success: true, data: [] });

      await client.getEntries('user-1', 10);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/entries/user-1?limit=10'),
        expect.any(Object)
      );
    });

    it('should handle empty response', async () => {
      mockHttpClient.get.mockResolvedValue(null);
      const result = await client.getEntries('user-1');
      expect(result.success).toBe(false);
    });

    it('should handle 5xx error', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Internal Server Error'));
      await expect(client.getEntries('user-1')).rejects.toThrow('Internal Server Error');
    });
  });

  describe('getInsights', () => {
    it('should fetch user insights', async () => {
      const mockInsights = [{ id: 'i1', userId: 'user-1', type: 'mood', content: 'Happy', createdAt: '2025-01-01' }];
      mockHttpClient.get.mockResolvedValue({ success: true, data: mockInsights });

      const result = await client.getInsights('user-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/insights?userId=user-1'),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it('should include limit parameter', async () => {
      mockHttpClient.get.mockResolvedValue({ success: true, data: [] });
      await client.getInsights('user-1', 5);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/insights?userId=user-1&limit=5'),
        expect.any(Object)
      );
    });

    it('should handle error response', async () => {
      mockHttpClient.get.mockResolvedValue({ success: false, error: 'Unauthorized' });
      const result = await client.getInsights('user-1');
      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Unauthorized',
      });
    });
  });

  describe('getAnalytics', () => {
    it('should fetch user analytics', async () => {
      const mockAnalytics = { totalEntries: 50, totalInsights: 10, activityLevel: 'active' };
      mockHttpClient.get.mockResolvedValue({ success: true, data: mockAnalytics });

      const result = await client.getAnalytics('user-1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics?userId=user-1'),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAnalytics);
    });

    it('should handle null response', async () => {
      mockHttpClient.get.mockResolvedValue(null);
      const result = await client.getAnalytics('user-1');
      expect(result.success).toBe(false);
    });

    it('should handle connection refused', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(client.getAnalytics('user-1')).rejects.toThrow('ECONNREFUSED');
    });
  });
});
