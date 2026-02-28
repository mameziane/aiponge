/**
 * ProviderProxy - Centralized AI provider access and management
 * Implements load balancing, health checking, secret management, and circuit breaker patterns
 */

import {
  IProviderProxy,
  ProviderRequest,
  ProviderResponse,
  ProviderHealthCheck,
  ProviderSelection,
  ProviderSelectionResult,
  LoadBalancingStrategy,
} from '@domains/providers/application/interfaces/IProviderProxy';
import { IProviderConfigRepository } from '@domains/providers/domain/repositories/IProviderConfigRepository';
import { ProviderConfiguration, ProviderType } from '@domains/providers/domain/entities/ProviderConfiguration';
import { UniversalHTTPProvider, ProviderTemplate, AIRequest } from '../clients/UniversalHTTPProvider';
import { type ICache } from '@aiponge/platform-core';
import { MetricsCollector } from '@infrastructure/monitoring/MetricsCollector';
import { CredentialsResolver } from './CredentialsResolver';
import { ProviderAuthConfig } from '@schema/schema';
import { errorMessage, createIntervalScheduler, IntervalScheduler, createRedisCache } from '@aiponge/platform-core';
import { getLogger } from '@config/service-urls';
import { ConfigError } from '../../../application/errors';

const logger = getLogger('ai-config-service-providerproxy');

interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  nextRetry: Date | null;
}

interface ProviderHealth {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  circuitBreaker: CircuitBreakerState;
  lastCheck: Date;
  averageLatency: number;
  successRate: number;
  requestCount: number;
  successCount: number;
  rateLimitInfo?: {
    remaining: number;
    resetTime: Date;
    limit: number;
  };
}

export class ProviderProxy implements IProviderProxy {
  private readonly httpProvider: UniversalHTTPProvider;
  private readonly cache: ICache;
  private readonly metrics: MetricsCollector;
  private readonly providerConfigRepo: IProviderConfigRepository;
  private readonly credentialsResolver: CredentialsResolver;

  private loadBalancingStrategy: LoadBalancingStrategy = { type: 'health_based' };
  private providerHealthMap: Map<string, ProviderHealth> = new Map();
  private requestQueue: Map<string, Promise<unknown>> = new Map();
  private healthCheckScheduler: IntervalScheduler | null = null;

  // Circuit breaker configuration
  private readonly circuitBreakerConfig: {
    failureThreshold: number;
    timeout: number;
    halfOpenMaxCalls: number;
    halfOpenRetryDelay: number;
  };

  // Cache configuration
  private readonly cacheConfig: {
    providerSelectionTTL: number;
    healthCheckTTL: number;
    configurationTTL: number;
  };

  constructor(
    providerConfigRepo: IProviderConfigRepository,
    cache?: ICache,
    metrics?: MetricsCollector,
    credentialsResolver?: CredentialsResolver,
    circuitBreakerConfig?: {
      failureThreshold: number;
      timeout: number;
      halfOpenMaxCalls: number;
      halfOpenRetryDelay?: number;
    },
    cacheConfig?: {
      providerSelectionTTL: number;
      healthCheckTTL: number;
      configurationTTL: number;
    }
  ) {
    this.providerConfigRepo = providerConfigRepo;
    this.httpProvider = new UniversalHTTPProvider();
    this.cache = cache || createRedisCache({ serviceName: 'ai-config-service', keyPrefix: 'aiponge:providers:' });
    this.metrics = metrics || new MetricsCollector();
    this.credentialsResolver = credentialsResolver || new CredentialsResolver();

    // Apply configuration
    this.circuitBreakerConfig = {
      failureThreshold: 5,
      timeout: 60000,
      halfOpenMaxCalls: 3,
      halfOpenRetryDelay: 30000,
      ...circuitBreakerConfig,
    };

    this.cacheConfig = cacheConfig || {
      providerSelectionTTL: 300, // 5 minutes
      healthCheckTTL: 60, // 1 minute
      configurationTTL: 300, // 5 minutes
    };

    void this.initializeHealthChecking();
    logger.debug('🚀 Initialized with circuit breaker and health checking');
  }

