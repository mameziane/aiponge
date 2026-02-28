import { HttpClient, type HttpResponse } from '../http/http-client.js';
import { HttpConfigs, createServiceHttpClient } from '../http/http-configs.js';
import type * as winston from 'winston';
import { createLogger } from '../logging/logger.js';
import { DomainError } from '../error-handling/errors.js';
import {
  ServiceRegistry,
  hasService,
  getServiceUrl as getRegistryServiceUrl,
  waitForService,
  listServices,
} from './service-registry.js';
import { ServiceLocator } from '../service-locator/service-locator.js';

export type Logger = winston.Logger;

export type ServiceNameKey = string;

function getBackendServiceNames(): string[] {
  return ServiceLocator.getBackendServiceNames();
}

function resolveServicePort(serviceName: string): number {
  const portEnvVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_PORT`;

  const portFromEnv = process.env[portEnvVar];
  if (portFromEnv) {
    const port = parseInt(portFromEnv, 10);
    if (!isNaN(port)) return port;
  }

  try {
    return ServiceLocator.getServicePort(serviceName);
  } catch {
    throw new DomainError(
      `Cannot resolve port for ${serviceName}. Set ${portEnvVar} or ensure service-manifest.cjs is generated.`,
      500
    );
  }
}

function buildServiceUrl(serviceName: string): string {
  const urlEnvVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_URL`;
  const fullUrl = process.env[urlEnvVar];
  if (fullUrl) return fullUrl;

  const host = process.env.SERVICE_HOST || 'localhost';
  const port = resolveServicePort(serviceName);

  return `http://${host}:${port}`;
}

export type HttpClientType = keyof typeof HttpConfigs;
export type HttpClientConfigType = (typeof HttpConfigs)[HttpClientType];

export interface ServiceClientResult {
  httpClient: HttpClient;
  baseUrl: string;
}

export interface ServiceUrlsConfig {
  ownPort: number;
  ownServiceName: string;
  getServiceUrl: (serviceName: string) => string;
  getServicePort: (serviceName: string) => number;
  getOwnPort: () => number;
  createServiceHttpClient: (type: HttpClientType) => HttpClient;
  createServiceClient: (
    targetService: string,
    options?: { type?: HttpClientType; timeout?: number }
  ) => ServiceClientResult;
  getHttpConfig: (type: HttpClientType) => HttpClientConfigType;
  SERVICE_URLS: Record<string, string>;
  SERVICE_PORTS: Record<string, number>;
}

function toCamelCase(serviceName: string): string {
  return serviceName.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

export function createServiceUrlsConfig(ownServiceName: string): ServiceUrlsConfig {
  const allBackendServices = getBackendServiceNames();

  if (!allBackendServices.includes(ownServiceName)) {
    throw new DomainError(`Unknown service: ${ownServiceName}. Available: ${allBackendServices.join(', ')}`, 500);
  }

  const ownPort = resolveServicePort(ownServiceName);

  const SERVICE_URLS: Record<string, string> = {};
  const SERVICE_PORTS: Record<string, number> = {};

  for (const name of allBackendServices) {
    const camelKey = toCamelCase(name);
    if (name !== ownServiceName) {
      const url = buildServiceUrl(name);
      SERVICE_URLS[name] = url;
      SERVICE_URLS[camelKey] = url;
    }
    const port = resolveServicePort(name);
    SERVICE_PORTS[name] = port;
    SERVICE_PORTS[camelKey] = port;
  }

  function getServiceUrl(serviceName: string): string {
    if (hasService(serviceName)) {
      return getRegistryServiceUrl(serviceName);
    }

    const url = SERVICE_URLS[serviceName];
    if (!url) {
      throw new DomainError(`Unknown service: ${serviceName}. Available: ${Object.keys(SERVICE_URLS).join(', ')}`, 404);
    }
    return url;
  }

  function getServicePort(serviceName: string): number {
    return SERVICE_PORTS[serviceName];
  }

  function getOwnPort(): number {
    return ownPort;
  }

  function createHttpClientForService(type: HttpClientType): HttpClient {
    const config = HttpConfigs[type];
    const headers: Record<string, string> = {};

    if (config.useServiceAuth) {
      headers['X-Service-Client'] = 'true';
      headers['X-Service-Name'] = ownServiceName;
    }

    return new HttpClient({
      timeout: config.timeout,
      retries: config.retries,
      headers,
      useServiceAuth: config.useServiceAuth,
      serviceName: ownServiceName,
    });
  }

  function getHttpConfig(type: HttpClientType): HttpClientConfigType {
    return HttpConfigs[type];
  }

  function createServiceClient(
    targetService: string,
    options?: { type?: HttpClientType; timeout?: number }
  ): ServiceClientResult {
    const type = options?.type ?? 'internal';
    const config = HttpConfigs[type];
    const baseUrl = getServiceUrl(targetService);
    const headers: Record<string, string> = {};

    if (config.useServiceAuth) {
      headers['X-Service-Client'] = 'true';
      headers['X-Service-Name'] = ownServiceName;
    }

    const httpClient = new HttpClient({
      baseUrl,
      timeout: options?.timeout ?? config.timeout,
      retries: config.retries,
      headers,
      useServiceAuth: config.useServiceAuth,
      serviceName: ownServiceName,
    });

    return { httpClient, baseUrl };
  }

  return {
    ownPort,
    ownServiceName,
    getServiceUrl,
    getServicePort,
    getOwnPort,
    createServiceHttpClient: createHttpClientForService,
    createServiceClient,
    getHttpConfig,
    SERVICE_URLS,
    SERVICE_PORTS,
  };
}

export { HttpClient, HttpResponse };
export { createLogger as getLogger };
export { ServiceRegistry, hasService, waitForService, listServices };
