import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RecordEventUseCase,
  RecordEventRequest,
  MetricEventData,
  ProviderEventData,
  UserEventData,
  SystemEventData,
  AnomalyEventData,
} from '../application/use-cases/RecordEventUseCase';
import { IAnalyticsRepository } from '../domains/repositories/IAnalyticsRepository';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../config/service-urls', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

describe('RecordEventUseCase', () => {
  let useCase: RecordEventUseCase;
  let mockRepository: IAnalyticsRepository;

  beforeEach(() => {
    mockRepository = {
      recordMetric: vi.fn().mockResolvedValue(undefined),
      recordProviderUsage: vi.fn().mockResolvedValue(undefined),
      recordProviderHealth: vi.fn().mockResolvedValue(undefined),
      recordAnomaly: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockResolvedValue([]),
      getAnomalies: vi.fn().mockResolvedValue([]),
      queryMetrics: vi.fn().mockResolvedValue([]),
    } as unknown as IAnalyticsRepository;

    useCase = new RecordEventUseCase(mockRepository, true, true);
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should reject missing eventType', async () => {
      const request = {} as RecordEventRequest;
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Event type is required');
    });

    it('should reject invalid eventType', async () => {
      const request = { eventType: 'invalid' as unknown as string };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid event type');
    });

    it('should reject metric event without metricData', async () => {
      const request: RecordEventRequest = { eventType: 'metric' };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Metric data is required');
    });

    it('should reject provider event without providerData', async () => {
      const request: RecordEventRequest = { eventType: 'provider' };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Provider data is required');
    });

    it('should reject user event without userEventData', async () => {
      const request: RecordEventRequest = { eventType: 'user' };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('User event data is required');
    });

    it('should reject system event without systemEventData', async () => {
      const request: RecordEventRequest = { eventType: 'system' };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('System event data is required');
    });

    it('should reject anomaly event without anomalyData', async () => {
      const request: RecordEventRequest = { eventType: 'anomaly' };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Anomaly data is required');
    });
  });

  describe('metric event validation', () => {
    it('should reject metric without name', async () => {
      const request: RecordEventRequest = {
        eventType: 'metric',
        metricData: { name: '', value: 100, serviceName: 'test', source: 'test', metricType: 'counter' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Metric name is required');
    });

    it('should reject metric with invalid value', async () => {
      const request: RecordEventRequest = {
        eventType: 'metric',
        metricData: { name: 'test', value: NaN, serviceName: 'test', source: 'test', metricType: 'counter' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('valid number');
    });

    it('should reject metric without serviceName', async () => {
      const request: RecordEventRequest = {
        eventType: 'metric',
        metricData: { name: 'test', value: 100, serviceName: '', source: 'test', metricType: 'counter' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Service name is required');
    });

    it('should reject invalid metric type', async () => {
      const request: RecordEventRequest = {
        eventType: 'metric',
        metricData: {
          name: 'test',
          value: 100,
          serviceName: 'test',
          source: 'test',
          metricType: 'invalid' as unknown as string,
        },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid metric type');
    });
  });

  describe('provider event validation', () => {
    it('should reject provider without providerId', async () => {
      const request: RecordEventRequest = {
        eventType: 'provider',
        providerData: { action: 'usage', providerId: '', providerType: 'llm' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Provider ID is required');
    });

    it('should reject invalid provider type', async () => {
      const request: RecordEventRequest = {
        eventType: 'provider',
        providerData: { action: 'usage', providerId: 'openai', providerType: 'invalid' as unknown as string },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid provider type');
    });

    it('should reject invalid provider action', async () => {
      const request: RecordEventRequest = {
        eventType: 'provider',
        providerData: { action: 'invalid' as unknown as string, providerId: 'openai', providerType: 'llm' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid provider action');
    });
  });

  describe('user event validation', () => {
    it('should reject user event without userId', async () => {
      const request: RecordEventRequest = {
        eventType: 'user',
        userEventData: { userId: '', userType: 'user', action: 'login' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('User ID is required');
    });

    it('should reject invalid user type', async () => {
      const request: RecordEventRequest = {
        eventType: 'user',
        userEventData: { userId: 'user-123', userType: 'invalid' as unknown as string, action: 'login' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid user type');
    });
  });

  describe('system event validation', () => {
    it('should reject system event without component', async () => {
      const request: RecordEventRequest = {
        eventType: 'system',
        systemEventData: { component: '', action: 'started', severity: 'info', message: 'test' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('System component is required');
    });

    it('should reject system event without message', async () => {
      const request: RecordEventRequest = {
        eventType: 'system',
        systemEventData: { component: 'api-gateway', action: 'started', severity: 'info', message: '' },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('System message is required');
    });

    it('should reject invalid severity', async () => {
      const request: RecordEventRequest = {
        eventType: 'system',
        systemEventData: {
          component: 'api-gateway',
          action: 'started',
          severity: 'invalid' as unknown as string,
          message: 'test',
        },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid severity level');
    });
  });

  describe('anomaly event validation', () => {
    it('should reject anomaly without metricName', async () => {
      const request: RecordEventRequest = {
        eventType: 'anomaly',
        anomalyData: {
          anomalyType: 'threshold_breach',
          severity: 'high',
          metricName: '',
          actualValue: 100,
          deviationScore: 2.5,
          description: 'test',
        },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Metric name is required');
    });

    it('should reject anomaly with non-numeric actualValue', async () => {
      const request: RecordEventRequest = {
        eventType: 'anomaly',
        anomalyData: {
          anomalyType: 'threshold_breach',
          severity: 'high',
          metricName: 'cpu_usage',
          actualValue: 'high' as unknown as string,
          deviationScore: 2.5,
          description: 'test',
        },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('must be a number');
    });
  });

  describe('successful event recording', () => {
    it('should successfully record a metric event', async () => {
      const request: RecordEventRequest = {
        eventType: 'metric',
        metricData: {
          name: 'api.requests',
          value: 150,
          serviceName: 'api-gateway',
          source: 'prometheus',
          metricType: 'counter',
          unit: 'requests',
        },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.eventType).toBe('metric');
      expect(mockRepository.recordMetric).toHaveBeenCalled();
    });

    it('should successfully record a system event', async () => {
      const request: RecordEventRequest = {
        eventType: 'system',
        systemEventData: {
          component: 'api-gateway',
          action: 'started',
          severity: 'info',
          message: 'Service started successfully',
        },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(true);
      expect(result.eventType).toBe('system');
    });

    it('should successfully record an anomaly event', async () => {
      const request: RecordEventRequest = {
        eventType: 'anomaly',
        anomalyData: {
          anomalyType: 'threshold_breach',
          severity: 'high',
          metricName: 'cpu_usage',
          actualValue: 95,
          expectedValue: 50,
          deviationScore: 3.0,
          description: 'CPU usage exceeded threshold',
        },
      };
      const result = await useCase.execute(request);
      expect(result.success).toBe(true);
      expect(mockRepository.recordAnomaly).toHaveBeenCalled();
    });
  });

  describe('batch processing', () => {
    it('should process batch events in best_effort mode', async () => {
      const events: RecordEventRequest[] = [
        {
          eventType: 'metric',
          metricData: { name: 'test1', value: 100, serviceName: 'svc', source: 'test', metricType: 'counter' },
        },
        {
          eventType: 'metric',
          metricData: { name: 'test2', value: 200, serviceName: 'svc', source: 'test', metricType: 'gauge' },
        },
      ];

      const result = await useCase.executeBatch({
        events,
        processingMode: 'best_effort',
      });

      expect(result.success).toBe(true);
      expect(result.totalEvents).toBe(2);
      expect(result.processedEvents).toBe(2);
      expect(result.failedEvents).toBe(0);
      expect(result.summary.metricEvents).toBe(2);
    });

    it('should handle partial failures in best_effort mode', async () => {
      const events: RecordEventRequest[] = [
        {
          eventType: 'metric',
          metricData: { name: 'valid', value: 100, serviceName: 'svc', source: 'test', metricType: 'counter' },
        },
        { eventType: 'metric' }, // Invalid - missing metricData
      ];

      const result = await useCase.executeBatch({
        events,
        processingMode: 'best_effort',
      });

      expect(result.success).toBe(true);
      expect(result.processedEvents).toBe(1);
      expect(result.failedEvents).toBe(1);
    });

    it('should fail entire batch in strict mode on any error', async () => {
      const events: RecordEventRequest[] = [
        {
          eventType: 'metric',
          metricData: { name: 'valid', value: 100, serviceName: 'svc', source: 'test', metricType: 'counter' },
        },
        { eventType: 'metric' }, // Invalid
      ];

      const result = await useCase.executeBatch({
        events,
        processingMode: 'strict',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('BATCH_PROCESSING_FAILED');
    });
  });
});
