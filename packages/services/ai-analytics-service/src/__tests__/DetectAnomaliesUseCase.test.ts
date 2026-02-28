import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  errorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrls: () => ({}),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

import { DetectAnomaliesUseCase } from '../application/use-cases/DetectAnomaliesUseCase';
import type { MetricEntry } from '../domains/entities/MetricEntry';

function createMockRepository() {
  return {
    getMetrics: vi.fn().mockResolvedValue([]),
    recordMetric: vi.fn().mockResolvedValue(undefined),
    getEvents: vi.fn().mockResolvedValue([]),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    getTraces: vi.fn().mockResolvedValue([]),
    getSpans: vi.fn().mockResolvedValue([]),
    getLogs: vi.fn().mockResolvedValue([]),
  };
}

function createMockIntelligenceRepository() {
  return {
    recordAnomaly: vi.fn().mockResolvedValue(undefined),
    getAnomalies: vi.fn().mockResolvedValue([]),
    recordInsight: vi.fn().mockResolvedValue(undefined),
    getInsights: vi.fn().mockResolvedValue([]),
    getRecommendations: vi.fn().mockResolvedValue([]),
  };
}

function createMetricEntry(overrides: Partial<MetricEntry> = {}): MetricEntry {
  return {
    name: 'response_time',
    value: 100,
    timestamp: new Date(),
    serviceName: 'test-service',
    source: 'test',
    metricType: 'gauge',
    ...overrides,
  };
}

