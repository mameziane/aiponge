import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockDiscoveryClient = vi.hoisted(() => ({
  discover: vi.fn(),
  listServices: vi.fn(),
  register: vi.fn(),
  deregister: vi.fn(),
}));

const mockHttpClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  getWithResponse: vi.fn(),
  postWithResponse: vi.fn(),
  putWithResponse: vi.fn(),
  patchWithResponse: vi.fn(),
  deleteWithResponse: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  serviceRegistrationClient: mockDiscoveryClient,
  createHttpClient: () => mockHttpClient,
  HttpClient: vi.fn(),
  signUserIdHeader: vi.fn((userId: string, role?: string) => ({
    'x-user-id': userId,
    'x-user-role': role || 'user',
    'x-user-id-signature': 'mock-sig',
    'x-user-id-timestamp': '12345',
  })),
  ServiceLocator: {
    getServicePort: vi.fn().mockReturnValue(3000),
  },
  serializeError: vi.fn((e: unknown) => ({ message: (e as Error)?.message || 'error' })),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
      if (cause) this.cause = cause;
    }
  },
  createHttpClient: () => mockHttpClient,
}));

vi.mock('@aiponge/platform-core', () => ({
  ServiceRegistry: vi.fn(),
  hasService: vi.fn(),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  extractErrorInfo: vi.fn(),
  getCorrelationId: vi.fn(),
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}));

vi.mock('../config/GatewayConfig', () => ({
  GatewayConfig: {
    http: {
      defaults: { timeout: 5000, retries: 2 },
      longRunning: { timeout: 30000, retries: 1 },
      aggregation: { timeout: 10000, retries: 2 },
    },
  },
}));

vi.mock('../presentation/utils/response-helpers', () => ({
  ServiceErrors: {
    fromException: vi.fn(),
  },
}));

import { DynamicRouter, type RouteConfig } from '../services/DynamicRouter';