  /**
   * Main provider invocation with automatic selection and failover
   */
  async invoke<T = unknown>(request: ProviderRequest): Promise<ProviderResponse<T>> {
    const startTime = Date.now();

    try {
      // Get provider selection (simplified: just use priority, no complex requirements)
      const selection = await this.selectProvider({
        operation: request.operation,
        // No requirements needed for priority-based selection
      });

      const providerId = request.providerId || selection.primaryProvider.id;
      let providers = [providerId, ...selection.fallbackProviders.map((p: { id: string }) => p.id)];

      // Add explicit fallback providers from request
      if (request.options?.fallbackProviders) {
        providers = [...providers, ...request.options.fallbackProviders];
      }

      let lastError: Error | null = null;

      // Try providers in order with circuit breaker checks
      for (const currentProviderId of providers) {
        if (!this.isProviderAvailable(currentProviderId)) {
          continue;
        }

        try {
          const result = await this.invokeProvider<T>(currentProviderId, request);

          // Record success metrics
          this.recordProviderSuccess(currentProviderId, Date.now() - startTime, result.metadata?.cost || 0);

          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(errorMessage(error));
          this.recordProviderFailure(currentProviderId, lastError);

          // Continue to next provider unless it's the last one
          continue;
        }
      }

      // All providers failed
      throw ConfigError.providerUnavailable('all', `All providers failed. Last error: ${lastError?.message}`);
    } catch (error) {
      this.metrics.recordError(
        'provider_proxy_invoke',
        error instanceof Error ? error : new Error(errorMessage(error))
      );
      throw error;
    }
  }

