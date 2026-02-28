/**
 * Extended Request Type Definitions
 * Custom request and response types for the API Gateway
 */

import { Request, Response } from 'express';

// Extended Express Request interface
export interface GatewayRequest extends Request {
  // Authentication context
  user?: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    sessionId: string;
  };

  // API versioning
  apiVersion?: string;
  apiVersionSource?: 'header' | 'query' | 'path' | 'subdomain';

  // Request tracking
  requestId: string;
  correlationId?: string;
  startTime: number;

  // Service routing
  targetService?: string;
  targetEndpoint?: string;
  serviceCallContext?: {
    retryCount: number;
    circuitBreakerState: string;
    loadBalancerChoice: string;
  };

  // Rate limiting
  rateLimitInfo?: {
    limit: number;
    remaining: number;
    resetTime: Date;
    windowStart: Date;
  };

  // Caching
  cacheInfo?: {
    enabled: boolean;
    key: string;
    ttl: number;
    hit: boolean;
  };

  // Performance tracking
  metrics?: {
    queueTime?: number;
    processingTime?: number;
    proxyTime?: number;
    totalTime?: number;
  };

  // Client information
  clientInfo?: {
    ip: string;
    userAgent: string;
    origin?: string;
    fingerprint?: string;
  };

  // Feature flags
  features?: Record<string, boolean>;

  // Raw request data for debugging
  rawBody?: Buffer;
}

// Extended Express Response interface
export interface GatewayResponse extends Response {
  // Response tracking
  responseTime?: number;
  proxyResponse?: boolean;
  serviceResponse?: {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    duration: number;
  };

  // Custom helper methods
  sendSuccess(_data: unknown, _message?: string): Promise<void>;
  sendError(_error: string, _statusCode?: number, _details?: unknown): Promise<void>;
  sendPaginated(_data: Array<unknown>, _pagination: PaginationInfo): Promise<void>;
  sendCached(_data: unknown, _cacheInfo: CacheInfo): Promise<void>;
}

// Request context for middleware chain
export interface RequestContext {
  requestId: string;
  correlationId?: string;
  user?: GatewayRequest['user'];
  startTime: number;
  targetService?: string;
  apiVersion?: string;
  features: Record<string, boolean>;
  metadata: Record<string, unknown>;
}

// Pagination types
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  offset: number;
}

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
  offset?: string | number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// Cache information
export interface CacheInfo {
  hit: boolean;
  key: string;
  ttl: number;
  age?: number;
  size?: number;
}

// API Gateway specific request types
export interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  query: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface ProxyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
}

// Health check request types
export interface HealthCheckRequest {
  service?: string;
  detailed?: boolean;
  timeout?: number;
}

// Authentication request types
export interface AuthRequest {
  token?: string;
  apiKey?: string;
  credentials?: {
    username: string;
    password: string;
  };
  sessionId?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: GatewayRequest['user'];
  token?: string;
  expiresAt?: Date;
  permissions: string[];
  roles: string[];
}

// Rate limiting types
export interface RateLimitRequest {
  identifier: string;
  endpoint: string;
  method: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResponse {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

// Circuit breaker types
export interface CircuitBreakerRequest {
  service: string;
  operation: string;
  timeout: number;
}

export interface CircuitBreakerResponse {
  success: boolean;
  state: 'open' | 'closed' | 'half-open';
  error?: string;
  retryAfter?: number;
}

// Load balancer types
export interface LoadBalanceRequest {
  service: string;
  strategy: 'round-robin' | 'weighted' | 'least-connections' | 'random' | 'ip-hash';
  session?: {
    id: string;
    sticky: boolean;
  };
}

export interface LoadBalanceResponse {
  selectedInstance: {
    host: string;
    port: number;
    weight?: number;
    connections?: number;
  };
  algorithm: string;
  totalInstances: number;
  healthyInstances: number;
}

// Aggregation types for multi-service requests
export interface AggregationRequest {
  requests: {
    [key: string]: ProxyRequest;
  };
  strategy: 'parallel' | 'sequential' | 'failover';
  timeout: number;
  failFast?: boolean;
}

export interface AggregationResponse {
  responses: {
    [key: string]: ProxyResponse | { error: string };
  };
  totalDuration: number;
  successCount: number;
  failureCount: number;
}

// WebSocket types for real-time features
export interface WebSocketContext {
  connectionId: string;
  userId?: string;
  subscriptions: string[];
  lastActivity: Date;
  metadata: Record<string, unknown>;
}

// GraphQL Federation types removed - standardized on pure REST API communication

// Request validation types
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  sanitized?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

// Middleware context type
export interface MiddlewareContext {
  request: GatewayRequest;
  response: GatewayResponse;
  next: (..._args: Array<unknown>) => unknown;
  requestContext: RequestContext;
}
