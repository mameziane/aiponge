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
  createIntervalScheduler: vi.fn(({ handler }: { handler: () => void; name?: string; serviceName?: string; intervalMs?: number }) => ({
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
  })),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  errorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrls: () => ({}),
}));

import { SystemHealthService, type SystemHealthMetrics, type ServiceHealthCheck } from '../application/system-health/SystemHealthService';

function createMockHealthMetrics(overrides: Partial<SystemHealthMetrics> = {}): SystemHealthMetrics {
  return {
    timestamp: new Date(),
    serviceName: 'test-service',
    healthStatus: 'healthy',
    uptime: 0.99,
    responseTimeMs: 100,
    errorRate: 0.01,
    resourceUtilization: {
      cpu: 30,
      memory: 40,
      disk: 20,
      networkIn: 1000,
      networkOut: 2000,
    },
    serviceMetrics: {
      activeConnections: 10,
      requestsPerSecond: 50,
      queueLength: 0,
      processingLatency: 50,
    },
    ...overrides,
  };
}

function createMockHealthCheck(overrides: Partial<ServiceHealthCheck> = {}): ServiceHealthCheck {
  return {
    serviceName: 'test-service',
    status: 'healthy',
    lastChecked: new Date(),
    responseTimeMs: 100,
    dependencies: [],
    details: {
      uptime: 0.99,
      version: '1.0.0',
      build: 'abc123',
      environment: 'test',
      startTime: new Date(),
    },
    metrics: {
      requestCount: 1000,
      errorCount: 5,
      averageResponseTime: 100,
      memoryUsage: 50,
      cpuUsage: 30,
    },
    ...overrides,
  };
}

