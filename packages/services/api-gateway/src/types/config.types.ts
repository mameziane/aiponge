/**
 * Configuration Type Definitions
 * Types for application configuration and settings
 */

// Main gateway configuration
export interface GatewayConfig {
  server: ServerConfig;
  cors: CorsConfig;
  security: SecurityConfig;
  services: ServiceConfig[];
  proxy: ProxyConfig;
  caching: CachingConfig;
  rateLimiting: RateLimitingConfig;
  monitoring: MonitoringConfig;
  logging: LoggingConfig;
  features: FeatureFlags;
  environment: EnvironmentConfig;
}

// Server configuration
export interface ServerConfig {
  port: number;
  host: string;
  protocol: 'http' | 'https';
  ssl?: {
    cert: string;
    key: string;
    ca?: string;
  };
  compression: boolean;
  keepAlive: boolean;
  timeout: number;
  maxRequestSize: string;
  trustProxy: boolean;
}

// CORS configuration
export interface CorsConfig {
  enabled: boolean;
  origins: string[] | string | boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  credentials: boolean;
  maxAge?: number;
  optionsSuccessStatus?: number;
}

// Security configuration
export interface SecurityConfig {
  helmet: {
    enabled: boolean;
    options?: unknown;
  };
  jwt: {
    secret: string;
    algorithm: string;
    expiresIn: string;
    issuer?: string;
    audience?: string;
  };
  apiKeys: {
    enabled: boolean;
    header: string;
    query?: string;
    validKeys?: string[];
  };
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
  requestValidation: {
    enabled: boolean;
    strictMode: boolean;
    sanitizeInput: boolean;
  };
}

// Service configuration
export interface ServiceConfig {
  name: string;
  version: string;
  baseUrl: string;
  timeout: number;
  retries: number;
  healthCheck: HealthCheckConfig;
  circuitBreaker: CircuitBreakerConfig;
  loadBalancer: LoadBalancerConfig;
  auth: ServiceAuthConfig;
  routes: RouteConfig[];
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface HealthCheckConfig {
  enabled: boolean;
  endpoint: string;
  interval: number;
  timeout: number;
  retries: number;
  successThreshold: number;
  failureThreshold: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
}

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'weighted' | 'least-connections' | 'random' | 'ip-hash';
  healthCheck: boolean;
  instances: ServiceInstance[];
  stickySession?: StickySessionConfig;
}

