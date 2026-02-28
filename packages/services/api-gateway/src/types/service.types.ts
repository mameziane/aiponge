/**
 * Service-related Type Definitions
 * Types for service discovery, registration, and communication
 */

export interface ServiceDefinition {
  name: string;
  version: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  healthCheck: {
    endpoint: string;
    interval: number;
    timeout: number;
    retries: number;
  };
  metadata: {
    environment: string;
    region?: string;
    tags: string[];
    capabilities: string[];
  };
  endpoints: ServiceEndpoint[];
  lastSeen: Date;
  status: ServiceStatus;
}

export interface ServiceEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description?: string;
  requiresAuth: boolean;
  rateLimit?: RateLimitConfig;
  timeout?: number;
  cache?: CacheConfig;
  validation?: ValidationConfig;
}

export interface ServiceRegistry {
  services: Map<string, ServiceDefinition>;
  getService(_name: string): ServiceDefinition | undefined;
  getAllServices(): ServiceDefinition[];
  getHealthyServices(): ServiceDefinition[];
  registerService(_service: ServiceDefinition): Promise<void>;
  unregisterService(_name: string): Promise<void>;
  updateServiceStatus(_name: string, _status: ServiceStatus): Promise<void>;
}

export interface ServiceDiscoveryConfig {
  mode: 'static' | 'dynamic' | 'hybrid';
  healthCheckInterval: number;
  unhealthyThreshold: number;
  registrationTimeout: number;
  enableAutoRefresh: boolean;
  staticServices?: ServiceDefinition[];
}

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'weighted' | 'least-connections' | 'random' | 'ip-hash';
  healthCheck: boolean;
  failover: boolean;
  stickySession?: {
    enabled: boolean;
    key: string;
    ttl: number;
  };
}

export interface ServiceCall {
  serviceName: string;
  endpoint: string;
  method: string;
  requestId: string;
  timestamp: Date;
  duration: number;
  statusCode: number;
  success: boolean;
  error?: string;
  retryCount: number;
}

export interface ServiceMetrics {
  serviceName: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  lastCall: Date;
  circuitBreakerState: 'open' | 'closed' | 'half-open';
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  enableHalfOpen: boolean;
  successThreshold: number; // For half-open state
}

export interface ServiceProxy {
  serviceName: string;
  baseUrl: string;
  timeout: number;
  retries: number;
  circuitBreaker: CircuitBreakerConfig;
  loadBalancer: LoadBalancerConfig;
  rateLimiting: RateLimitConfig;
}

export type ServiceStatus = 'healthy' | 'unhealthy' | 'unknown' | 'degraded';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (_req: unknown) => string;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  maxSize?: number;
  keyGenerator?: (_req: unknown) => string;
  varyBy?: string[]; // Headers to vary cache by
}

export interface ValidationConfig {
  requestSchema?: unknown; // JSON schema for request validation
  responseSchema?: unknown; // JSON schema for response validation
  required: boolean;
}

// Authentication and Authorization types
export interface AuthConfig {
  required: boolean;
  schemes: ('bearer' | 'basic' | 'api-key')[];
  roles?: string[];
  permissions?: string[];
  skipPaths?: string[];
}

export interface ServiceAuth {
  serviceName: string;
  authConfig: AuthConfig;
  jwtSecret?: string;
  apiKeys?: string[];
  basicAuth?: {
    username: string;
    password: string;
  };
}