describe('SystemHealthService', () => {
  let service: SystemHealthService;
  let mockRepository: Record<string, ReturnType<typeof vi.fn>>;
  let mockMetricsCollector: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockRepository = {};

    mockMetricsCollector = {
      recordMetric: vi.fn().mockResolvedValue(undefined),
    };

    service = new SystemHealthService(mockRepository, mockMetricsCollector);
  });

  afterEach(async () => {
    await service.shutdown();
    vi.useRealTimers();
  });

  describe('registerService', () => {
    it('should register a service for monitoring', () => {
      service.registerService('my-service');
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('recordSystemHealthMetrics', () => {
    it('should record multiple metrics via metrics collector', async () => {
      const metrics = createMockHealthMetrics();
      await service.recordSystemHealthMetrics(metrics);

      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledTimes(8);
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'system.health.status' })
      );
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'system.uptime' })
      );
    });

    it('should create alert for high response time', async () => {
      const metrics = createMockHealthMetrics({ responseTimeMs: 10000 });

      const alertHandler = vi.fn();
      service.on('alert_triggered', alertHandler);

      await service.recordSystemHealthMetrics(metrics);

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'high_latency',
          severity: 'high',
        })
      );
    });

    it('should create alert for high error rate', async () => {
      const metrics = createMockHealthMetrics({ errorRate: 0.1 });
      const alertHandler = vi.fn();
      service.on('alert_triggered', alertHandler);

      await service.recordSystemHealthMetrics(metrics);

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({ alertType: 'error_rate' })
      );
    });

    it('should create alert for high CPU usage', async () => {
      const metrics = createMockHealthMetrics({
        resourceUtilization: { cpu: 95, memory: 40, disk: 20, networkIn: 1000, networkOut: 2000 },
      });
      const alertHandler = vi.fn();
      service.on('alert_triggered', alertHandler);

      await service.recordSystemHealthMetrics(metrics);

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({ alertType: 'resource_usage' })
      );
    });

    it('should create alert for high memory usage', async () => {
      const metrics = createMockHealthMetrics({
        resourceUtilization: { cpu: 30, memory: 95, disk: 20, networkIn: 1000, networkOut: 2000 },
      });
      const alertHandler = vi.fn();
      service.on('alert_triggered', alertHandler);

      await service.recordSystemHealthMetrics(metrics);

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({ alertType: 'resource_usage' })
      );
    });

    it('should not create duplicate alerts for same service and type', async () => {
      const metrics = createMockHealthMetrics({ responseTimeMs: 10000 });
      const alertHandler = vi.fn();
      service.on('alert_triggered', alertHandler);

      await service.recordSystemHealthMetrics(metrics);
      await service.recordSystemHealthMetrics(metrics);

      expect(alertHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit health_metrics_recorded event', async () => {
      const handler = vi.fn();
      service.on('health_metrics_recorded', handler);

      const metrics = createMockHealthMetrics();
      await service.recordSystemHealthMetrics(metrics);

      expect(handler).toHaveBeenCalledWith(metrics);
    });
  });

  describe('updateServiceHealth', () => {
    it('should cache health check and record metrics', async () => {
      const healthCheck = createMockHealthCheck();
      await service.updateServiceHealth(healthCheck);

      const cached = service.getServiceHealth('test-service');
      expect(cached).toBe(healthCheck);
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalled();
    });

    it('should record response time metric when present', async () => {
      const healthCheck = createMockHealthCheck({ responseTimeMs: 200 });
      await service.updateServiceHealth(healthCheck);

      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'service.health.response_time', value: 200 })
      );
    });

    it('should create critical alert for unhealthy service', async () => {
      const healthCheck = createMockHealthCheck({ status: 'unhealthy' });
      const alertHandler = vi.fn();
      service.on('alert_triggered', alertHandler);

      await service.updateServiceHealth(healthCheck);

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'service_down',
          severity: 'critical',
        })
      );
    });

    it('should create alert for unhealthy dependency', async () => {
      const healthCheck = createMockHealthCheck({
        dependencies: [
          { name: 'database', status: 'unhealthy', error: 'Connection refused' },
        ],
      });
      const alertHandler = vi.fn();
      service.on('alert_triggered', alertHandler);

      await service.updateServiceHealth(healthCheck);

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({ alertType: 'dependency_failure' })
      );
    });

    it('should emit service_health_updated event', async () => {
      const handler = vi.fn();
      service.on('service_health_updated', handler);

      const healthCheck = createMockHealthCheck();
      await service.updateServiceHealth(healthCheck);

      expect(handler).toHaveBeenCalledWith(healthCheck);
    });
  });

  describe('getSystemHealthSummary', () => {
    it('should return healthy summary when all services are healthy', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'healthy' }));
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc2', status: 'healthy' }));

      const summary = await service.getSystemHealthSummary();

      expect(summary.overallStatus).toBe('healthy');
      expect(summary.totalServices).toBe(2);
      expect(summary.healthyServices).toBe(2);
    });

    it('should return degraded when at least one service is degraded', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'healthy' }));
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc2', status: 'degraded' }));

      const summary = await service.getSystemHealthSummary();
      expect(summary.overallStatus).toBe('degraded');
      expect(summary.degradedServices).toBe(1);
    });

    it('should return unhealthy when at least one service is unhealthy', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'healthy' }));
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc2', status: 'unhealthy' }));

      const summary = await service.getSystemHealthSummary();
      expect(summary.overallStatus).toBe('unhealthy');
      expect(summary.unhealthyServices).toBe(1);
    });

    it('should return empty summary when no services registered', async () => {
      const summary = await service.getSystemHealthSummary();
      expect(summary.totalServices).toBe(0);
      expect(summary.overallStatus).toBe('healthy');
    });

    it('should calculate average response time', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', responseTimeMs: 100 }));
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc2', responseTimeMs: 200 }));

      const summary = await service.getSystemHealthSummary();
      expect(summary.systemMetrics.averageResponseTime).toBe(150);
    });
  });

  describe('getServiceHealth', () => {
    it('should return null for unknown service', () => {
      const result = service.getServiceHealth('unknown');
      expect(result).toBeNull();
    });

    it('should return cached health check', async () => {
      const healthCheck = createMockHealthCheck({ serviceName: 'known-service' });
      await service.updateServiceHealth(healthCheck);

      const result = service.getServiceHealth('known-service');
      expect(result).toBe(healthCheck);
    });
  });

  describe('getActiveAlerts', () => {
    it('should return empty array when no alerts', () => {
      const alerts = service.getActiveAlerts();
      expect(alerts).toEqual([]);
    });

    it('should return active alerts sorted by severity then timestamp', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'unhealthy' }));

      const metrics = createMockHealthMetrics({ serviceName: 'svc2', responseTimeMs: 10000 });
      await service.recordSystemHealthMetrics(metrics);

      const alerts = service.getActiveAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(2);
      expect(alerts[0].severity).toBe('critical');
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an existing alert', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'unhealthy' }));
      const alerts = service.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;
      await service.acknowledgeAlert(alertId, 'admin');

      const updatedAlerts = service.getActiveAlerts();
      expect(updatedAlerts.find(a => a.id === alertId)).toBeUndefined();
    });

    it('should throw for non-existent alert', async () => {
      await expect(service.acknowledgeAlert('nonexistent', 'admin')).rejects.toThrow();
    });

    it('should emit alert_acknowledged event', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'unhealthy' }));
      const alerts = service.getActiveAlerts();

      const handler = vi.fn();
      service.on('alert_acknowledged', handler);

      await service.acknowledgeAlert(alerts[0].id, 'admin');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an existing alert', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'unhealthy' }));
      const alerts = service.getActiveAlerts();

      await service.resolveAlert(alerts[0].id);

      const updatedAlerts = service.getActiveAlerts();
      expect(updatedAlerts.find(a => a.id === alerts[0].id)).toBeUndefined();
    });

    it('should throw for non-existent alert', async () => {
      await expect(service.resolveAlert('nonexistent')).rejects.toThrow();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when no critical alerts', async () => {
      const result = await service.healthCheck();
      expect(result.status).toBe('healthy');
    });

    it('should return unhealthy when critical alerts exist', async () => {
      await service.updateServiceHealth(createMockHealthCheck({ serviceName: 'svc1', status: 'unhealthy' }));

      const result = await service.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(result.details.criticalAlerts).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should clear health check timer', async () => {
      await service.shutdown();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Shutdown'));
    });
  });
});
