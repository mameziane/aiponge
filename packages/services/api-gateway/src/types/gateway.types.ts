export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GatewayMetrics {
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  uptime: number;
  circuitBreakerStatus: Record<string, 'open' | 'closed' | 'half-open'>;
  cacheHitRatio: number;
}

export interface RouteConfig {
  path: string;
  methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'>;
  targetService: string;
  requiresAuth: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  cache?: {
    ttl: number;
    enabled: boolean;
  };
  timeout?: number;
  retries?: number;
  circuitBreaker?: boolean;
}
