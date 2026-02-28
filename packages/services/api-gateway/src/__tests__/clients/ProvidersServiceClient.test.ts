import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));

const mockHttpClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  ServiceLocator: {
    getServiceUrl: vi.fn().mockReturnValue('http://localhost:3004'),
    getServicePort: vi.fn().mockReturnValue(3004),
  },
  withServiceResilience: vi.fn((_service: string, _op: string, fn: () => unknown) => fn()),
  createHttpClient: () => mockHttpClient,
  createServiceUrlsConfig: vi.fn(() => ({
    SERVICE_URLS: {},
    SERVICE_PORTS: {},
    getServiceUrl: vi.fn(() => 'http://localhost:3004'),
    getServicePort: vi.fn(() => 3004),
    getOwnPort: vi.fn(() => 8080),
    createServiceHttpClient: vi.fn(() => mockHttpClient),
    getHttpConfig: vi.fn(() => ({ timeout: 5000, retries: 0 })),
  })),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

import { ProvidersServiceClient } from '../../clients/ProvidersServiceClient';

describe('ProvidersServiceClient', () => {
  let client: ProvidersServiceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ProvidersServiceClient({ timeout: 5000, retries: 1 });
  });

  describe('invokeProvider', () => {
    it('should invoke a provider', async () => {
      const mockResponse = { success: true, data: { result: 'generated' } };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await client.invokeProvider({
        operation: 'generate',
        provider: 'openai',
        data: { prompt: 'Hello' },
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/invoke'),
        expect.objectContaining({ operation: 'generate' }),
        undefined
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle provider invocation error', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Provider timeout'));
      await expect(
        client.invokeProvider({ operation: 'generate', data: {} })
      ).rejects.toThrow('Provider timeout');
    });
  });

  describe('selectProvider', () => {
    it('should select a provider', async () => {
      const mockSelection = { selectedProvider: 'openai', reason: 'Lowest latency' };
      mockHttpClient.post.mockResolvedValue(mockSelection);

      const result = await client.selectProvider({
        capability: 'text-generation',
        strategy: 'least_latency',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/select'),
        expect.objectContaining({ capability: 'text-generation' })
      );
      expect(result).toEqual(mockSelection);
    });
  });

  describe('getProviderHealth', () => {
    it('should fetch provider health', async () => {
      const mockHealth = [{ id: 'p1', name: 'OpenAI', status: 'healthy', latency: 50 }];
      mockHttpClient.get.mockResolvedValue(mockHealth);

      const result = await client.getProviderHealth();

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/health')
      );
      expect(result).toEqual(mockHealth);
    });

    it('should handle service unavailable', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Service unavailable'));
      await expect(client.getProviderHealth()).rejects.toThrow('Service unavailable');
    });
  });

  describe('getProviderHealthById', () => {
    it('should fetch health for a specific provider', async () => {
      const mockHealth = { id: 'p1', name: 'OpenAI', status: 'healthy', latency: 50 };
      mockHttpClient.get.mockResolvedValue(mockHealth);

      const result = await client.getProviderHealthById('p1');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/health/p1')
      );
      expect(result).toEqual(mockHealth);
    });

    it('should return null when provider not found (404)', async () => {
      const error = new Error('Not found') as Error & { status?: number };
      error.status = 404;
      mockHttpClient.get.mockRejectedValue(error);

      const result = await client.getProviderHealthById('unknown');
      expect(result).toBeNull();
    });

    it('should rethrow non-404 errors', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Server error'));
      await expect(client.getProviderHealthById('p1')).rejects.toThrow('Server error');
    });
  });

  describe('testProvider', () => {
    it('should test a provider', async () => {
      const mockResult = { success: true, latencyMs: 100 };
      mockHttpClient.post.mockResolvedValue(mockResult);

      const result = await client.testProvider('p1', { prompt: 'test' });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/test/p1'),
        { testPayload: { prompt: 'test' } }
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getProvidersByCapability', () => {
    it('should fetch providers by capability', async () => {
      const mockProviders = [
        { id: 'p1', name: 'OpenAI', status: 'active', performance: { averageLatencyMs: 50, successRate: 0.99 } },
      ];
      mockHttpClient.get.mockResolvedValue(mockProviders);

      const result = await client.getProvidersByCapability('text-generation');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/capability/text-generation')
      );
      expect(result).toEqual(mockProviders);
    });
  });

  describe('configureLoadBalancing', () => {
    it('should configure load balancing', async () => {
      mockHttpClient.post.mockResolvedValue({});

      await client.configureLoadBalancing({ type: 'round_robin' });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/load-balancing'),
        { type: 'round_robin' }
      );
    });
  });

  describe('getLoadBalancingConfig', () => {
    it('should fetch load balancing config', async () => {
      const mockConfig = { type: 'least_latency' };
      mockHttpClient.get.mockResolvedValue(mockConfig);

      const result = await client.getLoadBalancingConfig();

      expect(result).toEqual(mockConfig);
    });
  });

  describe('getUsageStatistics', () => {
    it('should fetch usage stats without time range', async () => {
      const mockStats = { totalRequests: 1000, providerBreakdown: {}, operationBreakdown: {} };
      mockHttpClient.get.mockResolvedValue(mockStats);

      const result = await client.getUsageStatistics();

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/usage')
      );
      expect(result).toEqual(mockStats);
    });

    it('should include time range parameter', async () => {
      mockHttpClient.get.mockResolvedValue({ totalRequests: 0, providerBreakdown: {}, operationBreakdown: {} });

      await client.getUsageStatistics(60);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/usage?timeRange=60')
      );
    });
  });

  describe('configureProvider', () => {
    it('should configure a provider', async () => {
      mockHttpClient.post.mockResolvedValue({});

      await client.configureProvider({
        id: 'p1',
        name: 'OpenAI',
        type: 'llm',
        endpoint: 'https://api.openai.com',
        capabilities: ['text-generation'],
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configure'),
        expect.objectContaining({ id: 'p1', name: 'OpenAI' })
      );
    });
  });

  describe('removeProvider', () => {
    it('should remove a provider and return true', async () => {
      mockHttpClient.delete.mockResolvedValue({});

      const result = await client.removeProvider('p1');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/p1')
      );
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockHttpClient.delete.mockRejectedValue(new Error('Failed'));

      const result = await client.removeProvider('p1');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getProxyHealth', () => {
    it('should fetch proxy health', async () => {
      const mockHealth = {
        status: 'healthy',
        activeProviders: 3,
        totalProviders: 4,
        healthyProviders: 3,
        averageResponseTime: 100,
        requestsInLastMinute: 50,
      };
      mockHttpClient.get.mockResolvedValue(mockHealth);

      const result = await client.getProxyHealth();
      expect(result).toEqual(mockHealth);
    });
  });

  describe('getProviderStatistics', () => {
    it('should fetch provider statistics', async () => {
      const mockStats = { totalRequests: 500, successRate: 0.98, averageLatency: 120, providerBreakdown: {} };
      mockHttpClient.get.mockResolvedValue(mockStats);

      const result = await client.getProviderStatistics();
      expect(result).toEqual(mockStats);
    });
  });

  describe('getProviderCatalog', () => {
    it('should fetch provider catalog without type filter', async () => {
      const mockCatalog = { success: true, data: {}, timestamp: '2025-01-01' };
      mockHttpClient.get.mockResolvedValue(mockCatalog);

      const result = await client.getProviderCatalog();

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/catalog')
      );
      expect(result).toEqual(mockCatalog);
    });

    it('should include type filter', async () => {
      mockHttpClient.get.mockResolvedValue({ success: true, data: {}, timestamp: '2025-01-01' });

      await client.getProviderCatalog('llm');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/catalog?type=llm')
      );
    });
  });

  describe('Provider Configuration CRUD', () => {
    it('should get provider configurations', async () => {
      mockHttpClient.get.mockResolvedValue({ configs: [] });
      await client.getProviderConfigurations('llm', true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations?type=llm&includeAnalytics=true')
      );
    });

    it('should get a single provider configuration', async () => {
      mockHttpClient.get.mockResolvedValue({ id: 'p1' });
      await client.getProviderConfiguration('p1');
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations/p1')
      );
    });

    it('should create a provider configuration', async () => {
      mockHttpClient.post.mockResolvedValue({ id: 'p1' });
      await client.createProviderConfiguration({ name: 'Test' });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations'),
        { name: 'Test' }
      );
    });

    it('should update a provider configuration', async () => {
      mockHttpClient.patch.mockResolvedValue({ id: 'p1' });
      await client.updateProviderConfiguration('p1', { name: 'Updated' });
      expect(mockHttpClient.patch).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations/p1'),
        { name: 'Updated' }
      );
    });

    it('should delete a provider configuration', async () => {
      mockHttpClient.delete.mockResolvedValue({});
      await client.deleteProviderConfiguration('p1');
      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations/p1')
      );
    });

    it('should set provider as primary', async () => {
      mockHttpClient.post.mockResolvedValue({});
      await client.setProviderAsPrimary('p1', { capability: 'text' });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations/p1/set-primary'),
        { capability: 'text' }
      );
    });

    it('should health check a provider', async () => {
      mockHttpClient.post.mockResolvedValue({ healthy: true });
      await client.healthCheckProvider('p1');
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations/p1/health-check'),
        {}
      );
    });

    it('should test provider configuration', async () => {
      mockHttpClient.post.mockResolvedValue({ success: true });
      await client.testProviderConfiguration('p1', { prompt: 'test' });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/providers/configurations/p1/test'),
        { prompt: 'test' }
      );
    });
  });

  describe('getClientHealth', () => {
    it('should return healthy status', () => {
      const health = client.getClientHealth();
      expect(health.status).toBe('healthy');
    });
  });
});
