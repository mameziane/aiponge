/**
 * Unified Configuration Manager
 * Centralized system for managing all configuration values across the platform
 * Eliminates hardcoded values and provides environment-aware configuration
 */

/// <reference types="node" />

import { ServiceLocator, DomainError } from '@aiponge/platform-core';
import { getLogger } from './service-urls';

const logger = getLogger('configuration-manager');

interface DatabaseConfig {
  url: string;
  poolSize: number;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
  ssl: boolean;
  retries: number;
}

interface ServiceConfig {
  name: string;
  host: string;
  port: number;
  baseUrl: string;
  healthEndpoint: string;
  timeoutMs: number;
}

interface CacheConfig {
  redis: {
    url: string;
    ttl: number;
    maxMemory: string;
  };
  memory: {
    maxSize: number;
    ttl: number;
  };
}

interface ExternalProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  retryAttempts: number;
}

interface SecurityConfig {
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    origins: string[];
    credentials: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
}

interface HealthCheckConfig {
  interval: {
    development: number;
    production: number;
  };
  timeoutMs: number;
  retries: number;
  userAgent: string;
}

export interface UnifiedConfig {
  environment: 'development' | 'production' | 'test';
  database: DatabaseConfig;
  services: Record<string, ServiceConfig>;
  cache: CacheConfig;
  security: SecurityConfig;
  healthCheck: HealthCheckConfig;
  externalProviders: Record<string, ExternalProvider>;
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
  };
}

class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: UnifiedConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private loadConfiguration(): UnifiedConfig {
    const environment = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';

