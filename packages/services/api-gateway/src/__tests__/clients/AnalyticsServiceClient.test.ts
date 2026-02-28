import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockEventPublisher = vi.hoisted(() => ({
  recordEvent: vi.fn(),
  recordEvents: vi.fn(),
  recordMetric: vi.fn(),
  recordProviderUsage: vi.fn(),
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
  getAnalyticsEventPublisher: () => mockEventPublisher,
  withServiceResilience: vi.fn((_service: string, _op: string, fn: () => unknown) => fn()),
  createHttpClient: () => mockHttpClient,
  errorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  createServiceUrlsConfig: vi.fn(() => ({
    SERVICE_URLS: {},
    SERVICE_PORTS: {},
    getServiceUrl: vi.fn(() => 'http://localhost:3000'),
    getServicePort: vi.fn(() => 3000),
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

import { AnalyticsServiceClient } from '../../clients/AnalyticsServiceClient';

describe('AnalyticsServiceClient', () => {
  let client: AnalyticsServiceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AnalyticsServiceClient({ batchSize: 50, batchInterval: 1000 });
  });

  describe('recordEvent', () => {
    it('should publish event via event publisher', () => {
      const event = {
        eventType: 'page_view',
        eventData: { page: '/home' },
        userId: 'user-1',
        sessionId: 'session-1',
      };

      client.recordEvent(event);

      expect(mockEventPublisher.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'page_view',
          eventData: { page: '/home' },
          userId: 'user-1',
          sessionId: 'session-1',
        })
      );
    });

    it('should handle timestamp conversion', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const event = {
        eventType: 'click',
        eventData: {},
        timestamp,
      };

      client.recordEvent(event);

      expect(mockEventPublisher.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: '2025-01-01T00:00:00.000Z',
        })
      );
    });

    it('should handle publisher errors gracefully', () => {
      mockEventPublisher.recordEvent.mockImplementation(() => {
        throw new Error('Publisher error');
      });

      expect(() => client.recordEvent({ eventType: 'test', eventData: {} })).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('recordMetric', () => {
    it('should publish metric via event publisher', () => {
      const metric = {
        name: 'response_time',
        value: 150,
        type: 'histogram' as const,
        tags: { service: 'api-gateway' },
      };

      client.recordMetric(metric);

      expect(mockEventPublisher.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'response_time',
          metricValue: 150,
          metricType: 'histogram',
          labels: { service: 'api-gateway' },
        })
      );
    });

    it('should convert timer type to histogram', () => {
      client.recordMetric({ name: 'latency', value: 100, type: 'timer' });

      expect(mockEventPublisher.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({ metricType: 'histogram' })
      );
    });

    it('should handle publisher errors gracefully', () => {
      mockEventPublisher.recordMetric.mockImplementation(() => {
        throw new Error('Publish error');
      });

      expect(() => client.recordMetric({ name: 'test', value: 1, type: 'counter' })).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('recordProviderUsage', () => {
    it('should publish provider usage via event publisher', () => {
      const usage = {
        providerId: 'openai',
        providerName: 'OpenAI',
        operation: 'chat',
        requestId: 'req-1',
        timestamp: new Date(),
        success: true,
        latencyMs: 200,
        tokensUsed: 500,
        cost: 0.01,
      };

      client.recordProviderUsage(usage);

      expect(mockEventPublisher.recordProviderUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'openai',
          providerName: 'OpenAI',
          operation: 'chat',
          success: true,
          durationMs: 200,
          tokensUsed: 500,
          cost: 0.01,
        })
      );
    });

    it('should handle publisher errors gracefully', () => {
      mockEventPublisher.recordProviderUsage.mockImplementation(() => {
        throw new Error('Publish error');
      });

      expect(() =>
        client.recordProviderUsage({
          providerId: 'test',
          providerName: 'Test',
          operation: 'op',
          requestId: 'r1',
          timestamp: new Date(),
          success: false,
          latencyMs: 100,
          errorMessage: 'fail',
        })
      ).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('recordEvents', () => {
    it('should publish batch events via event publisher', () => {
      const events = [
        { eventType: 'event1', eventData: { a: 1 } },
        { eventType: 'event2', eventData: { b: 2 } },
      ];

      client.recordEvents(events);

      expect(mockEventPublisher.recordEvents).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'event1' }),
          expect.objectContaining({ eventType: 'event2' }),
        ])
      );
    });

    it('should handle publisher errors gracefully', () => {
      mockEventPublisher.recordEvents.mockImplementation(() => {
        throw new Error('Batch error');
      });

      expect(() => client.recordEvents([{ eventType: 'test', eventData: {} }])).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('recordMetrics', () => {
    it('should send batch metrics via HTTP', async () => {
      mockHttpClient.post.mockResolvedValue({ success: true });
      const metrics = [{ name: 'm1', value: 1, type: 'counter' as const }];

      await client.recordMetrics(metrics);

      expect(mockHttpClient.post).toHaveBeenCalledWith(expect.stringContaining('/api/analytics/metrics/batch'), {
        metrics,
      });
    });

    it('should propagate HTTP errors', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Service unavailable'));
      await expect(client.recordMetrics([])).rejects.toThrow('Service unavailable');
    });
  });

  describe('getMetrics', () => {
    it('should query metrics via HTTP', async () => {
      const mockResult = {
        metricName: 'response_time',
        timeRange: { startTime: new Date(), endTime: new Date() },
        data: [],
        aggregation: 'avg',
        totalDataPoints: 0,
      };
      mockHttpClient.post.mockResolvedValue({ data: mockResult });

      const query = {
        metricName: 'response_time',
        timeRange: { startTime: new Date(), endTime: new Date() },
        aggregation: 'avg' as const,
      };

      const result = await client.getMetrics(query);

      expect(mockHttpClient.post).toHaveBeenCalledWith(expect.stringContaining('/api/analytics/metrics/query'), query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getProviderAnalytics', () => {
    it('should fetch provider analytics via HTTP', async () => {
      const mockAnalytics = { totalRequests: 100, overallSuccessRate: 0.95, totalCost: 10 };
      mockHttpClient.post.mockResolvedValue({ data: mockAnalytics });

      const timeRange = { startTime: new Date(), endTime: new Date() };
      const result = await client.getProviderAnalytics(timeRange);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics/providers/analytics'),
        timeRange
      );
      expect(result).toEqual(mockAnalytics);
    });
  });

  describe('getRealtimeMetrics', () => {
    it('should fetch realtime metrics via HTTP', async () => {
      const mockData = { cpu: 45, memory: 60 };
      mockHttpClient.post.mockResolvedValue({ data: mockData });

      const result = await client.getRealtimeMetrics(['cpu', 'memory']);

      expect(mockHttpClient.post).toHaveBeenCalledWith(expect.stringContaining('/api/analytics/metrics/realtime'), {
        metricNames: ['cpu', 'memory'],
      });
      expect(result).toEqual(mockData);
    });
  });

  describe('getSystemHealth', () => {
    it('should fetch system health via HTTP', async () => {
      const mockHealth = { status: 'healthy', metrics: {}, alerts: [] };
      mockHttpClient.get.mockResolvedValue({ data: mockHealth });

      const result = await client.getSystemHealth();

      expect(mockHttpClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/analytics/system/health'));
      expect(result).toEqual(mockHealth);
    });

    it('should handle service unavailable', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Service unavailable'));
      await expect(client.getSystemHealth()).rejects.toThrow('Service unavailable');
    });
  });

  describe('shutdown', () => {
    it('should log shutdown message', async () => {
      await client.shutdown();
      expect(mockLogger.info).toHaveBeenCalledWith('Analytics service client shutdown complete', expect.any(Object));
    });
  });

  describe('getClientStatus', () => {
    it('should return event bus enabled status', () => {
      const status = client.getClientStatus();
      expect(status.eventBusEnabled).toBe(true);
    });
  });
});
