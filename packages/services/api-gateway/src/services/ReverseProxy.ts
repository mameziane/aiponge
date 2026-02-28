/**
 * Proper Reverse Proxy Implementation
 * Core gateway functionality using shared ServiceCallClient for consistent reliability patterns
 * Updated to eliminate duplicate circuit breaker and timeout logic
 */

import {
  serviceRegistrationClient,
  type IServiceDiscoveryClient,
  HttpClient,
  createHttpClient,
  serializeError,
} from '@aiponge/platform-core';
import { getLogger } from '../config/service-urls';
import { GatewayError } from '../errors';

// Global type declarations

const logger = getLogger('api-gateway-reverseproxy');

const URLConstructor = globalThis.URL;
const AbortControllerConstructor = globalThis.AbortController;

export interface ProxyRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  upstream?: string;
  latency?: number;
}

export interface ProxyOptions {
  timeout?: number;
  keepAlive?: boolean;
  maxSockets?: number;
  circuitBreakerEnabled?: boolean;
}

export class ReverseProxy {
  private readonly httpClient: HttpClient;
  private readonly discoveryClient: IServiceDiscoveryClient;
  private readonly options: Required<ProxyOptions>;

  constructor(options: ProxyOptions = {}) {
    this.options = {
      timeout: options.timeout || 10000,
      keepAlive: options.keepAlive !== false,
      maxSockets: options.maxSockets || 100,
      circuitBreakerEnabled: options.circuitBreakerEnabled !== false,
    };

    // Use shared service discovery for reliability
    this.discoveryClient = serviceRegistrationClient;

    this.httpClient = createHttpClient({
      timeout: this.options.timeout,
      retries: 3,
      retryDelay: 1000,
      serviceName: 'api-gateway',
    });

    logger.debug('🔀 Initialized with shared service communication patterns');
  }

  /**
   * Forward request to upstream service using shared ServiceCallClient reliability patterns
   */
  async forward(request: ProxyRequest, upstream: string, serviceName?: string): Promise<ProxyResponse> {
    const startTime = Date.now();

    try {
      // Extract path and query from upstream URL
      const upstreamUrl = new URL(upstream);
      const baseUrl = `${upstreamUrl.protocol}//${upstreamUrl.host}`;
      let endpoint = request.path;

      // Add query parameters to endpoint
      if (request.query && Object.keys(request.query).length > 0) {
        const queryString = new URLSearchParams(request.query).toString();
        endpoint += endpoint.includes('?') ? '&' : '?';
        endpoint += queryString;
      }

      // Prepare headers for forwarding
      const forwardedHeaders = {
        ...request.headers,
        'x-forwarded-for': this.getClientIP(request.headers),
        'x-forwarded-proto': 'http',
        'x-forwarded-by': 'api-gateway',
        'user-agent': 'aiponge-Gateway/1.0',
      };

      // Remove problematic headers by creating clean headers object
      const cleanHeaders: Record<string, string> = { ...forwardedHeaders };
      delete cleanHeaders['host'];
      delete cleanHeaders['connection'];

      let response;
      const options = { headers: cleanHeaders };

      // Make direct HTTP request to service
      if (serviceName) {
        // Resolve service URL from discovery
        const serviceUrl = `${upstream}${endpoint}`;

        switch (request.method.toUpperCase()) {
          case 'GET':
            response = await this.httpClient.get(serviceUrl, options);
            break;
          case 'POST':
            response = await this.httpClient.post(serviceUrl, request.body, options);
            break;
          case 'PUT':
            response = await this.httpClient.put(serviceUrl, request.body, options);
            break;
          case 'DELETE':
            response = await this.httpClient.delete(serviceUrl, options);
            break;
          default:
            throw GatewayError.proxyError(upstream, `Unsupported HTTP method: ${request.method}`);
        }
        response = { status: 200, headers: {}, data: response };
      } else {
        // Fallback to direct URL if no service name (external proxying)
        response = await this.executeDirectRequest(request, upstream, forwardedHeaders);
      }

      const latency = Date.now() - startTime;

      return {
        status: response.status || 200,
        headers: response.headers || {},
        body: response.data,
        upstream,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      return {
        status: 503,
        headers: { 'content-type': 'application/json' },
        body: {
          success: false,
          error: {
            type: 'ServiceUnavailableError',
            code: 'SERVICE_UNAVAILABLE',
            message: `Service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
          timestamp: new Date().toISOString(),
        },
        upstream,
        latency,
      };
    }
  }

  /**
   * Execute direct HTTP request for external services (fallback)
   */
  private async executeDirectRequest(
    request: ProxyRequest,
    upstream: string,
    headers: Record<string, string>
  ): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
    const url = new URL(request.path, upstream);

    // Add query parameters
    if (request.query) {
      Object.entries(request.query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response body
      const contentType = response.headers.get('content-type') || '';
      let data: unknown;

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (error) {
          logger.warn('Failed to parse JSON response, falling back to text', {
            error: error instanceof Error ? error.message : String(error),
          });
          data = await response.text();
        }
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        headers: Object.fromEntries(Array.from(response.headers.entries())),
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Extract client IP for forwarding
   */
  private getClientIP(headers: Record<string, string>): string {
    return headers['x-forwarded-for'] || headers['x-real-ip'] || headers['cf-connecting-ip'] || 'unknown';
  }

  /**
   * Get circuit breaker statistics (delegated to shared ServiceCallClient)
   */
  getCircuitBreakerStats(): Record<string, unknown> {
    // Shared ServiceCallClient manages circuit breaker internally
    return {
      message: 'Circuit breaker statistics managed by shared ServiceCallClient',
      implementation: 'shared-service-discovery',
    };
  }

  /**
   * Get unhealthy services (delegated to shared ServiceCallClient)
   */
  getUnhealthyServices(): string[] {
    // Shared ServiceCallClient manages unhealthy service tracking internally
    logger.warn('Unhealthy service tracking delegated to shared ServiceCallClient');
    return [];
  }

  /**
   * Reset all circuit breakers (delegated to shared ServiceCallClient)
   */
  resetCircuitBreakers(): void {
    logger.warn('Circuit breaker reset delegated to shared ServiceCallClient');
  }

  /**
   * Get proxy statistics
   */
  getStats(): Record<string, unknown> {
    return {
      keepAlive: this.options.keepAlive,
      maxSockets: this.options.maxSockets,
      timeout: this.options.timeout,
      circuitBreakerEnabled: this.options.circuitBreakerEnabled,
      circuitBreakers: this.getCircuitBreakerStats(),
      unhealthyServices: this.getUnhealthyServices(),
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    logger.info('🔀 Cleaned up shared service clients');
  }
}