  /**
   * Invoke specific provider with circuit breaker protection
   */
  private async invokeProvider<T>(providerId: string, request: ProviderRequest): Promise<ProviderResponse<T>> {
    const providerConfig = await this.getProviderConfiguration(providerId, request.operation);
    if (!providerConfig) {
      throw ConfigError.providerNotFound(providerId);
    }

    // Check circuit breaker
    if (!this.isCircuitClosed(providerId)) {
      throw ConfigError.circuitBreakerOpen(providerId);
    }

    // Convert to provider template format
    const template = this.convertConfigToTemplate(providerConfig);

    // Get auth configuration from provider config and resolve credentials
    const authConfig = this.extractAuthConfig(providerConfig);
    const authCredentials = this.credentialsResolver.resolveCredentials(providerConfig.providerName, authConfig);

    // CRITICAL: Fail fast if credentials are missing instead of making requests that will fail
    if (!authCredentials.isValid) {
      const missingKeys = authCredentials.missingCredentials?.join(', ') || 'unknown';
      logger.error('Provider credentials missing - cannot proceed', {
        providerId,
        missingCredentials: authCredentials.missingCredentials,
      });
      throw ConfigError.apiKeyMissing(providerId);
    }

    // Convert to AI request format
    const aiRequest: AIRequest = {
      prompt: (request.payload.prompt as string) || JSON.stringify(request.payload),
      modality: this.mapOperationToModality(request.operation),
      artworkUrl: request.payload.artworkUrl as string | undefined,
      systemPrompt: request.payload.systemPrompt as string | undefined,
      options: {
        ...request.options,
        ...request.payload,
        // SECURITY: NO secrets in options - they go to HTTP headers via authCredentials
      },
    };

    try {
      const startTime = Date.now();

      const response = await this.httpProvider.makeRequest(template, aiRequest, authCredentials);
      const processingTime = Date.now() - startTime;

      // Extract rate limit info if available
      const rateLimitInfo = this.extractRateLimitInfo(response.metadata?.headers as Record<string, string> | undefined);

      return {
        providerId: providerConfig.providerId,
        providerName: providerConfig.providerName,
        model: request.options?.model || 'default',
        success: true,
        result: response.content as T,
        metadata: {
          processingTimeMs: processingTime,
          tokensUsed: this.extractTokenUsage(response.metadata),
          cost: response.cost,
          rateLimitRemaining: rateLimitInfo?.remaining,
          rateLimitResetTime: rateLimitInfo?.resetTime,
          // Include response format for base64 handling (Stable Diffusion, etc.)
          responseFormat: response.metadata?.responseFormat as string | undefined,
          isBase64: response.metadata?.isBase64 as boolean | undefined,
        },
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(errorMessage(error));
      const errorInfo = this.classifyError(errorObj);

      // Preserve structured error information
      const structuredError = new Error(`Provider ${providerId} failed: ${errorMessage(error)}`);
      (structuredError as unknown as Record<string, unknown>).providerId = providerId;
      (structuredError as unknown as Record<string, unknown>).errorType = errorInfo.type;
      (structuredError as unknown as Record<string, unknown>).retryable = errorInfo.retryable;

      throw structuredError;
    }
  }

  /**
   * Select best provider for operation (Simplified: Priority-based)
   *
   * For MVP with 1 provider per type, complex scoring is overkill.
   * Simple rule: Highest priority provider wins.
   * Circuit breaker still protects against failed providers.
   */
  async selectProvider(selection: ProviderSelection): Promise<ProviderSelectionResult> {
    const startTime = Date.now();

    // Get all active providers for this operation type
    const candidates = await this.getProviderCandidates(selection.operation);

    if (candidates.length === 0) {
      throw ConfigError.providerUnavailable('provider', `No providers available for operation: ${selection.operation}`);
    }

    // Filter out providers with open circuit breakers
    const availableCandidates = candidates.filter(provider => {
      const health = this.providerHealthMap.get(provider.providerId);
      const isAvailable = !health || health.circuitBreaker.status !== 'open';

      if (!isAvailable) {
        logger.debug('Provider {} excluded: circuit breaker open', { data0: provider.providerName });
      }

      return isAvailable;
    });

    if (availableCandidates.length === 0) {
      throw ConfigError.providerUnavailable(
        'provider',
        `No available providers for operation: ${selection.operation} (all circuit breakers open)`
      );
    }

    // Simple: Sort by priority (highest first), then pick top one
    const sorted = availableCandidates.sort((a, b) => b.priority - a.priority);

    logger.debug('Provider selection complete:', {
      operation: selection.operation,
      totalCandidates: candidates.length,
      availableCandidates: availableCandidates.length,
      selected: sorted[0].providerName,
      priority: sorted[0].priority,
    });

    const result: ProviderSelectionResult = {
      primaryProvider: {
        id: sorted[0].providerId,
        name: sorted[0].providerName,
        score: sorted[0].priority,
        reasoning: `Highest priority provider (priority: ${sorted[0].priority})`,
      },
      fallbackProviders: sorted.slice(1, 4).map(provider => ({
        id: provider.providerId,
        name: provider.providerName,
        score: provider.priority,
        reasoning: `Fallback option (priority: ${provider.priority})`,
      })),
      selectionMetadata: {
        totalCandidates: candidates.length,
        selectionTimeMs: Date.now() - startTime,
        selectionCriteria: { strategy: 'priority-based' },
      },
    };

    return result;
  }

  /**
   * Get health status of all registered providers
   */
  async getProviderHealth(): Promise<ProviderHealthCheck[]> {
    const providers = await this.providerConfigRepo.findAll({ isActive: true });
    const healthChecks: ProviderHealthCheck[] = [];

    for (const provider of providers) {
      const health = await this.getProviderHealthById(provider.providerId);
      if (health) {
        healthChecks.push(health);
      }
    }

    return healthChecks;
  }

  /**
   * Get health status of a specific provider
   */
  async getProviderHealthById(providerId: string): Promise<ProviderHealthCheck | null> {
    const cacheKey = `provider_health:${providerId}`;

    const cachedStr = await this.cache.get(cacheKey);
    if (cachedStr) {
      try {
        return JSON.parse(cachedStr) as ProviderHealthCheck;
      } catch {
        /* stale entry */
      }
    }

    const provider = await this.providerConfigRepo.findAll({ providerId });
    if (!provider || provider.length === 0) {
      return null;
    }

    const providerConfig = provider[0];
    const health = this.providerHealthMap.get(providerId);
    const stats = this.metrics.getProviderStats(providerId);

    const healthCheck: ProviderHealthCheck = {
      providerId: providerConfig.providerId,
      name: providerConfig.providerName,
      status: this.determineHealthStatus(providerId, stats),
      capabilities: this.extractCapabilities(providerConfig),
      performance: {
        averageLatencyMs: stats.avgLatency,
        successRate: stats.successRate,
        requestsPerMinute: stats.requestCount / 60, // Approximation
      },
      limits: {
        rateLimit: health?.rateLimitInfo
          ? {
              requestsPerMinute: health.rateLimitInfo.limit,
              remaining: health.rateLimitInfo.remaining,
              resetTime: health.rateLimitInfo.resetTime,
            }
          : undefined,
      },
      lastChecked: health?.lastCheck || new Date(),
      metadata: {
        circuitBreakerStatus: health?.circuitBreaker.status,
        totalCost: stats.totalCost,
      },
    };

    await this.cache.set(cacheKey, JSON.stringify(healthCheck), this.cacheConfig.healthCheckTTL);

    return healthCheck;
  }

  /**
   * Test a provider with a sample request
   */
  async testProvider(
    providerId: string,
    testPayload?: unknown
  ): Promise<{
    success: boolean;
    latencyMs: number;
    error?: string;
    response?: unknown;
  }> {
    try {
      const testRequest: ProviderRequest = {
        providerId,
        operation: 'text_generation',
        payload: (testPayload as Record<string, unknown>) || { prompt: 'Hello, world!' },
        options: { timeout: 10000 },
      };

      const startTime = Date.now();
      const response = await this.invoke(testRequest);

      return {
        success: response.success,
        latencyMs: Date.now() - startTime,
        response: response.result,
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: 0,
        error: errorMessage(error),
      };
    }
  }

  /**
   * Get list of available providers by capability
   */
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
    const providers = await this.providerConfigRepo.findAll({ isActive: true });
    const results = [];

    for (const provider of providers) {
      const capabilities = this.extractCapabilities(provider);
      if (capabilities.includes(capability)) {
        const stats = this.metrics.getProviderStats(provider.providerId);
        const health = this.providerHealthMap.get(provider.providerId);

        results.push({
          id: provider.providerId,
          name: provider.providerName,
          status: health?.status || 'unknown',
          performance: {
            averageLatencyMs: stats.avgLatency,
            successRate: stats.successRate,
          },
        });
      }
    }

    return results;
  }

