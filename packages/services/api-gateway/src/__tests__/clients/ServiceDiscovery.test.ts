import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  createHttpClient: () => mockHttpClient,
  ServiceLocator: {
    getServiceUrl: vi.fn().mockReturnValue('http://localhost:3001'),
    getServicePort: vi.fn().mockImplementation((name: string) => {
      const ports: Record<string, number> = {
        'system-service': 3001,
        'storage-service': 3002,
        'user-service': 3003,
        'api-gateway': 8080,
        'ai-config-service': 3004,
        'ai-content-service': 3005,
        'ai-analytics-service': 3006,
        'music-service': 3007,
      };
      return ports[name] || 3000;
    }),
    getValidatedServicePort: vi.fn().mockImplementation((name: string) => {
      const ports: Record<string, number> = {
        'system-service': 3001,
        'storage-service': 3002,
        'user-service': 3003,
        'api-gateway': 8080,
        'ai-config-service': 3004,
        'ai-content-service': 3005,
        'ai-analytics-service': 3006,
        'music-service': 3007,
      };
      return ports[name] || 3000;
    }),
  },
  logAndTrackError: vi.fn().mockReturnValue({ error: new Error('wrapped'), correlationId: 'test-id' }),
  serializeError: vi.fn().mockReturnValue({ message: 'error' }),
  DomainError: class DomainError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createIntervalScheduler: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
  })),
  createServiceUrlsConfig: vi.fn(() => ({
    SERVICE_URLS: {},
    SERVICE_PORTS: {},
    getServiceUrl: vi.fn(() => 'http://localhost:3001'),
    getServicePort: vi.fn(() => 3001),
    getOwnPort: vi.fn(() => 8080),
    createServiceHttpClient: vi.fn(),
    getHttpConfig: vi.fn(() => ({ timeout: 5000, retries: 0 })),
  })),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock('../../config/GatewayConfig', () => ({
  GatewayConfig: {
    http: { defaults: { timeout: 5000, retries: 3 } },
  },
}));

import { ServiceDiscovery, type ServiceInstance } from '../../services/ServiceDiscovery';

function createServiceInstance(overrides: Partial<ServiceInstance> = {}): ServiceInstance {
  return {
    id: 'test-instance-1',
    name: 'test-service',
    host: 'localhost',
    port: 3000,
    version: '1.0.0',
    protocol: 'http',
    healthEndpoint: '/health',
    metadata: { environment: 'test' },
    registeredAt: new Date(),
    healthy: true,
    weight: 1,
    ...overrides,
  };
}