    return {
      environment,
      database: this.loadDatabaseConfig(),
      services: this.loadServicesConfig(),
      cache: this.loadCacheConfig(),
      security: this.loadSecurityConfig(),
      healthCheck: this.loadHealthCheckConfig(),
      externalProviders: this.loadExternalProvidersConfig(),
      logging: this.loadLoggingConfig(),
    };
  }

  private loadDatabaseConfig(): DatabaseConfig {
    return {
      url:
        process.env.DATABASE_URL || `postgresql://127.0.0.1:${ServiceLocator.getServicePort('postgresql')}/aiponge_dev`,
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
      connectionTimeoutMs: parseInt(
        process.env.DATABASE_CONNECTION_TIMEOUT_MS || process.env.DB_CONNECTION_TIMEOUT || '30000'
      ),
      queryTimeoutMs: parseInt(process.env.DATABASE_QUERY_TIMEOUT_MS || process.env.DB_QUERY_TIMEOUT || '10000'),
      ssl: process.env.DATABASE_SSL === 'true',
      retries: parseInt(process.env.DB_RETRIES || '3'),
    };
  }

  private loadServicesConfig(): Record<string, ServiceConfig> {
    const services: Record<string, ServiceConfig> = {};
    for (const serviceName of ServiceLocator.getBackendServiceNames()) {
      const camelKey = serviceName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      services[camelKey] = this.createServiceConfig(serviceName);
    }
    return services;
  }

  private createServiceConfig(serviceName: string): ServiceConfig {
    const port = ServiceLocator.getServicePort(serviceName);
    const envPrefix = serviceName.replace(/-/g, '_').toUpperCase();
    return {
      name: serviceName,
      host: process.env[`${envPrefix}_HOST`] || '127.0.0.1',
      port: parseInt(process.env[`${envPrefix}_PORT`] || port.toString()),
      baseUrl: process.env[`${envPrefix}_URL`] || `http://127.0.0.1:${port}`,
      healthEndpoint: '/health',
      timeoutMs: parseInt(process.env[`${envPrefix}_TIMEOUT_MS`] || process.env[`${envPrefix}_TIMEOUT`] || '30000'),
    };
  }

  private loadCacheConfig(): CacheConfig {
    return {
      redis: {
        url: process.env.REDIS_URL || `redis://127.0.0.1:${ServiceLocator.getServicePort('redis')}`,
        ttl: parseInt(process.env.REDIS_TTL || '3600'),
        maxMemory: process.env.REDIS_MAX_MEMORY || '256mb',
      },
      memory: {
        maxSize: parseInt(process.env.MEMORY_CACHE_SIZE || '100'),
        ttl: parseInt(process.env.MEMORY_CACHE_TTL || '300'),
      },
    };
  }

  private loadSecurityConfig(): SecurityConfig {
    const frontendPort = ServiceLocator.getServicePort('aiponge');

    return {
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      },
      cors: {
        origins: process.env.CORS_ORIGINS?.split(',') || [`http://127.0.0.1:${frontendPort}`],
        credentials: process.env.CORS_CREDENTIALS === 'true',
      },
      jwt: {
        secret: this.getRequiredJwtSecret(),
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
    };
  }

  private loadHealthCheckConfig(): HealthCheckConfig {
    return {
      interval: {
        development: parseInt(process.env.HEALTH_CHECK_INTERVAL_DEV || '30000'), // 30 seconds
        production: parseInt(process.env.HEALTH_CHECK_INTERVAL_PROD || '60000'), // 1 minute
      },
      timeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || process.env.HEALTH_CHECK_TIMEOUT || '5000'),
      retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3'),
      userAgent: process.env.HEALTH_CHECK_USER_AGENT || 'aiponge-Monitoring/1.0',
    };
  }

  private loadExternalProvidersConfig(): Record<string, ExternalProvider> {
    return {
      musicapi: this.createExternalProvider('MusicAPI.ai', 'MUSICAPI', 'https://api.musicapi.ai'),
      elevenlabs: this.createExternalProvider('ElevenLabs', 'ELEVENLABS', 'https://api.elevenlabs.io/v1'),
      anthropic: this.createExternalProvider('Anthropic', 'ANTHROPIC', 'https://api.anthropic.com'),
      openai: this.createExternalProvider('OpenAI', 'OPENAI', 'https://api.openai.com/v1'),
    };
  }

  private createExternalProvider(name: string, envPrefix: string, defaultBaseUrl: string): ExternalProvider {
    return {
      name,
      baseUrl: process.env[`${envPrefix}_BASE_URL`] || defaultBaseUrl,
      apiKey: process.env[`${envPrefix}_API_KEY`],
      timeoutMs: parseInt(process.env[`${envPrefix}_TIMEOUT_MS`] || process.env[`${envPrefix}_TIMEOUT`] || '30000'),
      retryAttempts: parseInt(process.env[`${envPrefix}_RETRY_ATTEMPTS`] || '3'),
    };
  }

  private loadLoggingConfig(): { level: 'debug' | 'info' | 'warn' | 'error'; format: 'json' | 'text' } {
    return {
      level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
      format: (process.env.LOG_FORMAT || 'text') as 'json' | 'text',
    };
  }

  private getRequiredJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new DomainError('JWT_SECRET environment variable is required but not set', 500);
    }
    return secret;
  }

  private validateConfiguration(): void {
    const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missing.length > 0) {
      throw new DomainError(`Missing required environment variables: ${missing.join(', ')}`, 500);
    }

    // Validate ports are not in conflict
    const ports = Object.values(this.config.services).map(service => service.port);
    const portCounts = new Map<number, string[]>();

    // Group services by port
    Object.entries(this.config.services).forEach(([serviceName, config]) => {
      if (!portCounts.has(config.port)) {
        portCounts.set(config.port, []);
      }
      portCounts.get(config.port)!.push(serviceName);
    });

    // Find actual conflicts (ports used by multiple services)
    const conflicts = Array.from(portCounts.entries())
      .filter(([port, services]) => services.length > 1)
      .map(([port, services]) => `port ${port} used by: ${services.join(', ')}`);

    if (conflicts.length > 0) {
      throw new DomainError(`Port conflicts detected:\n${conflicts.join('\n')}`, 500);
    }

    // Success - no logging needed (errors are logged on failure)
  }

  // Getter methods for easy access
  public getConfig(): UnifiedConfig {
    return this.config;
  }

  public getDatabaseConfig(): DatabaseConfig {
    return this.config.database;
  }

  public getServiceConfig(serviceName: string): ServiceConfig {
    const service = this.config.services[serviceName];
    if (!service) {
      throw new DomainError(`Service configuration not found: ${serviceName}`, 404);
    }
    return service;
  }

  public getAllServiceConfigs(): Record<string, ServiceConfig> {
    return this.config.services;
  }

  public getCacheConfig(): CacheConfig {
    return this.config.cache;
  }

  public getSecurityConfig(): SecurityConfig {
    return this.config.security;
  }

  public getHealthCheckConfig(): HealthCheckConfig {
    return this.config.healthCheck;
  }

  public getExternalProvider(providerName: string): ExternalProvider {
    const provider = this.config.externalProviders[providerName.toLowerCase()];
    if (!provider) {
      throw new DomainError(`Unknown external provider: ${providerName}`, 404);
    }
    return provider;
  }

  public getJwtConfig(): { secret: string; expiresIn: string } {
    return this.config.security.jwt;
  }

  public getCorsConfig(): { origins: string[]; credentials: boolean } {
    return this.config.security.cors;
  }

  public getRateLimitConfig(): { windowMs: number; maxRequests: number } {
    return this.config.security.rateLimit;
  }

  public getMusicConfig(): {
    polling: { interval: number; maxAttempts: number; timeoutMs: number };
    generation: { defaultModel: string; maxDuration: number; defaultDuration: number };
  } {
    return {
      polling: {
        interval: parseInt(process.env.MUSICAPI_POLL_INTERVAL || '5000'),
        maxAttempts: parseInt(process.env.MUSICAPI_MAX_ATTEMPTS || '60'),
        timeoutMs: parseInt(process.env.MUSICAPI_POLL_TIMEOUT_MS || process.env.MUSICAPI_POLL_TIMEOUT || '300000'),
      },
      generation: {
        defaultModel: process.env.MUSICAPI_DEFAULT_MODEL || 'sonic-v4',
        maxDuration: parseInt(process.env.MUSICAPI_MAX_DURATION || '120'),
        defaultDuration: parseInt(process.env.MUSICAPI_DEFAULT_DURATION || '30'),
      },
    };
  }

  public isProduction(): boolean {
    return this.config.environment === 'production';
  }

  public isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  public isTest(): boolean {
    return this.config.environment === 'test';
  }

  // Service URL builders
  public getServiceUrl(serviceName: string, path: string = ''): string {
    const service = this.getServiceConfig(serviceName);
    return `${service.baseUrl}${path}`;
  }

  public getHealthCheckUrl(serviceName: string): string {
    const service = this.getServiceConfig(serviceName);
    return `${service.baseUrl}${service.healthEndpoint || '/health'}`;
  }

  // Update configuration at runtime (for testing)
  public updateConfig(updates: Partial<UnifiedConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfiguration();
  }

  // Get configuration as environment variables format
  public exportAsEnv(): Record<string, string> {
    const env: Record<string, string> = {};

    // Database
    env.DATABASE_URL = this.config.database.url;
    env.DB_POOL_SIZE = this.config.database.poolSize.toString();

    // Services
    Object.entries(this.config.services).forEach(([name, service]) => {
      const upperName = name.toUpperCase().replace(/([A-Z])/g, '_$1');
      env[`${upperName}_HOST`] = service.host;
      env[`${upperName}_PORT`] = service.port.toString();
      env[`${upperName}_URL`] = service.baseUrl;
    });

    // Cache
    env.REDIS_URL = this.config.cache.redis.url;

    // Security
    env.JWT_SECRET = this.config.security.jwt.secret;

    return env;
  }
}

