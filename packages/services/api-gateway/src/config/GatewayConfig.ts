/**
 * Unified Gateway Configuration
 * Single source of truth for all API Gateway configuration
 * Consolidates HTTP, circuit breaker, service, and environment settings
 */

import { environmentConfig } from './environment';
import { circuitBreakerConfig, type CircuitBreakerConfig } from './DynamicCircuitBreakerConfig';
import { getServiceUrl, getLogger } from './service-urls';
import { timeoutHierarchy } from '@aiponge/platform-core';

const logger = getLogger('api-gateway:config');

/**
 * HTTP client configuration defaults
 */
export class HttpConfig {
  static readonly defaults = {
    timeout: environmentConfig.defaultRequestTimeoutMs,
    retries: environmentConfig.defaultRetries,
  };

  static readonly aggregation = {
    // Higher timeout for aggregation endpoints that call multiple services
    timeout: Math.max(environmentConfig.defaultRequestTimeoutMs * 2, 10000),
    retries: environmentConfig.defaultRetries,
  };

  static readonly longRunning = {
    // For services that may take longer (AI, music generation)
    timeout: 30000,
    retries: 1,
  };
}

/**
 * Circuit breaker configuration wrapper
 */
export class CircuitBreakerSettings {
  static getConfig(serviceName?: string): CircuitBreakerConfig {
    if (serviceName) {
      return circuitBreakerConfig.getConfigForService(serviceName);
    }
    return circuitBreakerConfig.getGlobalConfig();
  }

  static get global(): CircuitBreakerConfig {
    return circuitBreakerConfig.getGlobalConfig();
  }

  static get defaults() {
    return {
      timeout: environmentConfig.circuitBreakerTimeoutMs,
      errorThreshold: 50,
      resetTimeout: 30000,
      volumeThreshold: 10,
    };
  }
}

/**
 * Service-specific configuration
 * Maps service names to their specific settings (timeouts, retries, etc.)
 */
export class ServiceSettings {
  private static readonly serviceConfigs: Record<
    string,
    {
      timeout: number;
      retries: number;
      description: string;
    }
  > = {
    'user-service': {
      timeout: timeoutHierarchy.getGatewayTimeout('user-service'),
      retries: 2,
      description: 'User profile and preferences service',
    },
    'ai-content-service': {
      timeout: timeoutHierarchy.getGatewayTimeout('ai-content-service'),
      retries: 1,
      description: 'AI-powered content generation',
    },
    'ai-config-service': {
      timeout: timeoutHierarchy.getGatewayTimeout('ai-config-service'),
      retries: 2,
      description: 'AI provider configuration',
    },
    'music-service': {
      timeout: timeoutHierarchy.getGatewayTimeout('music-service'),
      retries: 1,
      description: 'Music generation and streaming',
    },
    'system-service': {
      timeout: timeoutHierarchy.getGatewayTimeout('system-service'),
      retries: 2,
      description: 'System health and monitoring',
    },
    'storage-service': {
      timeout: timeoutHierarchy.getGatewayTimeout('storage-service'),
      retries: 2,
      description: 'File and object storage',
    },
    'ai-analytics-service': {
      timeout: timeoutHierarchy.getGatewayTimeout('ai-analytics-service'),
      retries: 2,
      description: 'AI analytics and insights',
    },
  };

  static getConfig(serviceName: string) {
    const config = this.serviceConfigs[serviceName];

    if (!config) {
      // Return defaults for unknown services
      return {
        timeout: HttpConfig.defaults.timeout,
        retries: HttpConfig.defaults.retries,
        description: 'Unknown service',
      };
    }

    return config;
  }

  static getBaseUrl(serviceName: string): string {
    return getServiceUrl(serviceName);
  }

  static getAllServices() {
    return Object.keys(this.serviceConfigs);
  }
}

/**
 * CORS configuration
 */
export class CorsSettings {
  static get config() {
    return {
      origins: environmentConfig.corsOrigins,
      frontendHost: environmentConfig.corsFrontendHost,
      frontendPorts: environmentConfig.corsFrontendPorts,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Correlation-ID',
        'X-Request-ID',
        'X-User-ID',
        'X-Idempotency-Key',
      ],
    };
  }
}