describe('ServiceDiscovery', () => {
  let discovery: ServiceDiscovery;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mockHttpClient.get.mockRejectedValue(new Error('system-service unavailable'));
    discovery = new ServiceDiscovery();
  });

  afterEach(async () => {
    await discovery.destroy();
    vi.useRealTimers();
  });

  describe('registerService', () => {
    it('should register a new service instance', async () => {
      const instance = createServiceInstance({ name: 'my-service', id: 'inst-1' });

      await discovery.registerService(instance);

      const instances = discovery.discoverService('my-service');
      expect(instances).toHaveLength(1);
      expect(instances[0].name).toBe('my-service');
      expect(instances[0].id).toBe('inst-1');
    });

    it('should register multiple instances of the same service', async () => {
      const instance1 = createServiceInstance({ name: 'my-service', id: 'inst-1', port: 3001 });
      const instance2 = createServiceInstance({ name: 'my-service', id: 'inst-2', port: 3002 });

      await discovery.registerService(instance1);
      await discovery.registerService(instance2);

      const instances = discovery.discoverService('my-service');
      expect(instances).toHaveLength(2);
    });

    it('should replace existing instance with same ID', async () => {
      const instance1 = createServiceInstance({ name: 'my-service', id: 'inst-1', port: 3001 });
      const instance2 = createServiceInstance({ name: 'my-service', id: 'inst-1', port: 3002 });

      await discovery.registerService(instance1);
      await discovery.registerService(instance2);

      const instances = discovery.discoverService('my-service');
      expect(instances).toHaveLength(1);
      expect(instances[0].port).toBe(3002);
    });
  });

  describe('deregisterService', () => {
    it('should deregister a service instance', async () => {
      const instance = createServiceInstance({ name: 'my-service', id: 'inst-1' });
      await discovery.registerService(instance);

      await discovery.deregisterService('my-service', 'inst-1');

      const instances = discovery.discoverService('my-service');
      expect(instances).toHaveLength(0);
    });

    it('should handle deregistering non-existent service', async () => {
      await expect(
        discovery.deregisterService('nonexistent', 'inst-1')
      ).resolves.not.toThrow();
    });

    it('should handle deregistering non-existent instance', async () => {
      const instance = createServiceInstance({ name: 'my-service', id: 'inst-1' });
      await discovery.registerService(instance);

      await discovery.deregisterService('my-service', 'inst-999');

      const instances = discovery.discoverService('my-service');
      expect(instances).toHaveLength(1);
    });
  });

  describe('discoverService', () => {
    it('should return only healthy instances', async () => {
      const healthy = createServiceInstance({ name: 'svc', id: 'h1', healthy: true });
      const unhealthy = createServiceInstance({ name: 'svc', id: 'h2', healthy: false });

      await discovery.registerService(healthy);
      await discovery.registerService(unhealthy);

      const instances = discovery.discoverService('svc');
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe('h1');
    });

    it('should return empty array for unknown service', () => {
      const instances = discovery.discoverService('unknown-service');
      expect(instances).toEqual([]);
    });

    it('should return empty array when all instances are unhealthy', async () => {
      const unhealthy1 = createServiceInstance({ name: 'svc', id: 'u1', healthy: false });
      const unhealthy2 = createServiceInstance({ name: 'svc', id: 'u2', healthy: false });

      await discovery.registerService(unhealthy1);
      await discovery.registerService(unhealthy2);

      const instances = discovery.discoverService('svc');
      expect(instances).toHaveLength(0);
    });
  });

  describe('getAllServices', () => {
    it('should return all registered services', async () => {
      await discovery.registerService(createServiceInstance({ name: 'svc-a', id: 'a1' }));
      await discovery.registerService(createServiceInstance({ name: 'svc-b', id: 'b1' }));

      const allServices = discovery.getAllServices();
      expect(allServices.has('svc-a')).toBe(true);
      expect(allServices.has('svc-b')).toBe(true);
    });

    it('should return a copy of the services map', async () => {
      await discovery.registerService(createServiceInstance({ name: 'svc', id: 's1' }));

      const services1 = discovery.getAllServices();
      const services2 = discovery.getAllServices();

      expect(services1).not.toBe(services2);
    });
  });

  describe('getServiceStats', () => {
    it('should return correct stats for a service', async () => {
      await discovery.registerService(createServiceInstance({ name: 'svc', id: 's1', healthy: true }));
      await discovery.registerService(createServiceInstance({ name: 'svc', id: 's2', healthy: false }));
      await discovery.registerService(createServiceInstance({ name: 'svc', id: 's3', healthy: true }));

      const stats = discovery.getServiceStats('svc');

      expect(stats.total).toBe(3);
      expect(stats.healthy).toBe(2);
      expect(stats.unhealthy).toBe(1);
      expect(stats.instances).toHaveLength(3);
    });

    it('should return zero stats for unknown service', () => {
      const stats = discovery.getServiceStats('unknown');

      expect(stats.total).toBe(0);
      expect(stats.healthy).toBe(0);
      expect(stats.unhealthy).toBe(0);
      expect(stats.instances).toHaveLength(0);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy result on successful response', async () => {
      mockHttpClient.get.mockResolvedValueOnce({ success: true });

      const instance = createServiceInstance();
      const result = await discovery.checkHealth(instance);

      expect(result.healthy).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('should return unhealthy result on failed response', async () => {
      mockHttpClient.get.mockResolvedValueOnce({ success: false });

      const instance = createServiceInstance();
      const result = await discovery.checkHealth(instance);

      expect(result.healthy).toBe(false);
    });

    it('should return unhealthy result on network error', async () => {
      mockHttpClient.get.mockRejectedValueOnce(new Error('Connection refused'));

      const instance = createServiceInstance();
      const result = await discovery.checkHealth(instance);

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should return unhealthy result on timeout', async () => {
      mockHttpClient.get.mockRejectedValueOnce(new Error('Timeout'));

      const instance = createServiceInstance();
      const result = await discovery.checkHealth(instance);

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Timeout');
    });
  });

  describe('getDiscoveryStatus', () => {
    it('should return discovery status', () => {
      const status = discovery.getDiscoveryStatus();

      expect(status).toHaveProperty('mode');
      expect(status).toHaveProperty('systemServiceAvailable');
      expect(status).toHaveProperty('probeInterval');
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('successCount');
    });

    it('should return a copy of the status', () => {
      const status1 = discovery.getDiscoveryStatus();
      const status2 = discovery.getDiscoveryStatus();
      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });

  describe('destroy', () => {
    it('should clean up resources', async () => {
      await discovery.registerService(createServiceInstance({ name: 'svc', id: 's1' }));

      await discovery.destroy();

      const services = discovery.getAllServices();
      expect(services.size).toBe(0);
    });
  });

  describe('stopHealthChecking', () => {
    it('should stop health check interval', () => {
      discovery.stopHealthChecking();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Health checking stopped'),
        expect.any(Object)
      );
    });
  });

  describe('forceStaticFallback', () => {
    it('should switch to static discovery mode', () => {
      discovery.forceStaticFallback();

      const status = discovery.getDiscoveryStatus();
      expect(status.mode).toBe('static');
      expect(status.systemServiceAvailable).toBe(false);
    });
  });
});
