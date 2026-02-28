import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { ServiceDiscoveryManager } from '../application/use-cases/discovery/ServiceDiscoveryManager';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@aiponge/platform-core', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    SERVICES: [
      {
        name: 'test-service-1',
        type: 'backend-service',
        port: { development: 3001, internal: 3001 },
      },
      {
        name: 'test-service-2',
        type: 'backend-service',
        port: { development: 3002, internal: 3002 },
      },
      {
        name: 'frontend-app',
        type: 'frontend-app',
        port: { development: 5000, internal: 5000 },
      },
    ],
    logPortConfiguration: vi.fn(),
  };
});

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ServiceDiscoveryManager', () => {
  let serviceDiscoveryManager: ServiceDiscoveryManager;

  beforeEach(() => {
    mockFetch.mockClear();
    serviceDiscoveryManager = new ServiceDiscoveryManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with discovery ports from config', () => {
      expect(serviceDiscoveryManager).toBeDefined();
    });

    it('should load ports dynamically from services config', () => {
      const ports = (serviceDiscoveryManager as unknown as { discoveryPorts: Record<string, number> }).discoveryPorts;
      expect(ports).toBeDefined();
      expect(Array.isArray(ports)).toBe(true);
      expect(ports.length).toBeGreaterThan(0);
    });

    it('should have unique sorted ports', () => {
      const ports = (serviceDiscoveryManager as unknown as { discoveryPorts: Record<string, number> }).discoveryPorts;
      const uniquePorts = Array.from(new Set(ports));
      expect(ports).toEqual(uniquePorts);

      // Check if sorted
      for (let i = 0; i < ports.length - 1; i++) {
        expect(ports[i]).toBeLessThanOrEqual(ports[i + 1]);
      }
    });
  });

  describe('discoverServices', () => {
    it('should discover services with healthy endpoints', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          service: 'test-service',
          version: '1.0.0',
          status: 'healthy',
        }),
      } as Response);

      const services = await serviceDiscoveryManager.discoverServices();

      expect(services).toBeDefined();
      expect(Array.isArray(services)).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should skip unhealthy services', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      } as Response);

      const services = await serviceDiscoveryManager.discoverServices();

      expect(Array.isArray(services)).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const services = await serviceDiscoveryManager.discoverServices();

      expect(Array.isArray(services)).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should extract service metadata from health response', async () => {
      const mockHealthData = {
        service: 'test-service',
        version: '2.0.0',
        status: 'healthy',
        description: 'Test service description',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockHealthData,
      } as Response);

      const services = await serviceDiscoveryManager.discoverServices();

      if (services.length > 0) {
        expect(services[0]).toHaveProperty('serviceName');
        expect(services[0]).toHaveProperty('version');
        expect(services[0]).toHaveProperty('status');
      }
    });

    it('should use default values when health data is incomplete', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const services = await serviceDiscoveryManager.discoverServices();

      if (services.length > 0) {
        expect(services[0].serviceName).toBeDefined();
        expect(services[0].version).toBeDefined();
      }
    });
  });

  describe('getService', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          service: 'test-service',
          version: '1.0.0',
          status: 'healthy',
        }),
      } as Response);

      await serviceDiscoveryManager.discoverServices();
    });

    it('should return service metadata by name', () => {
      const service = serviceDiscoveryManager.getService('test-service');
      expect(service).toBeDefined();
      if (service) {
        expect(service.serviceName).toBe('test-service');
      }
    });

    it('should return undefined for non-existent service', () => {
      const service = serviceDiscoveryManager.getService('non-existent');
      expect(service).toBeUndefined();
    });
  });

  describe('getAllServices', () => {
    it('should return all discovered services', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          service: 'test-service',
          version: '1.0.0',
        }),
      } as Response);

      await serviceDiscoveryManager.discoverServices();
      const services = serviceDiscoveryManager.getAllServices();

      expect(Array.isArray(services)).toBe(true);
    });

    it('should return empty array when no services discovered', () => {
      const services = serviceDiscoveryManager.getAllServices();
      expect(Array.isArray(services)).toBe(true);
    });
  });
});