// Lazy singleton accessor — avoids crashing at module load when env vars are missing (e.g. in tests)
function getUnifiedConfig(): ConfigurationManager {
  return ConfigurationManager.getInstance();
}

// Export lazy proxy so existing `unifiedConfig.xyz` call sites keep working
export const unifiedConfig: ConfigurationManager = new Proxy({} as ConfigurationManager, {
  get(_target, prop, receiver) {
    return Reflect.get(getUnifiedConfig(), prop, receiver);
  },
});

// Export utility functions
export function getServiceUrl(serviceName: string, path: string = ''): string {
  return getUnifiedConfig().getServiceUrl(serviceName, path);
}

export function getServiceConfig(serviceName: string): ServiceConfig {
  return getUnifiedConfig().getServiceConfig(serviceName);
}

export function isDevelopment(): boolean {
  return getUnifiedConfig().isDevelopment();
}

export function isProduction(): boolean {
  return getUnifiedConfig().isProduction();
}

export function getHealthCheckConfig(): HealthCheckConfig {
  return getUnifiedConfig().getHealthCheckConfig();
}

export function getDatabaseConfig(): DatabaseConfig {
  return getUnifiedConfig().getDatabaseConfig();
}

export function getCacheConfig(): CacheConfig {
  return getUnifiedConfig().getCacheConfig();
}

export function getSecurityConfig(): SecurityConfig {
  return getUnifiedConfig().getSecurityConfig();
}

export function getExternalProvider(providerName: string): ExternalProvider {
  return getUnifiedConfig().getExternalProvider(providerName);
}

export function getServiceDiscoveryConfig(): { interval: number; timeoutMs: number; retries: number } {
  const config = getUnifiedConfig();
  return {
    interval: config.getHealthCheckConfig().interval[config.isDevelopment() ? 'development' : 'production'],
    timeoutMs: config.getHealthCheckConfig().timeoutMs,
    retries: config.getHealthCheckConfig().retries,
  };
}
