import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
      if (cause) this.cause = cause;
    }
  },
  createIntervalScheduler: vi.fn((opts: { handler: () => void | Promise<void>; intervalMs: number }) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    return {
      start: vi.fn(() => {
        timer = setInterval(() => opts.handler(), opts.intervalMs);
      }),
      stop: vi.fn(() => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }),
      isRunning: vi.fn(() => timer !== null),
    };
  }),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrls: () => ({}),
}));

import { MetricsCollectorService } from '../application/services/MetricsCollectorService';
import type { MetricEntry } from '../domains/entities/MetricEntry';

function createMockMetric(overrides: Partial<MetricEntry> = {}): MetricEntry {
  return {
    name: 'test.metric',
    value: 42,
    timestamp: new Date(),
    serviceName: 'test-service',
    source: 'test',
    metricType: 'gauge',
    unit: 'count',
    ...overrides,
  };
}

describe('MetricsCollectorService', () => {
  let service: MetricsCollectorService;
  let mockRepository: Record<string, ReturnType<typeof vi.fn>>;
  let mockCache: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockRepository = {
      recordMetric: vi.fn().mockResolvedValue(undefined),
      recordMetrics: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockResolvedValue([]),
      getMetricTimeSeries: vi.fn().mockResolvedValue([]),
      exportPrometheusMetrics: vi.fn().mockResolvedValue(''),
    };

    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue(undefined),
    };

    service = new MetricsCollectorService(mockRepository, mockCache);
  });

  afterEach(async () => {
    await service.shutdown();
    vi.useRealTimers();
  });

  describe('recordMetric', () => {
    it('should add metric to batch without flushing when under batch size', async () => {
      const metric = createMockMetric();
      await service.recordMetric(metric);
      expect(mockRepository.recordMetrics).not.toHaveBeenCalled();
    });

    it('should flush batch when batch size is reached', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordMetric(createMockMetric({ name: `metric_${i}` }));
      }
      expect(mockRepository.recordMetrics).toHaveBeenCalledTimes(1);
      expect(mockRepository.recordMetrics).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'metric_0' })])
      );
    });

    it('should log error and rethrow when recordMetric fails during flush', async () => {
      mockRepository.recordMetrics.mockRejectedValue(new Error('DB error'));
      for (let i = 0; i < 100; i++) {
        await service.recordMetric(createMockMetric({ name: `m_${i}` }));
      }
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('recordMetrics', () => {
    it('should add multiple metrics to batch', async () => {
      const metrics = [createMockMetric({ name: 'a' }), createMockMetric({ name: 'b' })];
      await service.recordMetrics(metrics);
      expect(mockRepository.recordMetrics).not.toHaveBeenCalled();
    });

    it('should flush when adding metrics exceeds batch size', async () => {
      const metrics = Array.from({ length: 100 }, (_, i) => createMockMetric({ name: `m_${i}` }));
      await service.recordMetrics(metrics);
      expect(mockRepository.recordMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('batch flush on interval', () => {
    it('should auto-flush batch on timer interval', async () => {
      await service.recordMetric(createMockMetric());
      expect(mockRepository.recordMetrics).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockRepository.recordMetrics).toHaveBeenCalledTimes(1);
    });

    it('should not flush when batch is empty', async () => {
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockRepository.recordMetrics).not.toHaveBeenCalled();
    });
  });

  describe('flush failure and retry', () => {
    it('should re-queue metrics on flush failure', async () => {
      mockRepository.recordMetrics.mockRejectedValueOnce(new Error('DB down'));

      for (let i = 0; i < 100; i++) {
        await service.recordMetric(createMockMetric({ name: `m_${i}` }));
      }

      expect(mockRepository.recordMetrics).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalled();

      mockRepository.recordMetrics.mockResolvedValueOnce(undefined);
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockRepository.recordMetrics).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMetricTimeSeries', () => {
    it('should delegate to repository', async () => {
      const expected = [{ timestamp: new Date(), value: 10 }];
      mockRepository.getMetricTimeSeries.mockResolvedValue(expected);

      const result = await service.getMetricTimeSeries(
        'test.metric',
        'test-service',
        new Date('2024-01-01'),
        new Date('2024-01-02'),
        60
      );

      expect(result).toEqual(expected);
      expect(mockRepository.getMetricTimeSeries).toHaveBeenCalledWith(
        'test.metric',
        new Date('2024-01-01'),
        new Date('2024-01-02'),
        60,
        undefined
      );
    });

    it('should throw on repository error', async () => {
      mockRepository.getMetricTimeSeries.mockRejectedValue(new Error('Query failed'));
      await expect(service.getMetricTimeSeries('m', 's', new Date(), new Date(), 60)).rejects.toThrow('Query failed');
    });
  });

  describe('getProviderMetrics', () => {
    it('should return cached result if available', async () => {
      const cachedResult = { providerId: 'p1', metrics: [] };
      mockCache.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await service.getProviderMetrics('p1', 60000);
      expect(result).toEqual(cachedResult);
      expect(mockRepository.getMetrics).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache when no cache hit', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRepository.getMetrics.mockResolvedValue([
        createMockMetric({ name: 'requests_total', value: 100 }),
        createMockMetric({ name: 'latency_ms', value: 250 }),
      ]);

      const result = await service.getProviderMetrics('p1', 60000);

      expect(result.providerId).toBe('p1');
      expect(result.summary.totalRequests).toBe(1);
      expect(result.summary.averageLatency).toBe(250);
      expect(mockCache.setex).toHaveBeenCalledWith(
        expect.stringContaining('provider_metrics:p1'),
        60,
        expect.any(String)
      );
    });

    it('should calculate error rate correctly', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRepository.getMetrics.mockResolvedValue([
        createMockMetric({ name: 'requests_total', value: 100 }),
        createMockMetric({ name: 'error_count', value: 5 }),
      ]);

      const result = await service.getProviderMetrics('p1', 60000);
      expect(result.summary.errorRate).toBe(5);
    });

    it('should throw on error', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));
      await expect(service.getProviderMetrics('p1', 60000)).rejects.toThrow('Cache error');
    });
  });

  describe('exportPrometheusMetrics', () => {
    it('should delegate to repository', async () => {
      mockRepository.exportPrometheusMetrics.mockResolvedValue('# HELP test\ntest_metric 42');
      const result = await service.exportPrometheusMetrics('test-service');
      expect(result).toContain('test_metric 42');
    });
  });

  describe('shutdown', () => {
    it('should clear timer and flush remaining metrics', async () => {
      await service.recordMetric(createMockMetric());
      await service.shutdown();

      expect(mockRepository.recordMetrics).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Shutdown complete');
    });

    it('should handle shutdown with empty batch', async () => {
      await service.shutdown();
      expect(mockRepository.recordMetrics).not.toHaveBeenCalled();
    });
  });
});
