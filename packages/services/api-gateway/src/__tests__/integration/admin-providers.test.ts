/**
 * Admin Providers Controller Integration Tests
 * Tests provider management CRUD operations and configuration endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const mockHttpClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

const mockProvidersServiceClient = vi.hoisted(() => ({
  getProviderCatalog: vi.fn(),
  getProviderConfigurations: vi.fn(),
  getProviderConfiguration: vi.fn(),
  createProviderConfiguration: vi.fn(),
  updateProviderConfiguration: vi.fn(),
  deleteProviderConfiguration: vi.fn(),
  testProviderConfiguration: vi.fn(),
  healthCheckProvider: vi.fn(),
  setProviderAsPrimary: vi.fn(),
}));

function getPortForService(service: string): number {
  const ports: Record<string, number> = {
    'api-gateway': 8080,
    'ai-config-service': 3002,
  };
  return ports[service] || 8080;
}

vi.mock('@aiponge/platform-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    getServicePort: vi.fn((service: string) => getPortForService(service)),
    HttpClient: vi.fn(() => mockHttpClient),
    createHttpClient: vi.fn(() => mockHttpClient),
    createServiceHttpClient: vi.fn(() => mockHttpClient),
    serviceRegistrationClient: {
      listServices: vi.fn(),
      discover: vi.fn(),
      register: vi.fn(),
    },
    ServiceLocator: {
      getServiceUrl: vi.fn(() => 'http://localhost:3010'),
      getServicePort: vi.fn(() => 3010),
    },
    serializeError: vi.fn((e: unknown) => ({ message: (e as Error)?.message || 'unknown' })),
    withResilience: vi.fn((_name: string, fn: (...args: unknown[]) => unknown) => fn),
  };
});

vi.mock('../../clients/ProvidersServiceClient', () => {
  return {
    ProvidersServiceClient: class MockProvidersServiceClient {
      getProviderCatalog = mockProvidersServiceClient.getProviderCatalog;
      getProviderConfigurations = mockProvidersServiceClient.getProviderConfigurations;
      getProviderConfiguration = mockProvidersServiceClient.getProviderConfiguration;
      createProviderConfiguration = mockProvidersServiceClient.createProviderConfiguration;
      updateProviderConfiguration = mockProvidersServiceClient.updateProviderConfiguration;
      deleteProviderConfiguration = mockProvidersServiceClient.deleteProviderConfiguration;
      testProviderConfiguration = mockProvidersServiceClient.testProviderConfiguration;
      healthCheckProvider = mockProvidersServiceClient.healthCheckProvider;
      setProviderAsPrimary = mockProvidersServiceClient.setProviderAsPrimary;
    },
  };
});

vi.mock('../../services/MusicApiCreditsService', () => ({
  musicApiCreditsService: {
    getCredits: vi.fn(),
  },
}));

vi.mock('../../config/GatewayConfig', () => ({
  GatewayConfig: {
    http: {
      defaults: { timeout: 5000, retries: 0 },
      aggregation: { timeout: 10000, retries: 0 },
      longRunning: { timeout: 30000, retries: 1 },
    },
    circuitBreaker: {
      defaults: {
        timeout: 5000,
        errorThreshold: 50,
        resetTimeout: 30000,
        volumeThreshold: 10,
      },
      getConfig: vi.fn(() => ({
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
      getBaseUrl: vi.fn(() => `http://localhost:3000`),
      getAllServices: vi.fn(() => ['ai-config-service']),
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

import request from 'supertest';
import express, { Express, Router } from 'express';
import { AdminProvidersController } from '../../presentation/controllers/AdminProvidersController';

describe('AdminProvidersController Integration Tests', () => {
  let app: Express;
  let controller: AdminProvidersController;

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new AdminProvidersController();

    const router = Router();
    router.get('/providers', (req, res) => controller.getProviders(req, res));
    router.get('/ai/providers/config', (req, res) => controller.getAIProvidersConfig(req, res));
    router.get('/provider-configurations', (req, res) => controller.getProviderConfigurations(req, res));
    router.get('/provider-configurations/:id', (req, res) => controller.getProviderConfigurationById(req, res));
    router.post('/provider-configurations', (req, res) => controller.createProviderConfiguration(req, res));
    router.patch('/provider-configurations/:id', (req, res) => controller.updateProviderConfiguration(req, res));
    router.delete('/provider-configurations/:id', (req, res) => controller.deleteProviderConfiguration(req, res));
    router.post('/provider-configurations/:id/test', (req, res) => controller.testProviderConfiguration(req, res));
    router.post('/provider-configurations/:id/health-check', (req, res) => controller.healthCheckProviderConfiguration(req, res));
    router.post('/provider-configurations/:id/set-primary', (req, res) => controller.setProviderAsPrimary(req, res));

    app = express();
    app.use(express.json());
    app.use('/api/admin', router);
  });

  describe('GET /api/admin/providers', () => {
    it('should get all provider configurations', async () => {
      const mockProviders = {
        success: true,
        data: {
          llm: [
            { id: '1', name: 'OpenAI', models: ['gpt-4', 'gpt-3.5-turbo'] },
            { id: '2', name: 'Anthropic', models: ['claude-3'] },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      mockProvidersServiceClient.getProviderCatalog.mockResolvedValue(mockProviders);

      const response = await request(app).get('/api/admin/providers').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.llm).toHaveLength(2);
      expect(mockProvidersServiceClient.getProviderCatalog).toHaveBeenCalledWith();
    });

    it('should handle provider service failure', async () => {
      mockProvidersServiceClient.getProviderCatalog.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app).get('/api/admin/providers').expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to fetch providers');
    });
  });

  describe('GET /api/admin/ai/providers/config', () => {
    it('should get AI provider configurations', async () => {
      const mockAIProviders = {
        success: true,
        data: {
          llm: [{ id: '1', name: 'OpenAI', description: 'OpenAI GPT models' }],
        },
        timestamp: new Date().toISOString(),
      };

      mockProvidersServiceClient.getProviderCatalog.mockResolvedValue(mockAIProviders);

      const response = await request(app).get('/api/admin/ai/providers/config').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.llm).toBeDefined();
      expect(mockProvidersServiceClient.getProviderCatalog).toHaveBeenCalledWith('llm');
    });

    it('should handle AI provider config fetch failure', async () => {
      mockProvidersServiceClient.getProviderCatalog.mockRejectedValue(new Error('Fetch failed'));

      const response = await request(app).get('/api/admin/ai/providers/config').expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to fetch AI providers config');
    });
  });

  describe('GET /api/admin/provider-configurations', () => {
    it('should get provider configurations without filters', async () => {
      const mockConfigs = {
        success: true,
        data: [
          { id: '1', name: 'OpenAI Config', type: 'llm' },
          { id: '2', name: 'Anthropic Config', type: 'llm' },
        ],
      };

      mockProvidersServiceClient.getProviderConfigurations.mockResolvedValue(mockConfigs);

      const response = await request(app).get('/api/admin/provider-configurations').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(mockProvidersServiceClient.getProviderConfigurations).toHaveBeenCalledWith(undefined, false);
    });

    it('should get provider configurations with type filter', async () => {
      const mockConfigs = {
        success: true,
        data: [{ id: '1', name: 'OpenAI Config', type: 'llm' }],
      };

      mockProvidersServiceClient.getProviderConfigurations.mockResolvedValue(mockConfigs);

      const response = await request(app).get('/api/admin/provider-configurations?type=llm').expect(200);

      expect(response.body.success).toBe(true);
      expect(mockProvidersServiceClient.getProviderConfigurations).toHaveBeenCalledWith('llm', false);
    });

    it('should get provider configurations with analytics', async () => {
      const mockConfigs = {
        success: true,
        data: [{ id: '1', name: 'OpenAI Config', analytics: { requests: 100 } }],
      };

      mockProvidersServiceClient.getProviderConfigurations.mockResolvedValue(mockConfigs);

      const response = await request(app).get('/api/admin/provider-configurations?includeAnalytics=true').expect(200);

      expect(response.body.success).toBe(true);
      expect(mockProvidersServiceClient.getProviderConfigurations).toHaveBeenCalledWith(undefined, true);
    });

    it('should handle configuration fetch failure', async () => {
      mockProvidersServiceClient.getProviderConfigurations.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/admin/provider-configurations').expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to fetch provider configurations');
    });
  });

  describe('GET /api/admin/provider-configurations/:id', () => {
    it('should get provider configuration by ID', async () => {
      const mockConfig = {
        id: 'provider-1',
        name: 'OpenAI Production',
        type: 'llm',
        apiKey: '***',
      };

      mockProvidersServiceClient.getProviderConfiguration.mockResolvedValue(mockConfig);

      const response = await request(app).get('/api/admin/provider-configurations/provider-1').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('provider-1');
      expect(mockProvidersServiceClient.getProviderConfiguration).toHaveBeenCalledWith('provider-1');
    });

    it('should handle non-existent provider ID', async () => {
      mockProvidersServiceClient.getProviderConfiguration.mockRejectedValue(new Error('Not found'));

      const response = await request(app).get('/api/admin/provider-configurations/non-existent').expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to fetch provider configuration');
    });
  });

  describe('POST /api/admin/provider-configurations', () => {
    it('should create new provider configuration', async () => {
      const newConfig = {
        name: 'New OpenAI Config',
        type: 'llm',
        provider: 'openai',
        apiKey: 'sk-test123',
      };

      const createdConfig = {
        success: true,
        data: {
          id: 'provider-new',
          ...newConfig,
        },
      };

      mockProvidersServiceClient.createProviderConfiguration.mockResolvedValue(createdConfig);

      const response = await request(app).post('/api/admin/provider-configurations').send(newConfig).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('provider-new');
      expect(mockProvidersServiceClient.createProviderConfiguration).toHaveBeenCalledWith(newConfig);
    });

    it('should handle creation failure', async () => {
      mockProvidersServiceClient.createProviderConfiguration.mockRejectedValue(new Error('Validation failed'));

      const response = await request(app)
        .post('/api/admin/provider-configurations')
        .send({ name: 'Invalid' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to create provider configuration');
    });
  });

  describe('PATCH /api/admin/provider-configurations/:id', () => {
    it('should update provider configuration', async () => {
      const updateData = {
        name: 'Updated OpenAI Config',
        apiKey: 'sk-updated123',
      };

      const updatedConfig = {
        success: true,
        data: {
          id: 'provider-1',
          ...updateData,
        },
      };

      mockProvidersServiceClient.updateProviderConfiguration.mockResolvedValue(updatedConfig);

      const response = await request(app)
        .patch('/api/admin/provider-configurations/provider-1')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('provider-1');
      expect(mockProvidersServiceClient.updateProviderConfiguration).toHaveBeenCalledWith('provider-1', updateData);
    });

    it('should handle update failure', async () => {
      mockProvidersServiceClient.updateProviderConfiguration.mockRejectedValue(new Error('Not found'));

      const response = await request(app)
        .patch('/api/admin/provider-configurations/non-existent')
        .send({ name: 'Updated' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to update provider configuration');
    });
  });

  describe('DELETE /api/admin/provider-configurations/:id', () => {
    it('should delete provider configuration', async () => {
      mockProvidersServiceClient.deleteProviderConfiguration.mockResolvedValue({ success: true });

      const response = await request(app).delete('/api/admin/provider-configurations/provider-1').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Provider configuration deleted successfully');
      expect(mockProvidersServiceClient.deleteProviderConfiguration).toHaveBeenCalledWith('provider-1');
    });

    it('should handle deletion failure', async () => {
      mockProvidersServiceClient.deleteProviderConfiguration.mockRejectedValue(new Error('Provider in use'));

      const response = await request(app).delete('/api/admin/provider-configurations/provider-1').expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to delete provider configuration');
    });
  });

  describe('POST /api/admin/provider-configurations/:id/test', () => {
    it('should test provider configuration successfully', async () => {
      const testPayload = { prompt: 'test' };
      const testResult = {
        success: true,
        latencyMs: 250,
        response: { message: 'Test successful' },
      };

      mockProvidersServiceClient.getProviderConfiguration.mockResolvedValue({
        id: 'provider-1',
        providerType: 'other',
      });
      mockProvidersServiceClient.testProviderConfiguration.mockResolvedValue(testResult);

      const response = await request(app)
        .post('/api/admin/provider-configurations/provider-1/test')
        .send(testPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.latencyMs).toBe(250);
      expect(mockProvidersServiceClient.testProviderConfiguration).toHaveBeenCalledWith('provider-1', testPayload);
    });

    it('should handle test failure', async () => {
      mockProvidersServiceClient.testProviderConfiguration.mockRejectedValue(new Error('Connection timeout'));

      const response = await request(app)
        .post('/api/admin/provider-configurations/provider-1/test')
        .send({ prompt: 'test' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to test provider configuration');
    });
  });

  describe('POST /api/admin/provider-configurations/:id/health-check', () => {
    it('should perform health check successfully', async () => {
      const healthResult = {
        status: 'healthy',
        latencyMs: 150,
        timestamp: new Date().toISOString(),
      };

      mockProvidersServiceClient.healthCheckProvider.mockResolvedValue(healthResult);

      const response = await request(app)
        .post('/api/admin/provider-configurations/provider-1/health-check')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(mockProvidersServiceClient.healthCheckProvider).toHaveBeenCalledWith('provider-1');
    });

    it('should handle unhealthy provider', async () => {
      const healthResult = {
        status: 'unhealthy',
        error: 'Connection refused',
      };

      mockProvidersServiceClient.healthCheckProvider.mockResolvedValue(healthResult);

      const response = await request(app)
        .post('/api/admin/provider-configurations/provider-1/health-check')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('unhealthy');
    });

    it('should handle health check failure', async () => {
      mockProvidersServiceClient.healthCheckProvider.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/api/admin/provider-configurations/provider-1/health-check')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to health check provider configuration');
    });
  });

  describe('POST /api/admin/provider-configurations/:id/set-primary', () => {
    it('should set provider as primary', async () => {
      const setPrimaryData = { type: 'llm' };
      const result = {
        success: true,
        message: 'Provider set as primary',
        previousPrimary: 'provider-2',
      };

      mockProvidersServiceClient.setProviderAsPrimary.mockResolvedValue(result);

      const response = await request(app)
        .post('/api/admin/provider-configurations/provider-1/set-primary')
        .send(setPrimaryData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.previousPrimary).toBe('provider-2');
      expect(mockProvidersServiceClient.setProviderAsPrimary).toHaveBeenCalledWith('provider-1', setPrimaryData);
    });

    it('should handle set primary failure', async () => {
      mockProvidersServiceClient.setProviderAsPrimary.mockRejectedValue(new Error('Invalid provider type'));

      const response = await request(app)
        .post('/api/admin/provider-configurations/provider-1/set-primary')
        .send({ type: 'invalid' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to set provider as primary');
    });
  });

  describe('Response Consistency', () => {
    it('should return consistent response format for success cases', async () => {
      mockProvidersServiceClient.getProviderCatalog.mockResolvedValue({
        success: true,
        data: {},
      });

      const response = await request(app).get('/api/admin/providers').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.anything(),
        timestamp: expect.any(String),
      });
    });

    it('should return consistent error response format', async () => {
      mockProvidersServiceClient.getProviderCatalog.mockRejectedValue(new Error('Service error'));

      const response = await request(app).get('/api/admin/providers').expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.any(String),
        }),
        timestamp: expect.any(String),
      });
    });
  });
});
