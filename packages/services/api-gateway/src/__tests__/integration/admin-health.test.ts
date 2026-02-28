/**
 * Admin Health Controller Integration Tests
 * Tests system health monitoring, metrics, diagnostics, and testing endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { adminRoutes } from '../../presentation/routes/admin.routes';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const mockHttpClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

const mockServiceDiscoveryClient = vi.hoisted(() => ({
  listServices: vi.fn(),
  discover: vi.fn(),
  register: vi.fn(),
}));

function getPortForService(service: string): number {
  const ports: Record<string, number> = {
    'api-gateway': 8080,
    'system-service': 3001,
    'user-service': 3020,
    'ai-analytics-service': 3032,
  };
  return ports[service] || 8080;
}

vi.mock('@aiponge/platform-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    HttpClient: vi.fn(() => mockHttpClient),
    createHttpClient: vi.fn(() => mockHttpClient),
    serviceRegistrationClient: mockServiceDiscoveryClient,
    getServiceUrl: vi.fn((service: string) => `http://localhost:${getPortForService(service)}`),
    getServicePort: vi.fn((service: string) => getPortForService(service)),
  };
});

// Mock GatewayConfig
vi.mock('../../config/GatewayConfig', () => ({
  GatewayConfig: {
    http: {
      defaults: {
        timeout: 5000,
        retries: 0,
      },
      aggregation: {
        timeout: 10000,
        retries: 0,
      },
      longRunning: {
        timeout: 30000,
        retries: 1,
      },
    },
    circuitBreaker: {
      defaults: {
        timeout: 5000,
        errorThreshold: 50,
        resetTimeout: 30000,
        volumeThreshold: 10,
      },
      getConfig: vi.fn((serviceName?: string) => ({
        timeout: 5000,
        errorThreshold: 50,
        resetTimeout: 30000,
        volumeThreshold: 10,
      })),
      global: {
        timeout: 5000,
        errorThreshold: 50,
        resetTimeout: 30000,
        volumeThreshold: 10,
      },
    },
    services: {
      getConfig: vi.fn((serviceName: string) => ({
        timeout: 5000,
        retries: 0,
        description: `Mock ${serviceName}`,
      })),
      getBaseUrl: vi.fn((serviceName: string) => `http://localhost:3000`),
      getAllServices: vi.fn(() => ['system-service', 'user-service']),
    },
    server: {
      port: 8080,
      host: '0.0.0.0',
      nodeEnv: 'test',
      logLevel: 'info',
    },
    monitoring: {
      healthCheckInterval: 30000,
      maxHeartbeatAge: 60000,
      serviceDiscoveryEnabled: false,
    },
    environment: {},
  },
}));

// Import after mocks
import { serviceRegistrationClient, createHttpClient } from '@aiponge/platform-core';
import { resilience } from '../../utils/CircuitBreakerManager';

describe('AdminHealthController Integration Tests', () => {
  let app: Express;
  let mockHttpClient: Record<string, ReturnType<typeof vi.fn>>;
  let mockDiscoveryClient: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    resilience.shutdownAll();

    // Get mock instances
    mockHttpClient = createHttpClient({});
    mockDiscoveryClient = serviceRegistrationClient;

    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
  });

  afterEach(() => {
    resilience.shutdownAll();
  });

  describe('GET /api/admin/circuit-breaker-stats', () => {
    it('should return circuit breaker statistics', async () => {
      const response = await request(app).get('/api/admin/circuit-breaker-stats').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakers');

      expect(response.body.data.summary).toMatchObject({
        totalBreakers: expect.any(Number),
        openBreakers: expect.any(Number),
        halfOpenBreakers: expect.any(Number),
        closedBreakers: expect.any(Number),
        totalFailures: expect.any(Number),
        totalSuccesses: expect.any(Number),
        totalTimeouts: expect.any(Number),
      });

      expect(Array.isArray(response.body.data.breakers)).toBe(true);
    });

    it('should return empty breakers when none exist', async () => {
      const response = await request(app).get('/api/admin/circuit-breaker-stats').expect(200);

      expect(response.body.data.summary.totalBreakers).toBe(0);
      expect(response.body.data.breakers).toHaveLength(0);
    });
  });

  describe('GET /api/admin/health-overview', () => {
    it('should aggregate system health data successfully', async () => {
      const mockServices = [
        { name: 'api-gateway', host: 'localhost', port: 3000, healthy: true },
        { name: 'user-service', host: 'localhost', port: 3002, healthy: true },
      ];

      const mockSystemMetrics = {
        uptime: 12345,
        memory: { used: 500, total: 1000 },
      };

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);
      mockHttpClient.get.mockResolvedValue(mockSystemMetrics);

      const response = await request(app).get('/api/admin/health-overview').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalServices: 2,
        activeServices: 2,
        healthyServices: 2,
        timestamp: expect.any(String),
        uptime: 12345,
        memory: { used: 500, total: 1000 },
      });
    });

    it('should handle system-service unavailability gracefully', async () => {
      const mockServices = [{ name: 'api-gateway', host: 'localhost', port: 8080, healthy: true }];

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);
      mockHttpClient.get.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app).get('/api/admin/health-overview').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalServices: 1,
        activeServices: 1,
        healthyServices: 1,
        timestamp: expect.any(String),
      });
    });

    it('should handle no services registered', async () => {
      mockDiscoveryClient.listServices.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const response = await request(app).get('/api/admin/health-overview').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalServices).toBe(0);
    });
  });

  describe('GET /api/admin/service-metrics', () => {
    it('should return service metrics', async () => {
      const mockServices = [
        { name: 'api-gateway', host: 'localhost', port: 8080, healthy: true },
        { name: 'user-service', host: 'localhost', port: 3020, healthy: true },
      ];

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);

      const response = await request(app).get('/api/admin/service-metrics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        services: expect.arrayContaining([
          expect.objectContaining({ name: 'api-gateway' }),
          expect.objectContaining({ name: 'user-service' }),
        ]),
        timestamp: expect.any(String),
      });
    });

    it('should handle service discovery failures', async () => {
      mockDiscoveryClient.listServices.mockRejectedValue(new Error('Discovery failed'));

      const response = await request(app).get('/api/admin/service-metrics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.services).toEqual([]);
    });
  });

  describe('GET /api/admin/system-topology', () => {
    it('should return system topology', async () => {
      const mockServices = [
        { name: 'api-gateway', host: 'localhost', port: 8080, healthy: true },
        { name: 'user-service', host: 'localhost', port: 3020, healthy: true },
      ];

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);

      const response = await request(app).get('/api/admin/system-topology').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        services: expect.any(Array),
        timestamp: expect.any(String),
      });
      expect(response.body.data.services.length).toBe(2);
    });
  });

  describe('GET /api/admin/quality-metrics', () => {
    it('should return quality metrics with AI data', async () => {
      const mockServices = [
        { name: 'api-gateway', host: 'localhost', port: 8080, healthy: true },
        { name: 'ai-analytics-service', host: 'localhost', port: 3032, healthy: true },
      ];

      const mockQualityData = {
        averageScore: 0.95,
        totalAnalyzed: 1000,
      };

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);
      mockDiscoveryClient.discover.mockResolvedValue([mockServices[1]]);
      mockHttpClient.get.mockResolvedValue(mockQualityData);

      const response = await request(app).get('/api/admin/quality-metrics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        timestamp: expect.any(String),
        services: expect.any(Array),
        aiQuality: mockQualityData,
      });
    });

    it('should handle AI analytics service unavailable', async () => {
      const mockServices = [{ name: 'api-gateway', host: 'localhost', port: 8080, healthy: true }];

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);
      mockDiscoveryClient.discover.mockResolvedValue([]);

      const response = await request(app).get('/api/admin/quality-metrics').expect(200);

      expect(response.body.success).toBe(true);
      // When service is unavailable, qualityData remains {} (empty object)
      expect(response.body.data.aiQuality).toEqual({});
    });

    it('should handle AI quality fetch failure', async () => {
      const mockServices = [{ name: 'ai-analytics-service', host: 'localhost', port: 3032, healthy: true }];

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);
      mockDiscoveryClient.discover.mockResolvedValue([mockServices[0]]);
      mockHttpClient.get.mockRejectedValue(new Error('Fetch failed'));

      const response = await request(app).get('/api/admin/quality-metrics').expect(200);

      expect(response.body.success).toBe(true);
      // When fetch fails, qualityData remains {} (empty object)
      expect(response.body.data.aiQuality).toEqual({});
    });
  });

  describe('GET /api/admin/system-diagnostics', () => {
    it('should return system diagnostics', async () => {
      const mockServices = [{ name: 'api-gateway', host: 'localhost', port: 8080, healthy: true }];

      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);

      const response = await request(app).get('/api/admin/system-diagnostics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        timestamp: expect.any(String),
        services: expect.any(Array),
      });
    });
  });

  describe('GET /api/admin/test-endpoints', () => {
    it('should return list of test endpoints', async () => {
      const response = await request(app).get('/api/admin/test-endpoints').expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      expect(response.body.data[0]).toMatchObject({
        name: expect.any(String),
        endpoint: expect.any(String),
        method: expect.any(String),
        description: expect.any(String),
      });
    });

    it('should include system health endpoint in list', async () => {
      const response = await request(app).get('/api/admin/test-endpoints').expect(200);

      const healthEndpoint = response.body.data.find((ep: Record<string, unknown>) => ep.endpoint === '/health');

      expect(healthEndpoint).toBeDefined();
      expect(healthEndpoint.method).toBe('GET');
    });
  });

  describe('POST /api/admin/test-endpoint', () => {
    it('should test GET endpoint successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: 'test' }),
      });

      const response = await request(app)
        .post('/api/admin/test-endpoint')
        .send({
          method: 'GET',
          endpoint: '/api/admin/test-endpoints',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/test-endpoints'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should test POST endpoint successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: 'created' }),
      });

      const response = await request(app)
        .post('/api/admin/test-endpoint')
        .send({
          method: 'POST',
          endpoint: '/api/admin/test-endpoint',
          body: { test: 'data' },
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ test: 'data' }),
        })
      );
    });

    it('should return error when endpoint is missing', async () => {
      const response = await request(app)
        .post('/api/admin/test-endpoint')
        .send({
          method: 'GET',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Endpoint is required');
    });

    it('should handle endpoint test failures', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/admin/test-endpoint')
        .send({
          method: 'GET',
          endpoint: '/api/admin/health-overview',
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Test endpoint failed');
    });
  });

  describe('Response Consistency', () => {
    it('should return consistent response format across endpoints', async () => {
      mockDiscoveryClient.listServices.mockResolvedValue([]);

      const endpoints = [
        '/api/admin/circuit-breaker-stats',
        '/api/admin/health-overview',
        '/api/admin/service-metrics',
        '/api/admin/system-topology',
        '/api/admin/quality-metrics',
        '/api/admin/system-diagnostics',
        '/api/admin/test-endpoints',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint).expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: expect.anything(),
          timestamp: expect.any(String),
        });
      }
    });
  });
});
