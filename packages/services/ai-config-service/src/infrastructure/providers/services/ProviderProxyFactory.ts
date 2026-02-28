/**
 * ProviderProxy Factory - Dependency injection and service creation
 * Centralizes ProviderProxy instantiation with proper dependency management
 */

import { ProviderProxy } from './ProviderProxy';
import { CredentialsResolver } from './CredentialsResolver';
import { IProviderProxy } from '@domains/providers/application/interfaces/IProviderProxy';
import { IProviderConfigRepository } from '@domains/providers/domain/repositories/IProviderConfigRepository';
import { DrizzleProviderConfigRepository } from '../repositories/DrizzleProviderConfigRepository';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { type ICache, createRedisCache } from '@aiponge/platform-core';
import { MetricsCollector } from '@infrastructure/monitoring/MetricsCollector';
import { getLogger } from '@config/service-urls';
import { ConfigError } from '../../../application/errors';

const logger = getLogger('ai-config-service-providerproxyfactory');

export interface ProviderProxyConfig {
  repository?: IProviderConfigRepository;
  cache?: ICache;
  metrics?: MetricsCollector;
  credentialsResolver?: CredentialsResolver;
  enableHealthChecking?: boolean;
  circuitBreakerConfig?: {
    failureThreshold: number;
    timeout: number;
    halfOpenMaxCalls: number;
  };
  cacheConfig?: {
    providerSelectionTTL: number;
    healthCheckTTL: number;
    configurationTTL: number;
  };
}

/**
 * Singleton ProviderProxy factory with dependency injection
 */
export class ProviderProxyFactory {
  private static instance: IProviderProxy | null = null;
  private static config: ProviderProxyConfig | null = null;

  /**
   * Create or get singleton ProviderProxy instance
   */
  static getInstance(config?: ProviderProxyConfig): IProviderProxy {
    if (!this.instance || (config && config !== this.config)) {
      this.instance = this.createProviderProxy(config);
      this.config = config || null;
      logger.debug('🏭 Created new ProviderProxy instance');
    }

    return this.instance;
  }

  /**
   * Create a new ProviderProxy instance with dependency injection
   */
  static createProviderProxy(config?: ProviderProxyConfig): IProviderProxy {
    logger.debug('🔧 Creating ProviderProxy with dependencies...');

    // Initialize dependencies with fallbacks
    const repository = config?.repository || this.createDefaultRepository();
    const cache = config?.cache || this.createDefaultCache();
    const metrics = config?.metrics || this.createDefaultMetrics();
    const credentialsResolver = config?.credentialsResolver || this.createDefaultCredentialsResolver();

    // Create ProviderProxy instance with configuration
    const proxy = new ProviderProxy(
      repository,
      cache,
      metrics,
      credentialsResolver,
      config?.circuitBreakerConfig,
      config?.cacheConfig
    );

    logger.debug('ProviderProxy created successfully');
    return proxy;
  }

  /**
   * Create ProviderProxy for testing with mock dependencies
   */
  static createForTesting(
    mockRepository: IProviderConfigRepository,
    mockCache?: ICache,
    mockMetrics?: MetricsCollector,
    mockCredentialsResolver?: CredentialsResolver
  ): IProviderProxy {
    logger.info('🧪 Creating ProviderProxy for testing');

    return new ProviderProxy(
      mockRepository,
      mockCache || this.createDefaultCache(),
      mockMetrics || this.createDefaultMetrics(),
      mockCredentialsResolver || this.createDefaultCredentialsResolver(),
      // Use testing-friendly circuit breaker config
      {
        failureThreshold: 2,
        timeout: 5000,
        halfOpenMaxCalls: 1,
      },
      // Use short TTLs for testing
      {
        providerSelectionTTL: 1,
        healthCheckTTL: 1,
        configurationTTL: 1,
      }
    );
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
    this.config = null;
    logger.info('Reset singleton instance');
  }

  /**
   * Initialize ProviderProxy with environment-specific configuration
   */
  static initializeForEnvironment(environment: 'development' | 'production' | 'test'): IProviderProxy {
    logger.info('Initializing for {} environment', { data0: environment });

    const config: ProviderProxyConfig = {
      enableHealthChecking: environment !== 'test',
    };

    switch (environment) {
      case 'development':
        config.cacheConfig = {
          providerSelectionTTL: 10, // Shorter TTL for development
          healthCheckTTL: 30,
          configurationTTL: 60,
        };
        config.circuitBreakerConfig = {
          failureThreshold: 3, // More forgiving in development
          timeout: 30000, // 30 seconds
          halfOpenMaxCalls: 2,
        };
        break;

      case 'production':
        config.cacheConfig = {
          providerSelectionTTL: 60,
          healthCheckTTL: 120,
          configurationTTL: 300,
        };
        config.circuitBreakerConfig = {
          failureThreshold: 10, // More tolerant in production
          timeout: 120000, // 2 minutes
          halfOpenMaxCalls: 5,
        };
        break;

      case 'test':
        config.cacheConfig = {
          providerSelectionTTL: 1, // Very short for tests
          healthCheckTTL: 1,
          configurationTTL: 1,
        };
        config.circuitBreakerConfig = {
          failureThreshold: 2, // Fast failure for tests
          timeout: 1000, // 1 second
          halfOpenMaxCalls: 1,
        };
        config.enableHealthChecking = false;
        break;
    }

    return this.getInstance(config);
  }