describe('DynamicRouter', () => {
  let router: DynamicRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new DynamicRouter();
  });

  describe('initialization', () => {
    it('should initialize with predefined AI service routes', () => {
      const routes = router.getAllRoutes();
      expect(routes.length).toBeGreaterThan(0);
    });

    it('should log initialization message', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'DynamicRouter initialized with shared service discovery',
      );
    });

    it('should have routes for known service paths', () => {
      const routePaths = router.getAllRoutes().map(r => r.path);
      expect(routePaths).toContain('/api/providers/*');
      expect(routePaths).toContain('/api/music/*');
      expect(routePaths).toContain('/api/users/*');
      expect(routePaths).toContain('/api/storage/*');
    });
  });

  describe('route registration', () => {
    it('should register a new route with addRoute', () => {
      const config: RouteConfig = {
        path: '/api/custom/*',
        serviceName: 'custom-service',
        timeout: 5000,
      };
      router.addRoute(config);

      const result = router.getRouteConfig('/api/custom/test');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('custom-service');
    });

    it('should register routes with path parameters', () => {
      const config: RouteConfig = {
        path: '/api/users/:id',
        serviceName: 'user-service',
      };
      router.addRoute(config);

      const result = router.getRouteConfig('/api/users/123');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('user-service');
    });

    it('should register wildcard pattern routes', () => {
      const config: RouteConfig = {
        path: '/api/wildcard/*',
        serviceName: 'wildcard-service',
      };
      router.addRoute(config);

      const result = router.getRouteConfig('/api/wildcard/any/deep/path');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('wildcard-service');
    });

    it('should handle duplicate route registration by overwriting', () => {
      const config1: RouteConfig = {
        path: '/api/dup/*',
        serviceName: 'service-a',
      };
      const config2: RouteConfig = {
        path: '/api/dup/*',
        serviceName: 'service-b',
      };
      router.addRoute(config1);
      router.addRoute(config2);

      const exactMatch = router.getRouteConfig('/api/dup/*');
      expect(exactMatch!.serviceName).toBe('service-b');
    });

    it('should register routes with all optional config fields', () => {
      const config: RouteConfig = {
        path: '/api/full/*',
        serviceName: 'full-service',
        rewritePath: '/rewritten',
        stripPrefix: true,
        timeout: 10000,
        retries: 3,
        requiresAuth: true,
        rateLimit: { windowMs: 60000, max: 100 },
        headers: { 'X-Custom': 'value' },
      };
      router.addRoute(config);

      const result = router.getRouteConfig('/api/full/something');
      expect(result).not.toBeNull();
      expect(result!.timeout).toBe(10000);
      expect(result!.retries).toBe(3);
      expect(result!.requiresAuth).toBe(true);
      expect(result!.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('should sort routes by specificity after adding', () => {
      router.addRoute({ path: '/api/generic/*', serviceName: 'generic' });
      router.addRoute({ path: '/api/generic/specific', serviceName: 'specific' });

      const result = router.getRouteConfig('/api/generic/specific');
      expect(result!.serviceName).toBe('specific');
    });
  });

  describe('route removal', () => {
    it('should remove a registered route', () => {
      const config: RouteConfig = {
        path: '/api/removable/*',
        serviceName: 'removable-service',
      };
      router.addRoute(config);
      expect(router.getRouteConfig('/api/removable/test')).not.toBeNull();

      const removed = router.removeRoute('/api/removable/*');
      expect(removed).toBe(true);
    });

    it('should return false when removing non-existent route', () => {
      const removed = router.removeRoute('/api/nonexistent/*');
      expect(removed).toBe(false);
    });
  });

  describe('route matching', () => {
    it('should match exact paths', () => {
      const result = router.getRouteConfig('/api/templates');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('ai-config-service');
    });

    it('should match wildcard paths', () => {
      const result = router.getRouteConfig('/api/providers/openai');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('ai-config-service');
    });

    it('should match deep wildcard paths', () => {
      const result = router.getRouteConfig('/api/music/tracks/123/download');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('music-service');
    });

    it('should return null for unregistered paths', () => {
      const result = router.getRouteConfig('/api/unknown/path');
      expect(result).toBeNull();
    });

    it('should prioritize exact matches over wildcard matches', () => {
      const result = router.getRouteConfig('/api/frameworks');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('ai-config-service');
      expect(result!.path).toBe('/api/frameworks');
    });

    it('should match parameterized routes', () => {
      router.addRoute({
        path: '/api/items/:id',
        serviceName: 'item-service',
      });

      const result = router.getRouteConfig('/api/items/abc-123');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('item-service');
    });

    it('should not match partial paths without wildcard', () => {
      const result = router.getRouteConfig('/api/templates/extra/deep');
      expect(result).not.toBeNull();
      expect(result!.path).toBe('/api/templates/*');
    });

    it('should match version path', () => {
      const result = router.getRouteConfig('/version');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('system-service');
    });
  });

  describe('service resolution via routeRequest middleware', () => {
    const createMockReq = (method: string, path: string, body?: Record<string, unknown>) => ({
      method,
      path,
      body: body || {},
      headers: {} as Record<string, string>,
      get: vi.fn(),
    });

    const createMockRes = () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        headersSent: false,
        locals: {} as Record<string, unknown>,
      };
      return res;
    };

    it('should call next() for unmatched routes', async () => {
      const req = createMockReq('GET', '/api/unknown');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 503 when service discovery returns null', async () => {
      mockDiscoveryClient.discover.mockResolvedValue(null);
      vi.mocked(
        (await import('@aiponge/platform-core')).ServiceLocator.getServicePort,
      ).mockReturnValue(undefined as unknown as number);

      const req = createMockReq('GET', '/api/music/tracks');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Service Unavailable',
        }),
      );
    });

    it('should proxy GET requests to discovered service', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'music-service',
        host: 'localhost',
        port: 4000,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { tracks: [] },
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/music/tracks');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(mockHttpClient.getWithResponse).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ tracks: [] });
    });

    it('should proxy POST requests with body', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.postWithResponse.mockResolvedValue({
        data: { id: '123', success: true },
        status: 201,
        headers: {},
      });

      const req = createMockReq('POST', '/api/users/register', {
        email: 'test@test.com',
      });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(mockHttpClient.postWithResponse).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should proxy PUT requests', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.putWithResponse.mockResolvedValue({
        data: { updated: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('PUT', '/api/users/123', { name: 'Updated' });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(mockHttpClient.putWithResponse).toHaveBeenCalled();
    });

    it('should proxy PATCH requests', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.patchWithResponse.mockResolvedValue({
        data: { patched: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('PATCH', '/api/users/123', { name: 'Patched' });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(mockHttpClient.patchWithResponse).toHaveBeenCalled();
    });

    it('should proxy DELETE requests', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.deleteWithResponse.mockResolvedValue({
        data: { deleted: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('DELETE', '/api/users/123');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(mockHttpClient.deleteWithResponse).toHaveBeenCalled();
    });

    it('should set gateway response headers', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'music-service',
        host: 'localhost',
        port: 4000,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/music/tracks');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('x-gateway-service', 'api-gateway');
      expect(res.setHeader).toHaveBeenCalledWith('x-target-service', 'music-service');
      expect(res.setHeader).toHaveBeenCalledWith('x-served-by', 'music-service');
    });

    it('should sign user ID headers for authenticated requests', async () => {
      const { signUserIdHeader } = await import('@aiponge/platform-core');
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/users/me');
      const res = createMockRes();
      res.locals = { authenticated: true, userId: 'user-123', userRole: 'admin' };
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(signUserIdHeader).toHaveBeenCalledWith('user-123', 'admin');
    });

    it('should not sign user ID headers for unauthenticated requests', async () => {
      const { signUserIdHeader } = await import('@aiponge/platform-core');
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/users/me');
      const res = createMockRes();
      res.locals = {};
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(signUserIdHeader).not.toHaveBeenCalled();
    });

    it('should strip client-supplied auth headers before forwarding', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/users/me');
      req.headers = {
        'x-user-id': 'spoofed-id',
        'x-user-role': 'admin',
        'x-user-id-signature': 'fake-sig',
        'x-user-id-timestamp': 'fake-ts',
        'x-gateway-service': 'fake-gateway',
        'content-type': 'application/json',
      };
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      const callArgs = mockHttpClient.getWithResponse.mock.calls[0];
      const forwardedHeaders = callArgs[1].headers;
      expect(forwardedHeaders['x-user-id']).toBeUndefined();
      expect(forwardedHeaders['x-user-role']).toBeUndefined();
      expect(forwardedHeaders['x-user-id-signature']).toBeUndefined();
      expect(forwardedHeaders['content-type']).toBe('application/json');
    });

    it('should fallback to ServiceLocator when discovery returns null', async () => {
      const { ServiceLocator } = await import('@aiponge/platform-core');
      mockDiscoveryClient.discover.mockResolvedValue(null);
      vi.mocked(ServiceLocator.getServicePort).mockReturnValue(5000);
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/music/tracks');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(ServiceLocator.getServicePort).toHaveBeenCalledWith('music-service');
      expect(mockHttpClient.getWithResponse).toHaveBeenCalled();
    });

    it('should handle backend error responses (4xx)', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'user-service',
        host: 'localhost',
        port: 4001,
        healthy: true,
      });
      mockHttpClient.postWithResponse.mockRejectedValue({
        context: {
          status: 409,
          data: { error: 'Conflict', message: 'Already exists' },
        },
        message: 'Request failed',
      });

      const req = createMockReq('POST', '/api/users/register', { email: 'test@test.com' });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Conflict', message: 'Already exists' });
    });
  });

  describe('buildTargetPath (tested via routeRequest)', () => {
    it('should strip prefix when stripPrefix is true', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'ai-content-service',
        host: 'localhost',
        port: 4002,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: {},
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/content/generate');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      const calledUrl = mockHttpClient.getWithResponse.mock.calls[0][0];
      expect(calledUrl).not.toContain('/api/content/api/content');
    });

    it('should preserve path when stripPrefix is false', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'music-service',
        host: 'localhost',
        port: 4000,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: {},
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/music/tracks');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      const calledUrl = mockHttpClient.getWithResponse.mock.calls[0][0];
      expect(calledUrl).toContain('/api/music/tracks');
    });
  });

  describe('metrics', () => {
    it('should return initial metrics', () => {
      const metrics = router.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
    });

    it('should track successful requests', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'music-service',
        host: 'localhost',
        port: 4000,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: {},
      });

      const req = createMockReq('GET', '/api/music/tracks');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      const metrics = router.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
    });

    it('should track failed requests', async () => {
      mockDiscoveryClient.discover.mockResolvedValue(null);
      vi.mocked(
        (await import('@aiponge/platform-core')).ServiceLocator.getServicePort,
      ).mockReturnValue(undefined as unknown as number);

      const req = createMockReq('GET', '/api/music/tracks');
      const res = createMockRes();
      const next = vi.fn();

      const middleware = router.routeRequest();
      await middleware(req as unknown as Request, res as unknown as Response, next);

      const metrics = router.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
    });

    it('should clear metrics', () => {
      router.clearMetrics();
      const metrics = router.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
    });

    it('should track requests by service name', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'music-service',
        host: 'localhost',
        port: 4000,
        healthy: true,
      });
      mockHttpClient.getWithResponse.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: {},
      });

      const middleware = router.routeRequest();

      await middleware(
        createMockReq('GET', '/api/music/tracks') as unknown as Request,
        createMockRes() as unknown as Response,
        vi.fn(),
      );
      await middleware(
        createMockReq('GET', '/api/music/albums') as unknown as Request,
        createMockRes() as unknown as Response,
        vi.fn(),
      );

      const metrics = router.getMetrics();
      expect(metrics.requestsByService.get('music-service')).toBe(2);
    });
  });

  describe('service discovery methods', () => {
    it('should return available services from discovery client', async () => {
      const mockServices = [
        { name: 'service-a', host: 'localhost', port: 3000 },
        { name: 'service-b', host: 'localhost', port: 3001 },
      ];
      mockDiscoveryClient.listServices.mockResolvedValue(mockServices);

      const services = await router.getAvailableServices();
      expect(services).toEqual(mockServices);
    });

    it('should return empty array when discovery fails', async () => {
      mockDiscoveryClient.listServices.mockRejectedValue(new Error('Connection refused'));

      const services = await router.getAvailableServices();
      expect(services).toEqual([]);
    });

    it('should check discovery health', async () => {
      mockDiscoveryClient.listServices.mockResolvedValue([]);
      const healthy = await router.isDiscoveryHealthy();
      expect(healthy).toBe(true);
    });

    it('should report unhealthy when discovery fails', async () => {
      mockDiscoveryClient.listServices.mockRejectedValue(new Error('fail'));
      const healthy = await router.isDiscoveryHealthy();
      expect(healthy).toBe(false);
    });

    it('should get service stats', async () => {
      mockDiscoveryClient.discover.mockResolvedValue({
        name: 'music-service',
        host: 'localhost',
        port: 4000,
        metadata: { version: '1.0.0' },
      });

      const stats = await router.getServiceStats('music-service');
      expect(stats).not.toBeNull();
      expect(stats!.name).toBe('music-service');
      expect(stats!.url).toBe('http://localhost:4000');
    });

    it('should return null for service stats when discovery fails', async () => {
      mockDiscoveryClient.discover.mockRejectedValue(new Error('fail'));
      const stats = await router.getServiceStats('unknown-service');
      expect(stats).toBeNull();
    });

    it('should return null for service stats when service not found', async () => {
      mockDiscoveryClient.discover.mockResolvedValue(null);
      const stats = await router.getServiceStats('unknown-service');
      expect(stats).toBeNull();
    });
  });

  describe('getAllRoutes', () => {
    it('should return all registered routes', () => {
      const routes = router.getAllRoutes();
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
      routes.forEach(route => {
        expect(route).toHaveProperty('path');
        expect(route).toHaveProperty('config');
        expect(route.config).toHaveProperty('serviceName');
      });
    });
  });

  describe('destroy', () => {
    it('should clean up resources without errors', () => {
      expect(() => router.destroy()).not.toThrow();
    });

    it('should log cleanup message', () => {
      router.destroy();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('DynamicRouter resources cleaned up'),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long paths', () => {
      const longPath = '/api/music/' + 'segment/'.repeat(50) + 'final';
      const result = router.getRouteConfig(longPath);
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('music-service');
    });

    it('should return null for empty path', () => {
      const result = router.getRouteConfig('');
      expect(result).toBeNull();
    });

    it('should return null for root path', () => {
      const result = router.getRouteConfig('/');
      expect(result).toBeNull();
    });

    it('should handle paths with special characters in segments', () => {
      router.addRoute({
        path: '/api/search/*',
        serviceName: 'search-service',
      });
      const result = router.getRouteConfig('/api/search/hello%20world');
      expect(result).not.toBeNull();
      expect(result!.serviceName).toBe('search-service');
    });

    it('should match the correct service for overlapping routes', () => {
      const templatesExact = router.getRouteConfig('/api/templates');
      const templatesWild = router.getRouteConfig('/api/templates/some-id');

      expect(templatesExact).not.toBeNull();
      expect(templatesWild).not.toBeNull();
      expect(templatesExact!.serviceName).toBe('ai-config-service');
      expect(templatesWild!.serviceName).toBe('ai-config-service');
    });

    it('should handle path with dots', () => {
      router.addRoute({
        path: '/api/files/*',
        serviceName: 'file-service',
      });
      const result = router.getRouteConfig('/api/files/document.pdf');
      expect(result).not.toBeNull();
    });
  });

  describe('route pattern specificity', () => {
    it('should prefer more specific routes', () => {
      router.addRoute({ path: '/api/test/specific/endpoint', serviceName: 'specific-service' });
      router.addRoute({ path: '/api/test/*', serviceName: 'generic-service' });

      const result = router.getRouteConfig('/api/test/specific/endpoint');
      expect(result!.serviceName).toBe('specific-service');
    });

    it('should match wildcard when no exact match exists', () => {
      router.addRoute({ path: '/api/test/specific/endpoint', serviceName: 'specific-service' });
      router.addRoute({ path: '/api/test/*', serviceName: 'generic-service' });

      const result = router.getRouteConfig('/api/test/other/endpoint');
      expect(result!.serviceName).toBe('generic-service');
    });
  });

  function createMockReq(method: string, path: string, body?: Record<string, unknown>) {
    return {
      method,
      path,
      body: body || {},
      headers: {} as Record<string, string>,
      get: vi.fn(),
    };
  }

  function createMockRes() {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      headersSent: false,
      locals: {} as Record<string, unknown>,
    };
    return res;
  }
});
