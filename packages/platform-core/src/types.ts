/**
 * Shared Types for Platform Core
 */

export interface PlatformConfig {
  service: {
    name: string;
    version?: string;
    port?: number;
  };
  logging?: LoggerConfig;
  health?: HealthCheckConfig;
}

export interface ServiceDefinition {
  name: string;
  port: number;
  url?: string;
}

export interface BootstrapConfig {
  service: {
    name: string;
    port: number;
    version?: string;
  };
  middleware?: {
    cors?: boolean;
    helmet?: boolean;
    compression?: boolean;
    requestLogger?: boolean;
    bodyParser?: boolean;
  };
  health?: HealthCheckConfig;
}

export interface HealthCheckConfig {
  serviceName: string;
  version?: string;
  databaseUrl?: string;
  dependencies?: Array<{
    name: string;
    url: string;
    timeout?: number;
  }>;
  capabilities?: string[];
  features?: string[];
  endpoints?: Record<string, string>;
}

export interface LoggerConfig {
  level?: string;
  format?: 'json' | 'text';
  correlationTracking?: boolean;
  secretRedaction?: boolean;
}

export interface HttpClientConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  useServiceAuth?: boolean;
  propagateTracing?: boolean;
  getTracingHeaders?: () => Record<string, string>;
  serviceName?: string;
  skipRetries?: boolean;
  maxSockets?: number;
}