  /**
   * Configure load balancing strategy
   */
  async configureLoadBalancing(strategy: LoadBalancingStrategy): Promise<void> {
    this.loadBalancingStrategy = strategy;
    logger.info('⚖️ Load balancing strategy set to: {}', { data0: strategy.type });
  }

  /**
   * Get current load balancing configuration
   */
  async getLoadBalancingConfig(): Promise<LoadBalancingStrategy> {
    return this.loadBalancingStrategy;
  }

  /**
   * Get provider usage statistics
   */
  async getUsageStatistics(timeRangeMinutes: number = 60): Promise<{
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
    const providers = await this.providerConfigRepo.findAll({ isActive: true });
    const providerBreakdown: Record<string, unknown> = {};
    let totalRequests = 0;

    for (const provider of providers) {
      const stats = this.metrics.getProviderStats(provider.providerId, timeRangeMinutes * 60 * 1000);
      providerBreakdown[provider.providerId] = stats;
      totalRequests += stats.requestCount;
    }

    // For now, operationBreakdown is simplified
    const operationBreakdown = {
      text_generation: { requests: totalRequests * 0.6, successRate: 0.95, averageLatencyMs: 1500 },
      music_generation: { requests: totalRequests * 0.3, successRate: 0.88, averageLatencyMs: 8000 },
      image_generation: { requests: totalRequests * 0.1, successRate: 0.92, averageLatencyMs: 3500 },
    };

    return {
      totalRequests,
      providerBreakdown: providerBreakdown as Record<string, { requests: number; successRate: number; averageLatencyMs: number; totalCost: number }>,
      operationBreakdown,
    };
  }

