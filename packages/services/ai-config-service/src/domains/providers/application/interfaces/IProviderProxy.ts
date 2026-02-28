/**
 * Provider Proxy Interface - Provider access interface for AI providers service
 * Handles provider selection, invocation, and health checking
 */

export interface ProviderRequest {
  providerId?: string; // If not specified, auto-select best provider
  operation: 'text_generation' | 'text_analysis' | 'music_generation' | 'image_generation' | 'audio_transcription';
  payload: Record<string, unknown>;
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    retries?: number;
    fallbackProviders?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface ProviderResponse<T = unknown> {
  providerId: string;
  providerName: string;
  model: string;
  success: boolean;
  result?: T;
  error?: {
    code: string;
    message: string;
    type: 'provider_error' | 'network_error' | 'timeout' | 'rate_limit' | 'quota_exceeded';
    retryable: boolean;
  };
  metadata: {
    processingTimeMs: number;
    tokensUsed?: number;
    cost?: number;
    rateLimitRemaining?: number;
    rateLimitResetTime?: Date;
    /** Response format indicator (e.g., 'text', 'base64', 'url') */
    responseFormat?: string;
    /** True if response content is base64 encoded (for image providers like Stable Diffusion) */
    isBase64?: boolean;
  };
}

export interface ProviderHealthCheck {
  providerId: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  capabilities: string[];
  performance: {
    averageLatencyMs: number;
    successRate: number;
    requestsPerMinute: number;
  };
  limits: {
    rateLimit?: {
      requestsPerMinute: number;
      remaining: number;
      resetTime: Date;
    };
    quota?: {
      totalTokens: number;
      usedTokens: number;
      resetDate: Date;
    };
  };
  lastChecked: Date;
  metadata?: Record<string, unknown>;
}

export interface ProviderSelection {
  operation: string;
  requirements?: {
    minSuccessRate?: number;
    maxLatencyMs?: number;
    requiredCapabilities?: string[];
    costPreference?: 'lowest' | 'balanced' | 'highest_quality';
  };
}

export interface ProviderSelectionResult {
  primaryProvider: {
    id: string;
    name: string;
    score: number;
    reasoning: string;
  };
  fallbackProviders: Array<{
    id: string;
    name: string;
    score: number;
    reasoning: string;
  }>;
  selectionMetadata: {
    totalCandidates: number;
    selectionTimeMs: number;
    selectionCriteria: Record<string, unknown>;
  };
}

export interface LoadBalancingStrategy {
  type: 'round_robin' | 'weighted' | 'least_connections' | 'health_based' | 'cost_optimized';
  config?: Record<string, unknown>;
}

/**
 * Main Provider Proxy Service Interface
 */
export interface IProviderProxy {
  /**
   * Invoke a provider operation with automatic selection and failover
   */
  invoke<T = unknown>(request: ProviderRequest): Promise<ProviderResponse<T>>;

  /**
   * Select the best provider for a given operation
   */
  selectProvider(selection: ProviderSelection): Promise<ProviderSelectionResult>;

  /**
   * Get health status of all registered providers
   */
  getProviderHealth(): Promise<ProviderHealthCheck[]>;

  /**
   * Get health status of a specific provider
   */
  getProviderHealthById(providerId: string): Promise<ProviderHealthCheck | null>;

  /**
   * Test a provider with a sample request
   */
  testProvider(
    providerId: string,
    testPayload?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    latencyMs: number;
    error?: string;
    response?: unknown;
  }>;

  /**
   * Get list of available providers by capability
   */
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

  /**
   * Configure load balancing strategy
   */
  configureLoadBalancing(strategy: LoadBalancingStrategy): Promise<void>;

  /**
   * Get current load balancing configuration
   */
  getLoadBalancingConfig(): Promise<LoadBalancingStrategy>;

  /**
   * Get provider usage statistics
   */
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

  /**
   * Add or update provider configuration
   */
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

  /**
   * Remove a provider from the proxy
   */
  removeProvider(providerId: string): Promise<boolean>;

  /**
   * Get proxy health and performance status
   */
  getProxyHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeProviders: number;
    totalProviders: number;
    healthyProviders: number;
    averageResponseTime: number;
    requestsInLastMinute: number;
  }>;
}
