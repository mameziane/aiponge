/**
 * Providers Service HTTP Client
 * Handles all communication with the external ai-config-service
 *
 * Uses centralized service URL resolution to eliminate repetitive ServiceLocator calls
 */

import { ServiceLocator, withServiceResilience } from '@aiponge/platform-core';
import { createServiceClient, type HttpClient, getLogger } from '../config/service-urls';
import type { ProviderStatus } from '@aiponge/shared-contracts/providers';

const logger = getLogger('providers-service-client');

const SERVICE_NAME = 'ai-config-service';

export interface ProviderRequest {
  operation: string;
  provider?: string;
  providerId?: string;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ProviderResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealthCheck {
  id: string;
  name: string;
  status: ProviderStatus;
  latency: number;
  lastCheck: Date;
}

export interface ProviderSelection {
  capability: string;
  strategy?: 'round_robin' | 'least_latency' | 'random';
  excludeProviders?: string[];
}

export interface ProviderSelectionResult {
  selectedProvider: string;
  reason: string;
}

export interface LoadBalancingStrategy {
  type: 'round_robin' | 'least_latency' | 'random' | 'weighted';
  weights?: Record<string, number>;
}

export interface IProvidersServiceClient {
  // Core provider operations
  invokeProvider<T = unknown>(request: ProviderRequest): Promise<ProviderResponse<T>>;
  selectProvider(selection: ProviderSelection): Promise<ProviderSelectionResult>;

  // Health and monitoring
  getProviderHealth(): Promise<ProviderHealthCheck[]>;
  getProviderHealthById(providerId: string): Promise<ProviderHealthCheck | null>;
  testProvider(
    providerId: string,
    testPayload?: unknown
  ): Promise<{
    success: boolean;
    latencyMs: number;
    error?: string;
    response?: unknown;
  }>;

  // Provider management
  getProvidersByCapability(capability: string): Promise<
    Array<{
      id: string;
      name: string;
      status: string;
      performance: {
        averageLatencyMs: number;
        successRate: number;
      };
    }>
  >;

  // Configuration and management
  configureLoadBalancing(strategy: LoadBalancingStrategy): Promise<void>;
  getLoadBalancingConfig(): Promise<LoadBalancingStrategy>;

  // Analytics and usage
  getUsageStatistics(timeRangeMinutes?: number): Promise<{
    totalRequests: number;
    providerBreakdown: Record<
      string,
      {
        requests: number;
        successRate: number;
        averageLatencyMs: number;
        totalCost: number;
      }
    >;
    operationBreakdown: Record<
      string,
      {
        requests: number;
        successRate: number;
        averageLatencyMs: number;
      }
    >;
  }>;

  // Provider configuration
  configureProvider(config: {
    id: string;
    name: string;
    type: string;
    endpoint: string;
    capabilities: string[];
    rateLimits?: {
      requestsPerMinute: number;
      tokensPerMinute?: number;
    };
    healthCheckInterval?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  removeProvider(providerId: string): Promise<boolean>;

  // Service health
  getProxyHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeProviders: number;
    totalProviders: number;
    healthyProviders: number;
    averageResponseTime: number;
    requestsInLastMinute: number;
  }>;

  // Provider statistics
  getProviderStatistics(): Promise<{
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    providerBreakdown: Record<string, unknown>;
  }>;

  // Provider catalog
  getProviderCatalog(type?: string): Promise<{
    success: boolean;
    data: Record<
      string,
      Array<{
        id: string;
        name: string;
        description: string;
        models: string[];
        strengths: string[];
      }>
    >;
    timestamp: string;
  }>;
}

interface ProvidersClientConfig {
  timeout?: number;
  retries?: number;
}

export class ProvidersServiceClient implements IProvidersServiceClient {
  private readonly httpClient: HttpClient;
  private readonly config: ProvidersClientConfig;
  private baseUrl: string | null = null;

  constructor(config: Partial<ProvidersClientConfig> = {}) {
    const { httpClient } = createServiceClient('ai-config-service');
    this.httpClient = httpClient;

    this.config = {
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
    };

    logger.info('Initialized with HttpClient for providers service');
  }

  /**
   * Get base URL for ai-config-service using ServiceLocator
   * Cached for performance - resolved once per request lifecycle
   */
  private getBaseUrl(): string {
    if (!this.baseUrl) {
      this.baseUrl = ServiceLocator.getServiceUrl(SERVICE_NAME);
    }
    return this.baseUrl!;
  }

  /**
   * Helper to construct full endpoint URL
   */
  private url(path: string): string {
    return `${this.getBaseUrl()}${path}`;
  }