export interface ServiceInstance {
  host: string;
  port: number;
  weight?: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface StickySessionConfig {
  enabled: boolean;
  cookieName: string;
  ttl: number;
  secure: boolean;
  httpOnly: boolean;
}

export interface ServiceAuthConfig {
  required: boolean;
  type: 'jwt' | 'api-key' | 'basic' | 'oauth2';
  skipPaths?: string[];
  roles?: string[];
  permissions?: string[];
}

// Route configuration
export interface RouteConfig {
  path: string;
  method: string | string[];
  target: string;
  rewrite?: string;
  auth: RouteAuthConfig;
  rateLimit?: RouteLimitConfig;
  cache?: RouteCacheConfig;
  validation?: RouteValidationConfig;
  timeout?: number;
  retries?: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface RouteAuthConfig {
  required: boolean;
  roles?: string[];
  permissions?: string[];
  skipForMethods?: string[];
}

export interface RouteLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  keyGenerator?: string;
  skipSuccessfulRequests?: boolean;
}

export interface RouteCacheConfig {
  enabled: boolean;
  ttl: number;
  keyGenerator?: string;
  varyBy?: string[];
  skipForMethods?: string[];
}

export interface RouteValidationConfig {
  enabled: boolean;
  requestSchema?: unknown;
  responseSchema?: unknown;
  sanitizeInput: boolean;
  strictMode: boolean;
}

// Proxy configuration
export interface ProxyConfig {
  timeout: number;
  retries: number;
  keepAlive: boolean;
  followRedirects: boolean;
  maxRedirects: number;
  changeOrigin: boolean;
  preserveHeaderKeyCase: boolean;
  headers: {
    forward: string[];
    add: Record<string, string>;
    remove: string[];
  };
  responseHeaders: {
    forward: string[];
    add: Record<string, string>;
    remove: string[];
  };
}

// Caching configuration
export interface CachingConfig {
  enabled: boolean;
  type: 'memory' | 'redis' | 'memcached';
  connection?: {
    host: string;
    port: number;
    password?: string;
    database?: number;
  };
  defaultTtl: number;
  maxSize: number;
  compression: boolean;
  keyPrefix: string;
  policies: CachePolicyConfig[];
}

export interface CachePolicyConfig {
  pattern: string;
  ttl: number;
  varyBy?: string[];
  skipForMethods?: string[];
  skipForStatusCodes?: number[];
}

// Rate limiting configuration
export interface RateLimitingConfig {
  enabled: boolean;
  type: 'memory' | 'redis';
  connection?: {
    host: string;
    port: number;
    password?: string;
    database?: number;
  };
  defaultLimits: {
    windowMs: number;
    maxRequests: number;
  };
  keyGenerators: {
    ip: boolean;
    user: boolean;
    apiKey: boolean;
    custom?: string;
  };
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  policies: RateLimitPolicyConfig[];
}

export interface RateLimitPolicyConfig {
  pattern: string;
  maxRequests: number;
  windowMs: number;
  keyGenerator?: string;
  skipForMethods?: string[];
}

// Monitoring configuration
export interface MonitoringConfig {
  enabled: boolean;
  metrics: MetricsConfig;
  tracing: TracingConfig;
  healthChecks: HealthMonitoringConfig;
  alerts: AlertConfig;
}

export interface MetricsConfig {
  enabled: boolean;
  endpoint: string;
  port?: number;
  interval: number;
  labels: Record<string, string>;
  customMetrics: CustomMetricConfig[];
}

export interface CustomMetricConfig {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  description: string;
  labels?: string[];
}

export interface TracingConfig {
  enabled: boolean;
  service: 'jaeger' | 'zipkin' | 'datadog';
  endpoint?: string;
  sampleRate: number;
  propagation: string[];
}

export interface HealthMonitoringConfig {
  enabled: boolean;
  endpoint: string;
  checks: HealthCheckTypeConfig[];
  interval: number;
  timeout: number;
}

export interface HealthCheckTypeConfig {
  name: string;
  type: 'http' | 'tcp' | 'database' | 'custom';
  config: Record<string, unknown>;
  critical: boolean;
}

export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannelConfig[];
  rules: AlertRuleConfig[];
}

export interface AlertChannelConfig {
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface AlertRuleConfig {
  name: string;
  condition: string;
  threshold: number;
  channels: string[];
  enabled: boolean;
}

// Logging configuration
export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  format: 'json' | 'text';
  outputs: LogOutputConfig[];
  sampling?: LogSamplingConfig;
  fields: LogFieldConfig;
}

export interface LogOutputConfig {
  type: 'console' | 'file' | 'syslog' | 'elasticsearch';
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface LogSamplingConfig {
  enabled: boolean;
  rate: number;
  levels: string[];
}

export interface LogFieldConfig {
  timestamp: boolean;
  level: boolean;
  service: boolean;
  requestId: boolean;
  userId: boolean;
  custom: Record<string, unknown>;
}

// Feature flags
export interface FeatureFlags {
  enableCaching: boolean;
  enableRateLimiting: boolean;
  enableCircuitBreaker: boolean;
  enableLoadBalancing: boolean;
  enableMetrics: boolean;
  enableTracing: boolean;
  enableAuth: boolean;
  enableValidation: boolean;
  enableTransformation: boolean;
  enableCompression: boolean;
  enableCors: boolean;
  enableGraphQL: boolean;
  enableWebSocket: boolean;
  experimental: Record<string, boolean>;
}

// Environment configuration
export interface EnvironmentConfig {
  name: 'development' | 'staging' | 'production' | 'test';
  debug: boolean;
  profile: boolean;
  gracefulShutdown: {
    enabled: boolean;
    timeout: number;
    signals: string[];
  };
  cluster: {
    enabled: boolean;
    workers?: number;
  };
  secrets: {
    source: 'env' | 'file' | 'vault' | 'aws-ssm';
    config?: Record<string, unknown>;
  };
  database: {
    connectionString: string;
    maxConnections: number;
    timeout: number;
    ssl: boolean;
  };
  external: {
    [serviceName: string]: ExternalServiceConfig;
  };
}

export interface ExternalServiceConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  apiKey?: string;
  auth?: {
    type: 'bearer' | 'basic' | 'api-key';
    credentials: Record<string, string>;
  };
  rateLimiting?: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
}

// Configuration validation
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ConfigValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}
