import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockHttpClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  serviceRegistrationClient: {},
  createHttpClient: () => mockHttpClient,
  serializeError: (e: unknown) => String(e),
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
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

import { ReverseProxy, type ProxyRequest } from '../services/ReverseProxy';

describe('ReverseProxy', () => {
  let proxy: ReverseProxy;

  beforeEach(() => {
    vi.clearAllMocks();
    proxy = new ReverseProxy();
  });

  function makeRequest(overrides: Partial<ProxyRequest> = {}): ProxyRequest {
    return {
      path: '/api/users',
      method: 'GET',
      headers: {},
      ...overrides,
    };
  }

  describe('Constructor & Configuration', () => {
    it('should use default options when none provided', () => {
      const stats = proxy.getStats();
      expect(stats.timeout).toBe(10000);
      expect(stats.keepAlive).toBe(true);
      expect(stats.maxSockets).toBe(100);
      expect(stats.circuitBreakerEnabled).toBe(true);
    });

    it('should accept custom options', () => {
      const customProxy = new ReverseProxy({
        timeout: 5000,
        keepAlive: false,
        maxSockets: 50,
        circuitBreakerEnabled: false,
      });
      const stats = customProxy.getStats();
      expect(stats.timeout).toBe(5000);
      expect(stats.keepAlive).toBe(false);
      expect(stats.maxSockets).toBe(50);
      expect(stats.circuitBreakerEnabled).toBe(false);
    });

    it('should log initialization debug message', () => {
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('REQUEST PROXYING', () => {
    it('should forward GET requests with serviceName', async () => {
      mockHttpClient.get.mockResolvedValue({ id: 1, name: 'John' });

      const result = await proxy.forward(
        makeRequest({ method: 'GET', path: '/api/users' }),
        'http://localhost:3000',
        'user-service'
      );

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ id: 1, name: 'John' });
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'http://localhost:3000/api/users',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should forward POST requests with body', async () => {
      mockHttpClient.post.mockResolvedValue({ id: 2 });

      const body = { name: 'Jane', email: 'jane@example.com' };
      const result = await proxy.forward(
        makeRequest({ method: 'POST', path: '/api/users', body }),
        'http://localhost:3000',
        'user-service'
      );

      expect(result.status).toBe(200);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'http://localhost:3000/api/users',
        body,
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should forward PUT requests with body', async () => {
      mockHttpClient.put.mockResolvedValue({ id: 1, name: 'Updated' });

      const body = { name: 'Updated' };
      const result = await proxy.forward(
        makeRequest({ method: 'PUT', path: '/api/users/1', body }),
        'http://localhost:3000',
        'user-service'
      );

      expect(result.status).toBe(200);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        body,
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should forward DELETE requests', async () => {
      mockHttpClient.delete.mockResolvedValue({ success: true });

      const result = await proxy.forward(
        makeRequest({ method: 'DELETE', path: '/api/users/1' }),
        'http://localhost:3000',
        'user-service'
      );

      expect(result.status).toBe(200);
      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should preserve request paths', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(makeRequest({ path: '/api/v2/users/123/profile' }), 'http://localhost:3000', 'user-service');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/users/123/profile',
        expect.any(Object)
      );
    });

    it('should append query parameters', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({
          path: '/api/users',
          query: { page: '1', limit: '10' },
        }),
        'http://localhost:3000',
        'user-service'
      );

      const calledUrl = mockHttpClient.get.mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('limit=10');
    });

    it('should return 503 for unsupported HTTP methods (PATCH)', async () => {
      const result = await proxy.forward(
        makeRequest({ method: 'PATCH', path: '/api/users/1', body: { name: 'x' } }),
        'http://localhost:3000',
        'user-service'
      );

      expect(result.status).toBe(503);
      expect(result.body).toEqual(expect.objectContaining({ error: 'Service unavailable' }));
    });

    it('should handle case-insensitive HTTP methods', async () => {
      mockHttpClient.get.mockResolvedValue({ ok: true });

      const result = await proxy.forward(makeRequest({ method: 'get' }), 'http://localhost:3000', 'user-service');

      expect(result.status).toBe(200);
      expect(mockHttpClient.get).toHaveBeenCalled();
    });
  });

  describe('HEADER FORWARDING', () => {
    it('should forward authorization headers', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({ headers: { authorization: 'Bearer token123' } }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers.authorization).toBe('Bearer token123');
    });

    it('should forward custom headers like x-correlation-id', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({ headers: { 'x-correlation-id': 'abc-123' } }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['x-correlation-id']).toBe('abc-123');
    });

    it('should forward content-type headers', async () => {
      mockHttpClient.post.mockResolvedValue({});

      await proxy.forward(
        makeRequest({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: { data: 'test' },
        }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.post.mock.calls[0][2];
      expect(calledOptions.headers['content-type']).toBe('application/json');
    });

    it('should remove Host header (hop-by-hop)', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({ headers: { host: 'gateway.example.com' } }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers.host).toBeUndefined();
    });

    it('should remove connection header (hop-by-hop)', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({ headers: { connection: 'keep-alive' } }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers.connection).toBeUndefined();
    });

    it('should add x-forwarded-for header', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({ headers: { 'x-forwarded-for': '192.168.1.1' } }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['x-forwarded-for']).toBe('192.168.1.1');
    });

    it('should add x-forwarded-proto header', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['x-forwarded-proto']).toBe('http');
    });

    it('should add x-forwarded-by header', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['x-forwarded-by']).toBe('api-gateway');
    });

    it('should set user-agent to gateway identifier', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['user-agent']).toBe('aiponge-Gateway/1.0');
    });

    it('should extract client IP from x-real-ip when x-forwarded-for is missing', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({ headers: { 'x-real-ip': '10.0.0.1' } }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['x-forwarded-for']).toBe('10.0.0.1');
    });

    it('should extract client IP from cf-connecting-ip as fallback', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(
        makeRequest({ headers: { 'cf-connecting-ip': '172.16.0.1' } }),
        'http://localhost:3000',
        'user-service'
      );

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['x-forwarded-for']).toBe('172.16.0.1');
    });

    it('should use "unknown" when no IP headers are present', async () => {
      mockHttpClient.get.mockResolvedValue({});

      await proxy.forward(makeRequest({ headers: {} }), 'http://localhost:3000', 'user-service');

      const calledOptions = mockHttpClient.get.mock.calls[0][1];
      expect(calledOptions.headers['x-forwarded-for']).toBe('unknown');
    });
  });

  describe('RESPONSE HANDLING', () => {
    it('should return upstream response body', async () => {
      const responseData = { users: [{ id: 1 }, { id: 2 }] };
      mockHttpClient.get.mockResolvedValue(responseData);

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.body).toEqual(responseData);
    });

    it('should return status 200 for successful service calls', async () => {
      mockHttpClient.get.mockResolvedValue({});

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.status).toBe(200);
    });

    it('should include upstream URL in response', async () => {
      mockHttpClient.get.mockResolvedValue({});

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.upstream).toBe('http://localhost:3000');
    });

    it('should include latency in response', async () => {
      mockHttpClient.get.mockResolvedValue({});

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.latency).toBeDefined();
      expect(typeof result.latency).toBe('number');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should handle direct request (no serviceName) with JSON response', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        text: vi.fn(),
      };
      const headersObj = {
        get: (key: string) => (key === 'content-type' ? 'application/json' : null),
        entries: () => [['content-type', 'application/json']],
      };
      const fetchResponse = {
        status: 200,
        headers: headersObj,
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        text: vi.fn(),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse));

      const result = await proxy.forward(
        makeRequest({ method: 'GET', path: '/external' }),
        'http://external-service.com'
      );

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ data: 'test' });

      vi.unstubAllGlobals();
    });

    it('should handle direct request with text response', async () => {
      const headersObj = {
        get: (key: string) => (key === 'content-type' ? 'text/plain' : null),
        entries: () => [['content-type', 'text/plain']],
      };
      const fetchResponse = {
        status: 200,
        headers: headersObj,
        json: vi.fn(),
        text: vi.fn().mockResolvedValue('plain text response'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse));

      const result = await proxy.forward(
        makeRequest({ method: 'GET', path: '/external' }),
        'http://external-service.com'
      );

      expect(result.status).toBe(200);
      expect(result.body).toBe('plain text response');

      vi.unstubAllGlobals();
    });

    it('should fallback to text when JSON parsing fails', async () => {
      const headersObj = {
        get: (key: string) => (key === 'content-type' ? 'application/json' : null),
        entries: () => [['content-type', 'application/json']],
      };
      const fetchResponse = {
        status: 200,
        headers: headersObj,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: vi.fn().mockResolvedValue('not valid json'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse));

      const result = await proxy.forward(
        makeRequest({ method: 'GET', path: '/external' }),
        'http://external-service.com'
      );

      expect(result.body).toBe('not valid json');

      vi.unstubAllGlobals();
    });

    it('should forward response headers from direct requests', async () => {
      const headersObj = {
        get: (key: string) => (key === 'content-type' ? 'application/json' : null),
        entries: () => [
          ['content-type', 'application/json'],
          ['x-request-id', 'req-456'],
        ],
      };
      const fetchResponse = {
        status: 201,
        headers: headersObj,
        json: vi.fn().mockResolvedValue({ created: true }),
        text: vi.fn(),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse));

      const result = await proxy.forward(
        makeRequest({ method: 'POST', path: '/external', body: { data: 'x' } }),
        'http://external-service.com'
      );

      expect(result.status).toBe(201);
      expect(result.headers['x-request-id']).toBe('req-456');

      vi.unstubAllGlobals();
    });

    it('should pass query params in direct requests', async () => {
      const headersObj = {
        get: () => 'text/plain',
        entries: () => [['content-type', 'text/plain']],
      };
      const fetchResponse = {
        status: 200,
        headers: headersObj,
        text: vi.fn().mockResolvedValue('ok'),
      };
      const mockFetch = vi.fn().mockResolvedValue(fetchResponse);
      vi.stubGlobal('fetch', mockFetch);

      await proxy.forward(
        makeRequest({ path: '/search', query: { q: 'hello', lang: 'en' } }),
        'http://external-service.com'
      );

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('q=hello');
      expect(calledUrl).toContain('lang=en');

      vi.unstubAllGlobals();
    });
  });

  describe('ERROR HANDLING', () => {
    it('should return 503 when httpClient throws (connection refused)', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.status).toBe(503);
      expect(result.body).toEqual(
        expect.objectContaining({
          error: 'Service unavailable',
          message: 'ECONNREFUSED',
          upstream: 'http://localhost:3000',
          serviceName: 'user-service',
        })
      );
    });

    it('should return 503 on DNS failure', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('getaddrinfo ENOTFOUND unknown-host'));

      const result = await proxy.forward(makeRequest(), 'http://unknown-host:3000', 'user-service');

      expect(result.status).toBe(503);
      expect(result.body).toEqual(
        expect.objectContaining({
          error: 'Service unavailable',
          message: expect.stringContaining('ENOTFOUND'),
        })
      );
    });

    it('should return 503 on timeout errors', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Request timed out'));

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.status).toBe(503);
      expect(result.body).toEqual(
        expect.objectContaining({
          error: 'Service unavailable',
          message: expect.stringContaining('timed out'),
        })
      );
    });

    it('should return 503 on generic errors', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Network error'));

      const result = await proxy.forward(
        makeRequest({ method: 'POST', body: {} }),
        'http://localhost:3000',
        'user-service'
      );

      expect(result.status).toBe(503);
    });

    it('should handle non-Error thrown values', async () => {
      mockHttpClient.get.mockRejectedValue('string error');

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.status).toBe(503);
      expect(result.body).toEqual(
        expect.objectContaining({
          message: 'Unknown error',
        })
      );
    });

    it('should include serviceName in error response', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('fail'));

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'my-service');

      expect(result.body).toEqual(expect.objectContaining({ serviceName: 'my-service' }));
    });

    it('should use "unknown" for serviceName when not provided in error', async () => {
      const headersObj = {
        get: () => null,
        entries: () => [],
      };
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await proxy.forward(makeRequest(), 'http://external.com');

      expect(result.status).toBe(503);
      expect(result.body).toEqual(expect.objectContaining({ serviceName: 'unknown' }));

      vi.unstubAllGlobals();
    });

    it('should include latency in error responses', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('fail'));

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.latency).toBeDefined();
      expect(typeof result.latency).toBe('number');
    });

    it('should set content-type to application/json in error response headers', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('fail'));

      const result = await proxy.forward(makeRequest(), 'http://localhost:3000', 'user-service');

      expect(result.headers['content-type']).toBe('application/json');
    });

    it('should return 503 when direct fetch throws abort error', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      const result = await proxy.forward(makeRequest({ path: '/timeout-path' }), 'http://external.com');

      expect(result.status).toBe(503);

      vi.unstubAllGlobals();
    });
  });

  describe('TIMEOUT & CONFIGURATION', () => {
    it('should use default timeout of 10000ms', () => {
      const stats = proxy.getStats();
      expect(stats.timeout).toBe(10000);
    });

    it('should allow custom timeout configuration', () => {
      const customProxy = new ReverseProxy({ timeout: 30000 });
      const stats = customProxy.getStats();
      expect(stats.timeout).toBe(30000);
    });

    it('should pass abort signal to fetch for direct requests', async () => {
      let receivedSignal: AbortSignal | undefined;

      const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        receivedSignal = init?.signal;
        const headersObj = {
          get: () => 'text/plain',
          entries: () => [['content-type', 'text/plain']],
        };
        return Promise.resolve({
          status: 200,
          headers: headersObj,
          text: () => Promise.resolve('ok'),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      await proxy.forward(makeRequest({ path: '/test' }), 'http://external.com');

      expect(fetchMock).toHaveBeenCalled();
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);

      vi.unstubAllGlobals();
    });
  });

  describe('Circuit Breaker & Stats', () => {
    it('should return circuit breaker stats', () => {
      const stats = proxy.getCircuitBreakerStats();
      expect(stats).toEqual(
        expect.objectContaining({
          message: expect.any(String),
          implementation: 'shared-service-discovery',
        })
      );
    });

    it('should return empty array for unhealthy services', () => {
      const unhealthy = proxy.getUnhealthyServices();
      expect(unhealthy).toEqual([]);
    });

    it('should not throw when resetting circuit breakers', () => {
      expect(() => proxy.resetCircuitBreakers()).not.toThrow();
    });

    it('should return comprehensive stats', () => {
      const stats = proxy.getStats();
      expect(stats).toEqual(
        expect.objectContaining({
          keepAlive: true,
          maxSockets: 100,
          timeout: 10000,
          circuitBreakerEnabled: true,
          circuitBreakers: expect.any(Object),
          unhealthyServices: expect.any(Array),
        })
      );
    });
  });

  describe('Destroy / Cleanup', () => {
    it('should not throw when destroyed', () => {
      expect(() => proxy.destroy()).not.toThrow();
    });

    it('should log cleanup on destroy', () => {
      proxy.destroy();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});
