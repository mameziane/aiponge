/**
 * Environment Configuration
 * Gateway-specific environment variable management with validation.
 *
 * Service port/URL resolution is delegated to ServiceLocator
 * (single source of truth: packages/platform-core/src/config/services-definition.ts).
 * This module only handles gateway-specific settings (CORS, timeouts, etc.).
 */

import { ServiceLocator, serializeError, DomainError } from '@aiponge/platform-core';
import { getLogger } from './service-urls';

const logger = getLogger('api-gateway-environment');

const KNOWN_SERVICES = [
  'system-service',
  'storage-service',
  'user-service',
  'ai-config-service',
  'ai-content-service',
  'ai-analytics-service',
  'music-service',
];

export interface ServiceConfig {
  name: string;
  port: number;
  host: string;
  healthEndpoint: string;
  enabled: boolean;
}

export interface EnvironmentConfig {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;

  corsOrigins: string[];
  corsFrontendHost: string;
  corsFrontendPorts: number[];

  healthCheckInterval: number;
  serviceDiscoveryEnabled: boolean;

  defaultRequestTimeoutMs: number;
  defaultRetries: number;
  circuitBreakerTimeoutMs: number;
  maxHeartbeatAge: number;

  services: Record<string, ServiceConfig>;
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseInteger(value: string, min?: number, max?: number): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new DomainError(`Invalid integer value: ${value}`, 400);
  }
  if (min !== undefined && parsed < min) {
    throw new DomainError(`Value ${parsed} is below minimum ${min}`, 400);
  }
  if (max !== undefined && parsed > max) {
    throw new DomainError(`Value ${parsed} is above maximum ${max}`, 400);
  }
  return parsed;
}

function loadServicesFromServiceLocator(): Record<string, ServiceConfig> {
  const services: Record<string, ServiceConfig> = {};

  KNOWN_SERVICES.forEach(serviceName => {
    try {
      const port = ServiceLocator.getServicePort(serviceName);
      const host = process.env.SERVICE_HOST || 'localhost';
      const envPrefix = serviceName.toUpperCase().replace(/-/g, '_');
      const enabled = process.env[`${envPrefix}_ENABLED`] !== 'false';

      services[serviceName] = {
        name: serviceName,
        port,
        host,
        healthEndpoint: '/health',
        enabled,
      };
    } catch {
      logger.debug(`Service ${serviceName} not found in ServiceLocator, skipping`);
    }
  });

  return services;
}

export function loadEnvironmentConfig(): EnvironmentConfig {
  try {
    const gatewayPort = ServiceLocator.getValidatedServicePort('api-gateway');
    const services = loadServicesFromServiceLocator();

    const config: EnvironmentConfig = {
      port: gatewayPort,
      host: process.env.HOST || '0.0.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',

      corsOrigins: process.env.CORS_ORIGINS ? parseList(process.env.CORS_ORIGINS) : [],
      corsFrontendHost: process.env.CORS_FRONTEND_HOST || 'localhost',
      corsFrontendPorts: process.env.CORS_FRONTEND_PORTS
        ? parseList(process.env.CORS_FRONTEND_PORTS).map(p => parseInteger(p, 1000, 65535))
        : [8082],

      healthCheckInterval: parseInteger(process.env.HEALTH_CHECK_INTERVAL || '30000', 5000, 300000),
      serviceDiscoveryEnabled: process.env.SERVICE_DISCOVERY_ENABLED !== 'false',

      defaultRequestTimeoutMs: parseInteger(
        process.env.API_REQUEST_TIMEOUT_MS || process.env.DEFAULT_REQUEST_TIMEOUT || '5000',
        1000,
        60000
      ),
      defaultRetries: parseInteger(process.env.DEFAULT_RETRIES || '2', 0, 10),
      circuitBreakerTimeoutMs: parseInteger(
        process.env.CIRCUIT_BREAKER_TIMEOUT_MS || process.env.CIRCUIT_BREAKER_TIMEOUT || '60000',
        10000,
        300000
      ),
      maxHeartbeatAge: parseInteger(process.env.MAX_HEARTBEAT_AGE || '300000', 60000, 1800000),

      services,
    };

    return config;
  } catch (error) {
    logger.error('Environment configuration validation failed:', {
      error: serializeError(error),
    });
    throw error;
  }
}

export const environmentConfig = loadEnvironmentConfig();

export function getServiceConfig(serviceName: string): ServiceConfig | undefined {
  return environmentConfig.services[serviceName];
}

export function getServicePort(serviceName: string): number | undefined {
  const service = getServiceConfig(serviceName);
  return service?.port;
}

export function getServiceHost(serviceName: string): string {
  const service = getServiceConfig(serviceName);
  return service?.host || 'localhost';
}

export function getServiceUrl(serviceName: string, path: string = ''): string {
  try {
    const baseUrl = ServiceLocator.getServiceUrl(serviceName);
    return `${baseUrl}${path}`;
  } catch {
    const service = getServiceConfig(serviceName);
    if (!service) {
      throw new DomainError(`Service ${serviceName} is not configured`, 404);
    }
    return `http://${service.host}:${service.port}${path}`;
  }
}

export function isServiceEnabled(serviceName: string): boolean {
  const service = getServiceConfig(serviceName);
  return service?.enabled ?? false;
}

export function getAllEnabledServices(): ServiceConfig[] {
  return Object.values(environmentConfig.services).filter(service => service.enabled);
}

export function isDevelopment(): boolean {
  return environmentConfig.nodeEnv === 'development';
}

export function isProduction(): boolean {
  return environmentConfig.nodeEnv === 'production';
}

export function isTest(): boolean {
  return environmentConfig.nodeEnv === 'test';
}

export default environmentConfig;
