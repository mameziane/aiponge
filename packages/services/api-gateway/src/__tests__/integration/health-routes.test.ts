import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { HealthRoutes } from '../../presentation/routes/health.routes';
import { Request, Response } from 'express';

vi.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/metrics', () => ({
  metrics: {
    recordRequest: vi.fn(),
    recordError: vi.fn(),
  },
  prometheusHandler: vi.fn((_req: Request, res: Response) => res.status(200).send('# HELP prometheus_mock')),
}));

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
    serviceRegistrationClient: {
      register: vi.fn(),
      deregister: vi.fn(),
      discoverServices: vi.fn().mockResolvedValue([]),
      getServiceHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
    },
    ServiceLocator: {
      getServiceUrl: vi.fn((service: string) => `http://localhost:3020`),
      getServicePort: vi.fn((service: string) => 3020),
    },
  };
});

vi.mock('../../config/environment', () => ({
  environmentConfig: {
    port: 3001,
    env: 'test',
    defaultRequestTimeoutMs: 5000,
  },
  getServiceUrl: vi.fn((service: string) => `http://localhost:3020`),
  getAllEnabledServices: vi.fn(() => ['user-service', 'system-service']),
  isServiceEnabled: vi.fn((service: string) => true),
}));

type RouterStack = { stack: Array<Record<string, unknown>> };
type HealthRoutesWithRouter = { router: RouterStack };

function getRouteHandler(router: RouterStack, path: string): Function {
  const layer = router.stack.find((l: Record<string, unknown>) => (l.route as Record<string, unknown>)?.path === path);
  return (
    (layer as Record<string, unknown>).route as Record<string, unknown> & { stack: Array<Record<string, unknown>> }
  ).stack[0].handle as Function;
}

function getRouteLayer(router: RouterStack, path: string): Record<string, unknown> | undefined {
  return router.stack.find((l: Record<string, unknown>) => (l.route as Record<string, unknown>)?.path === path);
}

describe('HealthRoutes', () => {
  let healthRoutes: HealthRoutes;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      headers: {},
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    healthRoutes = new HealthRoutes();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Health Check', () => {
    it('should return healthy status with uptime and memory info', async () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const healthCheckHandler = getRouteHandler(router, '/health');

      await healthCheckHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          version: expect.any(String),
          memory: expect.objectContaining({
            used: expect.any(Number),
            total: expect.any(Number),
            percentage: expect.any(Number),
          }),
        })
      );
    });

    it('should include memory usage percentage', async () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const healthCheckHandler = getRouteHandler(router, '/health');

      await healthCheckHandler(mockRequest, mockResponse);

      const responseCall = (mockResponse.json as Mock).mock.calls[0][0];
      expect(responseCall.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(responseCall.memory.percentage).toBeLessThanOrEqual(100);
    });

    it('should return 503 status on error', async () => {
      const originalUptime = process.uptime;
      process.uptime = (() => {
        throw new Error('Process error');
      }) as unknown as typeof process.uptime;

      const router = (healthRoutes as unknown as { router: { stack: Array<Record<string, unknown>> } }).router;
      const healthCheckHandler = getRouteHandler(router, '/health');

      await healthCheckHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Health check failed',
          }),
        })
      );

      process.uptime = originalUptime;
    });
  });

  describe('Readiness Check', () => {
    it('should return readiness status', async () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const readyCheckHandler = getRouteHandler(router, '/health/ready');

      await readyCheckHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalled();
      const statusCode = (mockResponse.status as Mock).mock.calls[0][0];
      const responseBody = (mockResponse.json as Mock).mock.calls[0][0];

      if (statusCode === 200) {
        expect(responseBody).toMatchObject({
          status: expect.any(String),
          timestamp: expect.any(String),
        });
      } else {
        expect(responseBody).toMatchObject({
          success: false,
          error: expect.objectContaining({
            message: expect.any(String),
          }),
        });
      }
    });
  });

  describe('Liveness Check', () => {
    it('should return alive status', async () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const liveCheckHandler = getRouteHandler(router, '/health/live');

      await liveCheckHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alive: true,
          service: 'api-gateway',
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('Router Configuration', () => {
    it('should have health endpoint registered', () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const healthRoute = getRouteLayer(router, '/health');
      expect(healthRoute).toBeDefined();
    });

    it('should have ready endpoint registered', () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const readyRoute = getRouteLayer(router, '/health/ready');
      expect(readyRoute).toBeDefined();
    });

    it('should have live endpoint registered', () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const liveRoute = getRouteLayer(router, '/health/live');
      expect(liveRoute).toBeDefined();
    });

    it('should have metrics endpoint registered', () => {
      const router = (healthRoutes as unknown as HealthRoutesWithRouter).router;
      const metricsRoute = getRouteLayer(router, '/health/metrics');
      expect(metricsRoute).toBeDefined();
    });
  });
});
