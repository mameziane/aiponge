/**
 * Provider Service HTTP Client
 * HTTP client for consuming services to call the AI Providers Service
 * Updated to use ServiceCallClient for standardized service communication
 */

import {
  createServiceHttpClient,
  type HttpClient,
  getLogger as getPlatformLogger,
  errorMessage,
  errorStack,
} from '@aiponge/platform-core';
import { getOwnPort } from '@config/service-urls';
import {
  ProviderRequest,
  ProviderResponse,
  ProviderSelection,
  ProviderSelectionResult,
  ProviderHealthCheck,
  LoadBalancingStrategy,
} from '@domains/providers/application/interfaces/IProviderProxy';
import { ConfigError } from '../../../application/errors';

const logger = getPlatformLogger('provider-service-client');

interface ServiceResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: {
    type: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

interface UsageStatistics {
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
  metadata: {
    timeRangeMinutes: number;
    groupBy: string;
    generatedAt: string;
  };
}

interface ProxyHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  activeProviders: number;
  totalProviders: number;
  healthyProviders: number;
  averageResponseTime: number;
  requestsInLastMinute: number;
}

interface HealthSummary {
  totalProviders: number;
  healthyCount: number;
  unhealthyCount: number;
  averageResponseTime: number;
}

interface ProviderTestResult {
  providerId: string;
  testResult: {
    success: boolean;
    latencyMs: number;
    error?: string;
    response?: unknown;
  };
}

interface CapabilityProvidersResult {
  capability: string;
  providers: Array<{
    id: string;
    name: string;
    status: string;
    performance: {
      averageLatencyMs: number;
      successRate: number;
    };
  }>;
  count: number;
}

interface DatabaseStatus {
  connected: boolean;
  latencyMs: number;
  poolSize: number;
  activeConnections: number;
}

interface HealthCheckResult {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  environment: string;
  database: DatabaseStatus;
  memory: {
    used: string;
    total: string;
  };
}

const getOwnServiceUrl = () => `http://localhost:${getOwnPort()}`;

/**
 * HTTP Client for AI Providers Service
 */
export class ProviderServiceClient {
  private readonly httpClient: HttpClient;
  private readonly apiKey: string;
  private readonly serviceId: string;

  constructor(config: { apiKey: string; timeout?: number; serviceId?: string }) {
    this.apiKey = config.apiKey;
    this.serviceId = config.serviceId || 'unknown-service';

    // Initialize HTTP client for AI service communication
    this.httpClient = createServiceHttpClient('ai');

    logger.info('Initialized HTTP client for ai-config-service', {
      module: 'config_service_client',
      operation: 'constructor',
      serviceName: 'ai-config-service',
      serviceId: this.serviceId,
      phase: 'client_initialized',
    });
  }

  /**
   * Invoke a provider with automatic selection and failover
   */
  async invokeProvider<T = unknown>(request: ProviderRequest): Promise<ProviderResponse<T>> {
    try {
      const url = `${getOwnServiceUrl()}/api/providers/invoke`;
      const response = (await this.httpClient.post(url, request, {
        headers: this.getAuthHeaders(),
      })) as { data: ServiceResponse<ProviderResponse<T>> };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'invoke',
          new Error(serviceResponse.error?.message || 'Provider invocation failed')
        );
      }