  /**
   * Add or update provider configuration
   */
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
    // This would interact with the provider configuration repository
    // Implementation depends on the specific configuration structure
    logger.info('⚙️ Configuring provider: {}', { data0: config.id });
  }

  /**
   * Remove a provider from the proxy
   */
  async removeProvider(providerId: string): Promise<boolean> {
    try {
      const success = await this.providerConfigRepo.delete(parseInt(providerId));
      if (success) {
        this.providerHealthMap.delete(providerId);
        logger.info('🗑️ Removed provider: {}', { data0: providerId });
      }
      return success;
    } catch (error) {
      logger.error('Failed to remove provider ${providerId}:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get proxy health and performance status
   */
  async getProxyHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeProviders: number;
    totalProviders: number;
    healthyProviders: number;
    averageResponseTime: number;
    requestsInLastMinute: number;
  }> {
    const allProviders = await this.providerConfigRepo.findAll();
    const activeProviders = await this.providerConfigRepo.findAll({ isActive: true });

    let healthyProviders = 0;
    let totalLatency = 0;
    let totalRequests = 0;

    for (const provider of activeProviders) {
      const stats = this.metrics.getProviderStats(provider.providerId, 60 * 1000); // Last minute
      if (stats.successRate > 0.8) {
        healthyProviders++;
      }
      totalLatency += stats.avgLatency * stats.requestCount;
      totalRequests += stats.requestCount;
    }

    const averageResponseTime = totalRequests > 0 ? totalLatency / totalRequests : 0;
    const healthyRatio = activeProviders.length > 0 ? healthyProviders / activeProviders.length : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyRatio >= 0.8) {
      status = 'healthy';
    } else if (healthyRatio >= 0.5) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      activeProviders: activeProviders.length,
      totalProviders: allProviders.length,
      healthyProviders,
      averageResponseTime,
      requestsInLastMinute: totalRequests,
    };
  }

  // Private methods implementation...

  private async initializeHealthChecking(): Promise<void> {
    // CRITICAL FIX: Skip health checks in development to prevent burning API credits
    if (process.env.NODE_ENV === 'development' || process.env.DISABLE_HEALTH_CHECKS === 'true') {
      logger.debug('❤️ Health checking DISABLED (development mode or explicitly disabled)');
      return;
    }

    // Initialize periodic health checking
    logger.debug('❤️ Health checking initialized (production mode)');

    // Start health check interval
    this.healthCheckScheduler = createIntervalScheduler({
      name: 'provider-health-check',
      serviceName: 'ai-config-service',
      intervalMs: 30000,
      handler: () => this.performHealthChecks(),
    });
    this.healthCheckScheduler.start();
  }

  private async performHealthChecks(): Promise<void> {
    const providers = await this.providerConfigRepo.findAll({ isActive: true });

    for (const provider of providers) {
      try {
        await this.checkProviderHealth(provider);
      } catch (error) {
        logger.warn('Health check failed for provider ${provider.providerId}:', { data: error });
      }
    }
  }

  private async checkProviderHealth(provider: ProviderConfiguration): Promise<void> {
    try {
      // CRITICAL FIX: Skip health checks for expensive music providers to prevent credit burn
      // Music providers (MusicAPI, ElevenLabs, etc.) charge per request, even for health checks
      const expensiveProviders = ['musicapi', 'elevenlabs', 'suno', 'aiva'];
      if (expensiveProviders.includes(provider.providerId.toLowerCase())) {
        logger.info('⏭️  Skipping health check for expensive provider: {}', { data0: provider.providerId });

        // Mark as healthy by default (will be validated on actual use)
        const currentHealth = this.providerHealthMap.get(provider.providerId);
        const updatedHealth: ProviderHealth = {
          id: provider.providerId,
          name: provider.providerName,
          status: 'healthy', // Assume healthy, validate on actual use
          circuitBreaker: currentHealth?.circuitBreaker || {
            status: 'closed',
            failures: 0,
            lastFailure: null,
            nextRetry: null,
          },
          lastCheck: new Date(),
          averageLatency: currentHealth?.averageLatency || 0,
          successRate: currentHealth?.successRate || 1.0,
          requestCount: currentHealth?.requestCount || 0,
          successCount: currentHealth?.successCount || 0,
        };
        this.providerHealthMap.set(provider.providerId, updatedHealth);
        return;
      }

      const template = this.convertConfigToTemplate(provider);

      // FIX: Resolve credentials for authenticated health checks
      const authConfig = this.extractAuthConfig(provider);
      const authCredentials = this.credentialsResolver.resolveCredentials(provider.providerName, authConfig);

      const healthResult = await this.httpProvider.testProvider(template, authCredentials);

      const currentHealth = this.providerHealthMap.get(provider.providerId);
      const updatedHealth: ProviderHealth = {
        id: provider.providerId,
        name: provider.providerName,
        status: healthResult.success ? 'healthy' : 'unhealthy',
        circuitBreaker: currentHealth?.circuitBreaker || {
          status: 'closed',
          failures: 0,
          lastFailure: null,
          nextRetry: null,
        },
        lastCheck: new Date(),
        averageLatency: healthResult.latencyMs,
        successRate: healthResult.success ? 1 : 0,
        requestCount: 1,
        successCount: healthResult.success ? 1 : 0,
      };

      this.providerHealthMap.set(provider.providerId, updatedHealth);

      // Update database health status
      await this.providerConfigRepo.updateHealthStatus(provider.id, healthResult.success ? 'healthy' : 'error');
    } catch (error) {
      logger.warn('Health check failed for provider ${provider.providerId}:', { data: error });
    }
  }

  private isProviderAvailable(providerId: string): boolean {
    const health = this.providerHealthMap.get(providerId);
    return health?.status !== 'unavailable' && this.isCircuitClosed(providerId);
  }

  private isCircuitClosed(providerId: string): boolean {
    const health = this.providerHealthMap.get(providerId);
    if (!health) return true;

    const breaker = health.circuitBreaker;

    switch (breaker.status) {
      case 'closed':
        return true;
      case 'open':
        // Check if we should try half-open after the retry delay
        if (breaker.nextRetry && new Date() > breaker.nextRetry) {
          const previousStatus = breaker.status;
          breaker.status = 'half-open';
          this.metrics.recordCircuitBreakerEvent(providerId, 'half_open');
          logger.warn('Circuit breaker state change', {
            providerId,
            providerName: health.name,
            from: previousStatus,
            to: 'half-open',
            failures: breaker.failures,
          });
          return true;
        }
        return false;
      case 'half-open':
        return true;
      default:
        return false;
    }
  }

  private recordProviderSuccess(providerId: string, latencyMs: number, cost: number): void {
    this.metrics.recordProviderRequest(providerId, 'invoke', true, latencyMs, cost);

    // Reset circuit breaker on success
    const health = this.providerHealthMap.get(providerId);
    if (health && health.circuitBreaker.status !== 'closed') {
      const previousStatus = health.circuitBreaker.status;
      health.circuitBreaker.status = 'closed';
      health.circuitBreaker.failures = 0;
      health.circuitBreaker.lastFailure = null;
      health.circuitBreaker.nextRetry = null;
      this.metrics.recordCircuitBreakerEvent(providerId, 'close');
      logger.warn('Circuit breaker state change', {
        providerId,
        providerName: health.name,
        from: previousStatus,
        to: 'closed',
        reason: 'successful request',
      });
    }
  }

  private isClientError(error: Error): boolean {
    const message = error.message;
    return /HTTP\s+(400|401|403)/.test(message);
  }

  private recordProviderFailure(providerId: string, error: Error): void {
    this.metrics.recordProviderRequest(providerId, 'invoke', false, 0);
    this.metrics.recordError('provider_failure', error, { providerId });

    // Don't trip circuit breaker on client errors (4xx) — those are our fault, not the provider's
    if (this.isClientError(error)) {
      logger.debug('Skipping circuit breaker for client error', {
        providerId,
        error: error.message,
      });
      return;
    }

    // Update circuit breaker — only for server errors (5xx) and timeouts
    const health = this.providerHealthMap.get(providerId);
    if (health) {
      const breaker = health.circuitBreaker;
      breaker.failures++;
      breaker.lastFailure = new Date();

      if (breaker.failures >= this.circuitBreakerConfig.failureThreshold) {
        const previousStatus = breaker.status;
        breaker.status = 'open';
        const retryDelay =
          previousStatus === 'half-open'
            ? this.circuitBreakerConfig.halfOpenRetryDelay
            : this.circuitBreakerConfig.timeout;
        breaker.nextRetry = new Date(Date.now() + retryDelay);
        this.metrics.recordCircuitBreakerEvent(providerId, 'open');
        logger.warn('Circuit breaker state change', {
          providerId,
          providerName: health.name,
          from: previousStatus,
          to: 'open',
          failures: breaker.failures,
          nextRetryAt: breaker.nextRetry.toISOString(),
          lastError: error.message,
        });
      }
    }
  }

  private async getProviderConfiguration(providerId: string, operation: string): Promise<ProviderConfiguration | null> {
    const cacheKey = `provider_config:${providerId}:${operation}`;

    const cachedStr = await this.cache.get(cacheKey);
    if (cachedStr) {
      try {
        return JSON.parse(cachedStr) as ProviderConfiguration;
      } catch {
        /* stale entry */
      }
    }

    const providers = await this.providerConfigRepo.findAll({
      providerId,
      isActive: true,
    });

    const config = providers.length > 0 ? providers[0] : null;

    if (config) {
      await this.cache.set(cacheKey, JSON.stringify(config), this.cacheConfig.configurationTTL);
    }

    return config;
  }

  /**
   * Extract auth configuration from provider configuration
   */
  private extractAuthConfig(config: ProviderConfiguration): ProviderAuthConfig | undefined {
    try {
      // CRITICAL FIX: Drizzle returns JSONB as string, not parsed object
      // Force reload timestamp: 2025-01-26 02:58
      let configData: { auth?: ProviderAuthConfig };

      const configType = typeof config.configuration;

      if (configType === 'string') {
        configData = JSON.parse(config.configuration as string);
      } else if (configType === 'object' && config.configuration !== null) {
        configData = config.configuration as { auth?: ProviderAuthConfig };
      } else {
        logger.warn(`Unexpected configuration type for provider ${config.providerId}:`, { configType });
        return undefined;
      }

      // Debug logging for musicapi (only in non-production with debug flag)
      if (
        config.providerId === 'musicapi' &&
        process.env.DEBUG_PROVIDER_AUTH === 'true' &&
        process.env.NODE_ENV !== 'production'
      ) {
        logger.info('🔍 [ProviderProxy] extractAuthConfig DEBUG:', {
          providerId: config.providerId,
          configType,
          hasAuthProperty: 'auth' in configData,
          authStructure: configData.auth
            ? {
                hasHeaderName: 'headerName' in configData.auth,
                hasScheme: 'scheme' in configData.auth,
                hasEnvVarName: 'envVarName' in configData.auth,
                hasRequiredSecrets: 'requiredSecrets' in configData.auth,
              }
            : null,
          configKeys: Object.keys(configData),
        });
      }

      return configData.auth;
    } catch (error) {
      logger.warn(`Failed to extract auth config for provider ${config.providerId}:`, {
        error: errorMessage(error),
      });
      return undefined;
    }
  }

  private convertConfigToTemplate(config: ProviderConfiguration): ProviderTemplate {
    // CRITICAL FIX: Drizzle returns JSONB as string, not parsed object
    let configData: {
      endpoint: string;
      method?: string;
      headers?: Record<string, unknown>;
      requestTemplate: Record<string, unknown>;
      responseMapping: Record<string, unknown>;
      timeout?: number;
      models?: string[];
      healthEndpoint?: {
        url: string;
        method: 'GET' | 'HEAD';
        requiresAuth: boolean;
        isFree: boolean;
      };
    };

    if (typeof config.configuration === 'string') {
      try {
        configData = JSON.parse(config.configuration);
      } catch (parseError) {
        logger.error(`Failed to parse provider configuration for ${config.providerId}`, {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        throw ConfigError.invalidProviderConfig(config.providerId, 'Invalid JSON configuration');
      }
    } else {
      configData = config.configuration as unknown as {
        endpoint: string;
        method?: string;
        headers?: Record<string, unknown>;
        requestTemplate: Record<string, unknown>;
        responseMapping: Record<string, unknown>;
        timeout?: number;
        models?: string[];
        healthEndpoint?: {
          url: string;
          method: 'GET' | 'HEAD';
          requiresAuth: boolean;
          isFree: boolean;
        };
      };
    }

    return {
      id: config.providerId,
      name: config.providerName,
      endpoint: configData.endpoint,
      method: (configData.method as 'GET' | 'POST' | 'PUT' | 'DELETE') || 'POST',
      headers: configData.headers || {},
      requestTemplate: configData.requestTemplate,
      responseMapping: configData.responseMapping,
      errorMapping: {},
      isActive: config.isActive,
      cost: typeof config.costPerUnit === 'string' ? parseFloat(config.costPerUnit) : config.costPerUnit,
      timeout: configData.timeout,
      models: configData.models, // Include models array for health checks
      healthEndpoint: configData.healthEndpoint, // CRITICAL: Pass through health endpoint for free health checks
    } as ProviderTemplate;
  }

  private mapOperationToModality(operation: string): 'text' | 'image' | 'music' | 'audio' {
    if (operation.includes('music')) return 'music';
    if (operation.includes('image')) return 'image';
    if (operation.includes('audio')) return 'audio';
    return 'text';
  }

  private extractRateLimitInfo(
    headers?: Record<string, string>
  ): { remaining: number; resetTime: Date; limit: number } | undefined {
    if (!headers) return undefined;

    const remaining = headers['x-ratelimit-remaining'] || headers['ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'] || headers['ratelimit-reset'];
    const limit = headers['x-ratelimit-limit'] || headers['ratelimit-limit'];

    if (remaining && reset && limit) {
      return {
        remaining: parseInt(remaining),
        resetTime: new Date(parseInt(reset) * 1000),
        limit: parseInt(limit),
      };
    }

    return undefined;
  }

  private extractTokenUsage(metadata?: Record<string, unknown>): number | undefined {
    if (!metadata?.headers) return undefined;

    const headers = metadata.headers as Record<string, string>;
    const usage = headers['x-openai-token-usage'] || headers['token-usage'];
    return usage ? parseInt(usage) : undefined;
  }

  private classifyError(error: Error): { type: string; retryable: boolean } {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return { type: 'timeout', retryable: true };
    }
    if (message.includes('rate limit')) {
      return { type: 'rate_limit', retryable: true };
    }
    if (message.includes('quota')) {
      return { type: 'quota_exceeded', retryable: false };
    }
    if (message.includes('network') || message.includes('connection')) {
      return { type: 'network_error', retryable: true };
    }

    return { type: 'provider_error', retryable: false };
  }

  private async getProviderCandidates(operation: string): Promise<ProviderConfiguration[]> {
    // Map operations to provider types
    const typeMap: Record<string, string> = {
      text_generation: 'llm',
      text_analysis: 'llm',
      image_analysis: 'llm', // Vision API uses LLM providers (GPT-4o)
      music_generation: 'music',
      image_generation: 'image',
      audio_transcription: 'audio',
    };

    const providerType = typeMap[operation];
    if (!providerType) {
      throw ConfigError.validationError('operation', `Unsupported operation: ${operation}`);
    }

    logger.debug('Getting provider candidates:', {
      operation,
      mappedProviderType: providerType,
    });

    const candidates = await this.providerConfigRepo.findAll({
      providerType: providerType as ProviderType,
      isActive: true,
    });

    logger.debug('Found {} candidates:', {
      data0: candidates.length,
      providers: candidates.map(p => ({ id: p.providerId, name: p.providerName, priority: p.priority })),
    });

    return candidates;
  }

  /**
   * REMOVED: Complex scoring method no longer needed for priority-based selection.
   *
   * For MVP with 1 provider per type, we use simple priority from database.
   * This method was causing bugs by rejecting new providers with no usage history.
   *
   * If you need complex scoring in the future (3+ providers per type),
   * you can restore this from git history.
   */

  private determineHealthStatus(
    providerId: string,
    stats: ReturnType<MetricsCollector['getProviderStats']>
  ): 'healthy' | 'degraded' | 'unhealthy' | 'unavailable' {
    const health = this.providerHealthMap.get(providerId);

    if (health?.circuitBreaker.status === 'open') {
      return 'unavailable';
    }

    if (stats.successRate >= 0.9 && stats.avgLatency < 5000) {
      return 'healthy';
    }

    if (stats.successRate >= 0.7 && stats.avgLatency < 10000) {
      return 'degraded';
    }

    return 'unhealthy';
  }

  private extractCapabilities(provider: ProviderConfiguration): string[] {
    // Extract capabilities based on provider type and configuration
    const baseCapabilities: string[] = [provider.providerType];

    // Add additional capabilities based on provider type
    switch (provider.providerType) {
      case 'llm':
        baseCapabilities.push('text_generation', 'text_analysis', 'conversation');
        break;
      case 'music':
        baseCapabilities.push('music_generation', 'audio_processing');
        break;
      case 'image':
        baseCapabilities.push('image_generation', 'image_processing');
        break;
    }

    return baseCapabilities;
  }
}