/**
 * Rate limiting configuration
 */
export class RateLimitSettings {
  static get defaults() {
    return {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      authenticatedMaxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '200'),
      skipSuccessfulRequests: false,
    };
  }

  static get strict() {
    return {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
      maxRequests: parseInt(process.env.RATE_LIMIT_STRICT_MAX || '20'),
      skipSuccessfulRequests: false,
    };
  }

  /**
   * SCALABILITY: Redis Sentinel configuration for high-availability deployments
   * Sentinel provides automatic failover when master Redis fails
   *
   * Environment variables:
   * - REDIS_SENTINEL_HOSTS: Comma-separated list of sentinel hosts (e.g., "sentinel1:26379,sentinel2:26379")
   * - REDIS_SENTINEL_MASTER: Master set name (default: "mymaster")
   */
  static get sentinel(): {
    enabled: boolean;
    hosts: Array<{ host: string; port: number }>;
    masterName: string;
    password?: string;
  } {
    const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS;

    if (!sentinelHosts) {
      return {
        enabled: false,
        hosts: [],
        masterName: 'mymaster',
      };
    }

    const hosts = sentinelHosts.split(',').map(hostPort => {
      const [host, port] = hostPort.trim().split(':');
      return {
        host: host || 'localhost',
        port: parseInt(port || '26379', 10),
      };
    });

    return {
      enabled: true,
      hosts,
      masterName: process.env.REDIS_SENTINEL_MASTER || 'mymaster',
      password: process.env.REDIS_SENTINEL_PASSWORD || undefined,
    };
  }

  static get redis() {
    const redisUrl = process.env.REDIS_URL;

    // Parse Redis URL if provided
    if (redisUrl) {
      try {
        const url = new URL(redisUrl);
        return {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
          password: url.password || undefined,
          db: 0,
          keyPrefix: 'api-gateway:ratelimit:',
        };
      } catch (error) {
        logger.error('Failed to parse REDIS_URL, rate limiting will use in-memory fallback', { error });
      }
    }

    // Fallback to environment variables
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;

    return {
      host,
      port,
      password,
      db: 0,
      keyPrefix: 'api-gateway:ratelimit:',
    };
  }

  static get isRedisEnabled(): boolean {
    // Redis is enabled if REDIS_URL, REDIS_HOST, or Sentinel is configured
    return !!(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_SENTINEL_HOSTS);
  }

  static get isSentinelEnabled(): boolean {
    return !!process.env.REDIS_SENTINEL_HOSTS;
  }

  static get lenient() {
    return {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
      maxRequests: parseInt(process.env.RATE_LIMIT_LENIENT_MAX || '300'),
      skipSuccessfulRequests: true,
    };
  }
}

/**
 * Unified Gateway Configuration
 * Main entry point for all API Gateway configuration
 */
export class GatewayConfig {
  static readonly http = HttpConfig;
  static readonly circuitBreaker = CircuitBreakerSettings;
  static readonly services = ServiceSettings;
  static readonly cors = CorsSettings;
  static readonly rateLimit = RateLimitSettings;

  static readonly server = {
    port: environmentConfig.port,
    host: environmentConfig.host,
    nodeEnv: environmentConfig.nodeEnv,
    logLevel: environmentConfig.logLevel,
  };

  static readonly monitoring = {
    healthCheckInterval: environmentConfig.healthCheckInterval,
    maxHeartbeatAge: environmentConfig.maxHeartbeatAge,
    serviceDiscoveryEnabled: environmentConfig.serviceDiscoveryEnabled,
  };

  static readonly environment = environmentConfig;

  /**
   * Get complete configuration summary for monitoring/debugging
   */
  static getConfigSummary() {
    return {
      server: this.server,
      http: {
        defaults: this.http.defaults,
        aggregation: this.http.aggregation,
        longRunning: this.http.longRunning,
      },
      circuitBreaker: this.circuitBreaker.defaults,
      services: this.services.getAllServices().map(name => ({
        name,
        ...this.services.getConfig(name),
        baseUrl: this.services.getBaseUrl(name),
      })),
      cors: this.cors.config,
      monitoring: this.monitoring,
    };
  }
}

export default GatewayConfig;