  async invokeProvider<T = unknown>(request: ProviderRequest, options?: { timeout?: number }): Promise<ProviderResponse<T>> {
    return withServiceResilience(
      SERVICE_NAME,
      'invokeProvider',
      () => this.httpClient.post<ProviderResponse<T>>(
        this.url('/api/providers/invoke'),
        request,
        options?.timeout ? { timeout: options.timeout } : undefined
      ),
      'ai-provider'
    );
  }

  async selectProvider(selection: ProviderSelection): Promise<ProviderSelectionResult> {
    return withServiceResilience(
      SERVICE_NAME,
      'selectProvider',
      () => this.httpClient.post<ProviderSelectionResult>(this.url('/api/providers/select'), selection),
      'ai-provider'
    );
  }

  async getProviderHealth(): Promise<ProviderHealthCheck[]> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderHealth',
      () => this.httpClient.get<ProviderHealthCheck[]>(this.url('/api/providers/health')),
      'ai-provider'
    );
  }

  async getProviderHealthById(providerId: string): Promise<ProviderHealthCheck | null> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderHealthById',
      async () => {
        try {
          return await this.httpClient.get<ProviderHealthCheck>(this.url(`/api/providers/health/${providerId}`));
        } catch (error) {
          // If provider not found, return null
          if ((error as Record<string, unknown>)?.status === 404) {
            return null;
          }
          throw error;
        }
      },
      'ai-provider'
    );
  }

  async testProvider(
    providerId: string,
    testPayload?: unknown
  ): Promise<{
    success: boolean;
    latencyMs: number;
    error?: string;
    response?: unknown;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'testProvider',
      async () => {
        return this.httpClient.post<{
          success: boolean;
          latencyMs: number;
          error?: string;
          response?: unknown;
        }>(this.url(`/api/providers/test/${providerId}`), { testPayload });
      },
      'ai-provider'
    );
  }

  async getProvidersByCapability(capability: string): Promise<
    Array<{
      id: string;
      name: string;
      status: string;
      performance: {
        averageLatencyMs: number;
        successRate: number;
      };
    }>
  > {
    return withServiceResilience(
      SERVICE_NAME,
      'getProvidersByCapability',
      async () => {
        return this.httpClient.get<
          Array<{
            id: string;
            name: string;
            status: string;
            performance: {
              averageLatencyMs: number;
              successRate: number;
            };
          }>
        >(this.url(`/api/providers/capability/${capability}`));
      },
      'ai-provider'
    );
  }

  async configureLoadBalancing(strategy: LoadBalancingStrategy): Promise<void> {
    return withServiceResilience(
      SERVICE_NAME,
      'configureLoadBalancing',
      async () => {
        await this.httpClient.post(this.url('/api/providers/load-balancing'), strategy);
      },
      'internal-service'
    );
  }

  async getLoadBalancingConfig(): Promise<LoadBalancingStrategy> {
    return withServiceResilience(
      SERVICE_NAME,
      'getLoadBalancingConfig',
      async () => {
        return this.httpClient.get<LoadBalancingStrategy>(this.url('/api/providers/load-balancing'));
      },
      'internal-service'
    );
  }

  async getUsageStatistics(timeRangeMinutes?: number): Promise<{
    totalRequests: number;
    providerBreakdown: Record<
      string,
      {
        requests: number;
        successRate: number;
        averageLatencyMs: number;
        totalCost: number;
      }
    >;
    operationBreakdown: Record<
      string,
      {
        requests: number;
        successRate: number;
        averageLatencyMs: number;
      }
    >;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'getUsageStatistics',
      async () => {
        const params = timeRangeMinutes ? `?timeRange=${timeRangeMinutes}` : '';
        return this.httpClient.get<{
          totalRequests: number;
          providerBreakdown: Record<
            string,
            {
              requests: number;
              successRate: number;
              averageLatencyMs: number;
              totalCost: number;
            }
          >;
          operationBreakdown: Record<
            string,
            {
              requests: number;
              successRate: number;
              averageLatencyMs: number;
            }
          >;
        }>(this.url(`/api/providers/usage${params}`));
      },
      'ai-provider'
    );
  }

  async configureProvider(config: {
    id: string;
    name: string;
    type: string;
    endpoint: string;
    capabilities: string[];
    rateLimits?: {
      requestsPerMinute: number;
      tokensPerMinute?: number;
    };
    healthCheckInterval?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    return withServiceResilience(
      SERVICE_NAME,
      'configureProvider',
      async () => {
        await this.httpClient.post(this.url('/api/providers/configure'), config);
      },
      'internal-service'
    );
  }

  async removeProvider(providerId: string): Promise<boolean> {
    return withServiceResilience(
      SERVICE_NAME,
      'removeProvider',
      async () => {
        try {
          await this.httpClient.delete(this.url(`/api/providers/${providerId}`));
          return true;
        } catch (error) {
          logger.error('Failed to remove provider', {
            providerId,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      },
      'internal-service'
    );
  }

  async getProxyHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeProviders: number;
    totalProviders: number;
    healthyProviders: number;
    averageResponseTime: number;
    requestsInLastMinute: number;
  }> {
    return this.httpClient.get<{
      status: 'healthy' | 'degraded' | 'unhealthy';
      activeProviders: number;
      totalProviders: number;
      healthyProviders: number;
      averageResponseTime: number;
      requestsInLastMinute: number;
    }>(this.url('/api/providers/proxy/health'));
  }

  async getProviderStatistics(): Promise<{
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    providerBreakdown: Record<string, unknown>;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderStatistics',
      async () => {
        return this.httpClient.get<{
          totalRequests: number;
          successRate: number;
          averageLatency: number;
          providerBreakdown: Record<string, unknown>;
        }>(this.url('/api/providers/statistics'));
      },
      'ai-provider'
    );
  }

  async getProviderCatalog(type?: string): Promise<{
    success: boolean;
    data: Record<
      string,
      Array<{
        id: string;
        name: string;
        description: string;
        models: string[];
        strengths: string[];
      }>
    >;
    timestamp: string;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderCatalog',
      async () => {
        const params = type ? `?type=${encodeURIComponent(type)}` : '';
        return this.httpClient.get<{
          success: boolean;
          data: Record<
            string,
            Array<{
              id: string;
              name: string;
              description: string;
              models: string[];
              strengths: string[];
            }>
          >;
          timestamp: string;
        }>(this.url(`/api/providers/catalog${params}`));
      },
      'ai-provider'
    );
  }

  // Provider Configuration CRUD Methods

  async getProviderConfigurations(type?: string, includeAnalytics?: boolean): Promise<unknown> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderConfigurations',
      async () => {
        const params = new URLSearchParams();
        if (type) params.append('type', type);
        if (includeAnalytics) params.append('includeAnalytics', 'true');
        const queryString = params.toString();
        const fullUrl = this.url(`/api/providers/configurations${queryString ? '?' + queryString : ''}`);
        return this.httpClient.get<unknown>(fullUrl);
      },
      'ai-provider'
    );
  }

  async getProviderConfiguration(id: string): Promise<unknown> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderConfiguration',
      async () => {
        return this.httpClient.get<unknown>(this.url(`/api/providers/configurations/${id}`));
      },
      'ai-provider'
    );
  }

  async createProviderConfiguration(data: Record<string, unknown>): Promise<unknown> {
    return withServiceResilience(
      SERVICE_NAME,
      'createProviderConfiguration',
      async () => {
        return this.httpClient.post<unknown>(this.url('/api/providers/configurations'), data);
      },
      'ai-provider'
    );
  }

  async updateProviderConfiguration(id: string, data: Record<string, unknown>): Promise<unknown> {
    return withServiceResilience(
      SERVICE_NAME,
      'updateProviderConfiguration',
      async () => {
        return this.httpClient.patch<unknown>(this.url(`/api/providers/configurations/${id}`), data);
      },
      'ai-provider'
    );
  }

  async deleteProviderConfiguration(id: string): Promise<unknown> {
    return withServiceResilience(
      SERVICE_NAME,
      'deleteProviderConfiguration',
      async () => {
        return this.httpClient.delete<unknown>(this.url(`/api/providers/configurations/${id}`));
      },
      'ai-provider'
    );
  }

  async setProviderAsPrimary(id: string, data: Record<string, unknown>): Promise<unknown> {
    return withServiceResilience(
      SERVICE_NAME,
      'setProviderAsPrimary',
      async () => {
        return this.httpClient.post<unknown>(this.url(`/api/providers/configurations/${id}/set-primary`), data);
      },
      'ai-provider'
    );
  }

  async healthCheckProvider(id: string): Promise<unknown> {
    return this.httpClient.post<unknown>(this.url(`/api/providers/configurations/${id}/health-check`), {});
  }

  async testProviderConfiguration(id: string, data?: Record<string, unknown>): Promise<unknown> {
    return withServiceResilience(
      SERVICE_NAME,
      'testProviderConfiguration',
      async () => {
        return this.httpClient.post<unknown>(this.url(`/api/providers/configurations/${id}/test`), data || {});
      },
      'ai-provider'
    );
  }

  // HTTP requests and circuit breaker logic now handled by ServiceCallClient

  /**
   * Get client health status
   */
  getClientHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
  } {
    // ServiceCallClient manages circuit breaker internally
    return {
      status: 'healthy',
    };
  }
}