  /**
   * Create ProviderProxy with specific database connection
   * Note: Custom database URLs are no longer supported - use the default DI-injected connection
   */
  static createWithDatabase(_databaseUrl?: string): IProviderProxy {
    logger.info('Creating ProviderProxy with database');

    const repository = createDrizzleRepository(DrizzleProviderConfigRepository);

    return this.createProviderProxy({
      repository,
    });
  }

  /**
   * Create ProviderProxy with custom configuration
   */
  static createWithConfig(config: ProviderProxyConfig): IProviderProxy {
    logger.info('⚙️ Creating ProviderProxy with custom configuration');
    return this.createProviderProxy(config);
  }

  /**
   * Get the current configuration
   */
  static getConfig(): ProviderProxyConfig | null {
    return this.config;
  }

  /**
   * Check if instance is initialized
   */
  static isInitialized(): boolean {
    return this.instance !== null;
  }

  /**
   * Get health status of the factory and current instance
   */
  static async getFactoryHealth(): Promise<{
    factoryStatus: 'initialized' | 'not_initialized';
    instanceType: string;
    dependencies: {
      repository: boolean;
      cache: boolean;
      metrics: boolean;
      credentialsResolver: boolean;
    };
    configuration: Record<string, unknown>;
  }> {
    const isInitialized = this.isInitialized();

    let dependencies = {
      repository: false,
      cache: false,
      metrics: false,
      credentialsResolver: false,
    };

    let configuration: Record<string, unknown> = {};

    if (isInitialized && this.config) {
      dependencies = {
        repository: !!this.config.repository,
        cache: !!this.config.cache,
        metrics: !!this.config.metrics,
        credentialsResolver: !!this.config.credentialsResolver,
      };

      configuration = {
        enableHealthChecking: this.config.enableHealthChecking,
        circuitBreakerConfig: this.config.circuitBreakerConfig,
        cacheConfig: this.config.cacheConfig,
      };
    }

    return {
      factoryStatus: isInitialized ? 'initialized' : 'not_initialized',
      instanceType: isInitialized ? 'ProviderProxy' : 'none',
      dependencies,
      configuration,
    };
  }

  // Private factory methods for creating default dependencies

  private static createDefaultRepository(): IProviderConfigRepository {
    try {
      return createDrizzleRepository(DrizzleProviderConfigRepository);
    } catch (error) {
      logger.warn('Failed to create PostgreSQL repository, using fallback');
      throw ConfigError.providerInitializationFailed(
        'ProviderProxy',
        'Database configuration required',
        error instanceof Error ? error : undefined
      );
    }
  }

  private static createDefaultCache(): ICache {
    return createRedisCache({ serviceName: 'ai-config-service', keyPrefix: 'aiponge:providers:' });
  }

  private static createDefaultMetrics(): MetricsCollector {
    return new MetricsCollector();
  }

  private static createDefaultCredentialsResolver(): CredentialsResolver {
    return new CredentialsResolver();
  }
}

/**
 * Global ProviderProxy instance getter
 * Automatically initializes for current environment if not already done
 */
export function getProviderProxy(): IProviderProxy {
  if (!ProviderProxyFactory.isInitialized()) {
    const env = (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development';
    logger.info('🚀 Auto-initializing for {} environment', { data0: env });
    return ProviderProxyFactory.initializeForEnvironment(env);
  }

  return ProviderProxyFactory.getInstance();
}

/**
 * Initialize ProviderProxy with custom configuration
 */
export function initializeProviderProxy(config: ProviderProxyConfig): IProviderProxy {
  logger.debug('🎛️ Initializing with custom configuration');
  return ProviderProxyFactory.getInstance(config);
}

/**
 * Reset ProviderProxy for testing or reinitialization
 */
export function resetProviderProxy(): void {
  ProviderProxyFactory.reset();
}

/**
 * Get current ProviderProxy instance without creating one
 */
export function getCurrentProviderProxy(): IProviderProxy | null {
  return ProviderProxyFactory.isInitialized() ? ProviderProxyFactory.getInstance() : null;
}