      logger.info('Successfully invoked provider', {
        module: 'provider_service_client',
        operation: 'invokeProvider',
        providerId: serviceResponse.data.providerId,
        requestOperation: request.operation,
        phase: 'provider_invoked',
      });
      return serviceResponse.data;
    } catch (error) {
      logger.error('Invoke provider failed', {
        module: 'provider_service_client',
        operation: 'invokeProvider',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_invocation_failed',
      });
      throw this.handleError(error, 'invokeProvider');
    }
  }

  /**
   * Select the best provider for a given operation
   */
  async selectProvider(selection: ProviderSelection): Promise<ProviderSelectionResult> {
    try {
      const url = `${getOwnServiceUrl()}/api/providers/select`;
      const response = (await this.httpClient.post(url, selection, {
        headers: this.getAuthHeaders(),
      })) as { data: ServiceResponse<ProviderSelectionResult> };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'select',
          new Error(serviceResponse.error?.message || 'Provider selection failed')
        );
      }

      logger.info('Selected provider for operation', {
        module: 'provider_service_client',
        operation: 'selectProvider',
        providerId: serviceResponse.data.primaryProvider.id,
        selectionOperation: selection.operation,
        phase: 'provider_selected',
      });
      return serviceResponse.data;
    } catch (error) {
      logger.error('Select provider failed', {
        module: 'provider_service_client',
        operation: 'selectProvider',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_selection_failed',
      });
      throw this.handleError(error, 'selectProvider');
    }
  }

  /**
   * Get health status of all providers
   */
  async getProviderHealth(options?: {
    providerId?: string;
    providerType?: string;
    includeMetrics?: boolean;
  }): Promise<ProviderHealthCheck | ProviderHealthCheck[]> {
    try {
      const params = new URLSearchParams();
      if (options?.providerId) params.append('providerId', options.providerId);
      if (options?.providerType) params.append('providerType', options.providerType);
      if (options?.includeMetrics) params.append('includeMetrics', 'true');

      const url = `${getOwnServiceUrl()}/api/providers/health?${params.toString()}`;
      const response = (await this.httpClient.get(url, {
        headers: this.getAuthHeaders(),
      })) as {
        data: ServiceResponse<ProviderHealthCheck | { providers: ProviderHealthCheck[]; summary: HealthSummary }>;
      };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'getHealth',
          new Error(serviceResponse.error?.message || 'Get provider health failed')
        );
      }

      // Handle single provider response
      if (options?.providerId) {
        return serviceResponse.data as ProviderHealthCheck;
      }

      // Handle all providers response
      const data = serviceResponse.data as { providers: ProviderHealthCheck[]; summary: HealthSummary };
      return data.providers;
    } catch (error) {
      logger.error('Get provider health failed', {
        module: 'provider_service_client',
        operation: 'getProviderHealth',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_health_check_failed',
      });
      throw this.handleError(error, 'getProviderHealth');
    }
  }

  /**
   * Test a provider with a sample request
   */
  async testProvider(
    providerId: string,
    testPayload?: unknown
  ): Promise<{
    providerId: string;
    testResult: {
      success: boolean;
      latencyMs: number;
      error?: string;
      response?: unknown;
    };
  }> {
    try {
      const url = `${getOwnServiceUrl()}/api/providers/test`;
      const response = (await this.httpClient.post(
        url,
        {
          providerId,
          testPayload,
        },
        {
          headers: this.getAuthHeaders(),
        }
      )) as { data: ServiceResponse<ProviderTestResult> };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          providerId,
          'test',
          new Error(serviceResponse.error?.message || 'Test provider failed')
        );
      }

      logger.info('Tested provider', {
        module: 'provider_service_client',
        operation: 'testProvider',
        providerId,
        testResult: serviceResponse.data.testResult.success ? 'SUCCESS' : 'FAILED',
        phase: 'provider_tested',
      });
      return serviceResponse.data;
    } catch (error) {
      logger.error('Test provider failed', {
        module: 'provider_service_client',
        operation: 'testProvider',
        providerId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_test_failed',
      });
      throw this.handleError(error, 'testProvider');
    }
  }

  /**
   * Get usage statistics and performance metrics
   */
  async getUsageStatistics(options?: {
    timeRangeMinutes?: number;
    groupBy?: 'provider' | 'operation' | 'hour';
  }): Promise<UsageStatistics> {
    try {
      const params = new URLSearchParams();
      if (options?.timeRangeMinutes) params.append('timeRangeMinutes', options.timeRangeMinutes.toString());
      if (options?.groupBy) params.append('groupBy', options.groupBy);

      const url = `${getOwnServiceUrl()}/api/providers/statistics?${params.toString()}`;
      const response = (await this.httpClient.get(url, {
        headers: this.getAuthHeaders(),
      })) as { data: ServiceResponse<UsageStatistics> };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'getStatistics',
          new Error(serviceResponse.error?.message || 'Get statistics failed')
        );
      }

      logger.info('Retrieved statistics', {
        module: 'provider_service_client',
        operation: 'getStatistics',
        timeRangeMinutes: options?.timeRangeMinutes || 60,
        phase: 'statistics_retrieved',
      });
      return serviceResponse.data;
    } catch (error) {
      logger.error('Get statistics failed', {
        module: 'provider_service_client',
        operation: 'getStatistics',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'statistics_retrieval_failed',
      });
      throw this.handleError(error, 'getUsageStatistics');
    }
  }

  /**
   * Get providers by capability
   */
  async getProvidersByCapability(capability: string): Promise<{
    capability: string;
    providers: Array<{
      id: string;
      name: string;
      status: string;
      performance: {
        averageLatencyMs: number;
        successRate: number;
      };
    }>;
    count: number;
  }> {
    try {
      const url = `${getOwnServiceUrl()}/api/providers/capabilities?capability=${encodeURIComponent(capability)}`;
      const response = (await this.httpClient.get(url, {
        headers: this.getAuthHeaders(),
      })) as { data: ServiceResponse<CapabilityProvidersResult> };
      const serviceResponse = response.data as ServiceResponse<{
        capability: string;
        providers: Array<{
          id: string;
          name: string;
          status: string;
          performance: {
            averageLatencyMs: number;
            successRate: number;
          };
        }>;
        count: number;
      }>;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'getByCapability',
          new Error(serviceResponse.error?.message || 'Get providers by capability failed')
        );
      }

      logger.info('Found providers with capability', {
        module: 'provider_service_client',
        operation: 'getProvidersByCapability',
        count: serviceResponse.data.count,
        capability,
        phase: 'providers_found',
      });
      return serviceResponse.data;
    } catch (error) {
      logger.error('Get providers by capability failed', {
        module: 'provider_service_client',
        operation: 'getProvidersByCapability',
        capability,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'capability_providers_retrieval_failed',
      });
      throw this.handleError(error, 'getProvidersByCapability');
    }
  }

  /**
   * Get current load balancing configuration
   */
  async getLoadBalancingConfig(): Promise<LoadBalancingStrategy> {
    try {
      const url = `${getOwnServiceUrl()}/api/providers/config/load-balancing`;
      const response = (await this.httpClient.get(url, {
        headers: this.getAuthHeaders(),
      })) as { data: ServiceResponse<LoadBalancingStrategy> };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'getLoadBalancingConfig',
          new Error(serviceResponse.error?.message || 'Get load balancing config failed')
        );
      }

      return serviceResponse.data;
    } catch (error) {
      logger.error('Get load balancing config failed', {
        module: 'provider_service_client',
        operation: 'getLoadBalancingConfig',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'load_balancing_config_retrieval_failed',
      });
      throw this.handleError(error, 'getLoadBalancingConfig');
    }
  }

  /**
   * Configure load balancing strategy
   */
  async configureLoadBalancing(strategy: LoadBalancingStrategy): Promise<{
    message: string;
    config: LoadBalancingStrategy;
  }> {
    try {
      const url = `${getOwnServiceUrl()}/api/providers/config/load-balancing`;
      const response = (await this.httpClient.post(url, strategy, {
        headers: this.getAuthHeaders(),
      })) as { data: ServiceResponse<{ message: string; config: LoadBalancingStrategy }> };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'configureLoadBalancing',
          new Error(serviceResponse.error?.message || 'Configure load balancing failed')
        );
      }

      logger.info('Updated load balancing config', {
        module: 'provider_service_client',
        operation: 'configureLoadBalancing',
        strategyType: strategy.type,
        phase: 'load_balancing_configured',
      });
      return serviceResponse.data;
    } catch (error) {
      logger.error('Configure load balancing failed', {
        module: 'provider_service_client',
        operation: 'configureLoadBalancing',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'load_balancing_configuration_failed',
      });
      throw this.handleError(error, 'configureLoadBalancing');
    }
  }

  /**
   * Get proxy health and performance status
   */
  async getProxyHealth(): Promise<ProxyHealthStatus> {
    try {
      const url = `${getOwnServiceUrl()}/api/providers/proxy/health`;
      const response = (await this.httpClient.get(url, {
        headers: this.getAuthHeaders(),
      })) as { data: ServiceResponse<ProxyHealthStatus> };
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'provider',
          'getProxyHealth',
          new Error(serviceResponse.error?.message || 'Get proxy health failed')
        );
      }

      logger.info('Retrieved proxy health status', {
        module: 'provider_service_client',
        operation: 'getProxyHealth',
        status: serviceResponse.data.status,
        phase: 'proxy_health_status_retrieved',
      });
      return serviceResponse.data;
    } catch (error) {
      logger.error('Get proxy health failed', {
        module: 'provider_service_client',
        operation: 'getProxyHealth',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'proxy_health_retrieval_failed',
      });
      throw this.handleError(error, 'getProxyHealth');
    }
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    service: string;
    version: string;
    uptime: number;
    environment: string;
    database: DatabaseStatus;
    memory: {
      used: string;
      total: string;
    };
  }> {
    try {
      const url = `${getOwnServiceUrl()}/health`;
      const response = (await this.httpClient.get(url, {
        headers: this.getAuthHeaders(),
      })) as { data: HealthCheckResult };
      const healthData = response.data;

      logger.info('Service health status', {
        module: 'provider_service_client',
        operation: 'healthCheck',
        status: healthData.status,
        phase: 'service_health_retrieved',
      });
      return healthData;
    } catch (error) {
      logger.error('Health check failed', {
        module: 'provider_service_client',
        operation: 'healthCheck',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'health_check_failed',
      });
      throw this.handleError(error, 'healthCheck');
    }
  }

  // ServiceCallClient handles request/response logging internally

  /**
   * Get authentication headers for API requests
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'X-Service-ID': this.serviceId,
      'User-Agent': `ProviderServiceClient/${process.env.npm_package_version || '1.0.0'}`,
    };
  }

  private handleError(error: unknown, operation: string): Error {
    const err = error as {
      response?: { status?: number; data?: { error?: { message?: string; details?: unknown } } };
      request?: unknown;
      message?: string;
    };
    if (err.response) {
      // Server responded with error status
      const serverError = err.response.data?.error;
      const message = serverError?.message || `HTTP ${err.response.status}`;
      const enhancedError = new Error(`${operation} failed: ${message}`) as Error & {
        status?: number;
        details?: unknown;
      };
      enhancedError.status = err.response.status;
      enhancedError.details = serverError?.details;
      return enhancedError;
    } else if (err.request) {
      // Request was made but no response received
      return new Error(`${operation} failed: Network error - no response from server`);
    } else {
      // Something happened in setting up the request
      return new Error(`${operation} failed: ${err.message}`);
    }
  }

  // Service URL discovery now handled automatically by ServiceCallClient
}

/**
 * Create configured provider service client
 */
export function createProviderServiceClient(config: {
  apiKey: string;
  timeout?: number;
  serviceId?: string;
}): ProviderServiceClient {
  return new ProviderServiceClient(config);
}

/**
 * Default provider service client factory (uses environment variables)
 */
export function getDefaultProviderServiceClient(): ProviderServiceClient {
  const apiKey = process.env.aiponge_API_KEY;

  if (!apiKey) {
    throw ConfigError.apiKeyMissing('aiponge');
  }

  return new ProviderServiceClient({
    apiKey,
    serviceId: process.env.SERVICE_ID || 'unknown-service',
    timeout: parseInt(process.env.AI_CONFIG_SERVICE_TIMEOUT || '30000'),
  });
}