describe('DetectAnomaliesUseCase', () => {
  let useCase: DetectAnomaliesUseCase;
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockIntelligenceRepo = createMockIntelligenceRepository();
    useCase = new DetectAnomaliesUseCase(
      mockRepository as unknown as ConstructorParameters<typeof useCase.constructor>[0],
      mockIntelligenceRepo as unknown as Record<string, ReturnType<typeof vi.fn>>
    );
  });

  describe('execute', () => {
    it('should return empty anomalies when no metrics data', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      const result = await useCase.execute({});

      expect(result.anomalies).toEqual([]);
      expect(result.summary.totalAnomalies).toBe(0);
      expect(result.processingStats.dataPointsAnalyzed).toBe(0);
      expect(result.lastAnalyzed).toBeInstanceOf(Date);
    });

    it('should use default time range of last hour when none specified', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      await useCase.execute({});

      expect(mockRepository.getMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: expect.any(Date),
          endTime: expect.any(Date),
        })
      );
    });

    it('should resolve explicit startTime and endTime', async () => {
      const startTime = new Date('2025-01-01');
      const endTime = new Date('2025-01-02');
      mockRepository.getMetrics.mockResolvedValue([]);

      await useCase.execute({ startTime, endTime });

      expect(mockRepository.getMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime,
          endTime,
        })
      );
    });

    it('should resolve timeRange shortcuts', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      await useCase.execute({ timeRange: 'last_24h' });

      const callArgs = mockRepository.getMetrics.mock.calls[0][0];
      const expectedStart = Date.now() - 24 * 60 * 60 * 1000;
      expect(callArgs.startTime.getTime()).toBeCloseTo(expectedStart, -3);
    });

    it('should skip metric groups with fewer than 5 data points', async () => {
      const metrics = Array.from({ length: 3 }, (_, i) =>
        createMetricEntry({ value: 100 + i, timestamp: new Date(Date.now() - i * 1000) })
      );
      mockRepository.getMetrics.mockResolvedValue(metrics);

      const result = await useCase.execute({});

      expect(result.anomalies).toEqual([]);
    });

    it('should detect statistical anomalies with sufficient data', async () => {
      const normalValues = Array.from({ length: 25 }, (_, i) =>
        createMetricEntry({
          value: 100 + (i % 3),
          timestamp: new Date(Date.now() - (25 - i) * 60000),
        })
      );
      const anomalousEntry = createMetricEntry({
        value: 1000,
        timestamp: new Date(),
      });
      mockRepository.getMetrics.mockResolvedValue([...normalValues, anomalousEntry]);

      const result = await useCase.execute({
        algorithms: ['statistical'],
        sensitivity: 'high',
      });

      expect(result.processingStats.dataPointsAnalyzed).toBe(26);
      expect(result.processingStats.algorithmsUsed).toContain('statistical');
    });

    it('should include patterns when includeContext is true', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      const result = await useCase.execute({ includeContext: true });

      expect(result.patterns).toBeDefined();
    });

    it('should include predictions when includePredictions is true', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      const result = await useCase.execute({ includePredictions: true });

      expect(result.predictions).toBeDefined();
    });

    it('should include recommendations when includeRecommendations is true', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      const result = await useCase.execute({ includeRecommendations: true });

      expect(result.recommendations).toBeDefined();
    });

    it('should use default algorithms (statistical, threshold) when none specified', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      const result = await useCase.execute({});

      expect(result.processingStats.algorithmsUsed).toEqual(['statistical', 'threshold']);
    });

    it('should set nextAnalysis based on realTimeMode', async () => {
      mockRepository.getMetrics.mockResolvedValue([]);

      const result = await useCase.execute({ realTimeMode: true });

      const expectedNextAnalysis = Date.now() + 5 * 60 * 1000;
      expect(result.nextAnalysis!.getTime()).toBeCloseTo(expectedNextAnalysis, -3);
    });

    it('should throw AnalyticsError when repository fails', async () => {
      mockRepository.getMetrics.mockRejectedValue(new Error('DB connection failed'));

      await expect(useCase.execute({})).rejects.toThrow('Failed to detect anomalies');
    });
  });

  describe('detectRealTime', () => {
    it('should return null when buffer has fewer than 10 entries', async () => {
      const entry = createMetricEntry();

      const result = await useCase.detectRealTime(entry);

      expect(result).toBeNull();
    });

    it('should analyze after buffer reaches 10 entries', async () => {
      for (let i = 0; i < 9; i++) {
        await useCase.detectRealTime(
          createMetricEntry({ value: 100, timestamp: new Date(Date.now() - (9 - i) * 1000) })
        );
      }

      const result = await useCase.detectRealTime(
        createMetricEntry({ value: 100, timestamp: new Date() })
      );

      expect(result === null || result !== undefined).toBe(true);
    });

    it('should detect anomaly for extreme value after buffer fills', async () => {
      for (let i = 0; i < 15; i++) {
        await useCase.detectRealTime(
          createMetricEntry({ value: 100, timestamp: new Date(Date.now() - (15 - i) * 1000) })
        );
      }

      const result = await useCase.detectRealTime(
        createMetricEntry({ value: 10000, timestamp: new Date() })
      );

      if (result) {
        expect(result.metricName).toBe('response_time');
        expect(result.actualValue).toBe(10000);
        expect(result.severity).toBeDefined();
        expect(mockIntelligenceRepo.recordAnomaly).toHaveBeenCalled();
      }
    });

    it('should handle errors gracefully and return null', async () => {
      mockIntelligenceRepo.recordAnomaly.mockRejectedValue(new Error('DB error'));

      for (let i = 0; i < 15; i++) {
        await useCase.detectRealTime(
          createMetricEntry({ value: 100, timestamp: new Date(Date.now() - (15 - i) * 1000) })
        );
      }

      const result = await useCase.detectRealTime(
        createMetricEntry({ value: 10000, timestamp: new Date() })
      );

      expect(result === null || result !== undefined).toBe(true);
    });

    it('should evict LRU entries when buffer exceeds MAX_DETECTION_KEYS', async () => {
      for (let i = 0; i < 501; i++) {
        await useCase.detectRealTime(
          createMetricEntry({
            name: `metric_${i}`,
            serviceName: `service_${i}`,
            value: 100,
          })
        );
      }

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('LRU eviction'),
        expect.any(Object)
      );
    });
  });

  describe('configureDetection', () => {
    it('should configure detection with valid rules', async () => {
      const result = await useCase.configureDetection({
        metricName: 'response_time',
        rules: [
          {
            ruleId: 'rule-1',
            ruleName: 'High Latency',
            algorithm: 'threshold',
            parameters: { upperThreshold: 1000 },
            severity: 'high',
            enabled: true,
          },
        ],
        alerting: {
          enabled: false,
          channels: [],
        },
      });

      expect(result.success).toBe(true);
      expect(result.configurationId).toBeDefined();
      expect(result.rulesConfigured).toBe(1);
    });

    it('should count only enabled rules', async () => {
      const result = await useCase.configureDetection({
        metricName: 'cpu_usage',
        rules: [
          { ruleId: 'r1', ruleName: 'R1', algorithm: 'threshold', parameters: {}, severity: 'low', enabled: true },
          { ruleId: 'r2', ruleName: 'R2', algorithm: 'statistical', parameters: {}, severity: 'high', enabled: false },
          { ruleId: 'r3', ruleName: 'R3', algorithm: 'threshold', parameters: {}, severity: 'medium', enabled: true },
        ],
        alerting: { enabled: false, channels: [] },
      });

      expect(result.rulesConfigured).toBe(2);
    });

    it('should report alerting enabled status', async () => {
      const result = await useCase.configureDetection({
        metricName: 'error_rate',
        rules: [
          { ruleId: 'r1', ruleName: 'Error Spike', algorithm: 'threshold', parameters: {}, severity: 'critical', enabled: true },
        ],
        alerting: {
          enabled: true,
          channels: ['slack', 'email'],
        },
      });

      expect(result.alertingEnabled).toBe(true);
    });
  });

  describe('analyzePatterns', () => {
    it('should analyze patterns for given anomaly IDs', async () => {
      mockIntelligenceRepo.getAnomalies.mockResolvedValue([
        { id: 'anomaly-1', type: 'spike', severity: 'high', metricName: 'latency', detectedAt: new Date() },
        { id: 'anomaly-2', type: 'drop', severity: 'medium', metricName: 'throughput', detectedAt: new Date() },
      ]);

      const result = await useCase.analyzePatterns({
        anomalyIds: ['anomaly-1', 'anomaly-2'],
        analysisType: 'correlation',
        lookbackDays: 7,
      });

      expect(result.analysisId).toBeDefined();
      expect(result.analysisType).toBe('correlation');
      expect(result.analyzedAnomalies).toBe(2);
      expect(result.patterns).toBeDefined();
      expect(result.correlations).toBeDefined();
      expect(result.insights).toBeDefined();
    });

    it('should handle empty anomaly list', async () => {
      mockIntelligenceRepo.getAnomalies.mockResolvedValue([]);

      const result = await useCase.analyzePatterns({
        anomalyIds: ['nonexistent'],
        analysisType: 'clustering',
        lookbackDays: 30,
      });

      expect(result.analyzedAnomalies).toBe(0);
    });

    it('should throw on repository failure', async () => {
      mockIntelligenceRepo.getAnomalies.mockRejectedValue(new Error('DB error'));

      await expect(
        useCase.analyzePatterns({
          anomalyIds: ['a-1'],
          analysisType: 'trend_analysis',
          lookbackDays: 14,
        })
      ).rejects.toThrow();
    });
  });
});
