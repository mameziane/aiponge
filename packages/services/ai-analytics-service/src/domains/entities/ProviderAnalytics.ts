/**
 * Provider Analytics Domain Entities
 */

export interface ProviderAnalytics {
  id?: string;
  providerId: string;
  providerName?: string;
  providerType?: 'llm' | 'music' | 'image' | 'audio';
  operation: string;
  requestId?: string;
  userId?: string;
  requestSize?: number;
  responseSize?: number;
  success: boolean;
  latencyMs?: number;
  responseTimeMs?: number;
  queueTimeMs?: number;
  processingTimeMs?: number;
  cost?: number;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  errorType?: string;
  errorMessage?: string;
  errorCode?: string;
  httpStatusCode?: number;
  circuitBreakerStatus?: 'closed' | 'open' | 'half-open';
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
  model?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface ProviderHealthMetrics {
  providerId: string;
  providerName?: string;
  status?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' | 'unavailable';
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' | 'unavailable';
  uptime: number;
  averageLatencyMs?: number;
  responseTimeMs?: number;
  errorRate: number;
  requestsPerMinute?: number;
  throughput?: number;
  lastChecked?: Date;
  timestamp?: Date;
  activeConnections?: number;
  lastError?: string;
  circuitBreakerStatus?: 'closed' | 'open' | 'half-open';
  rateLimitStatus?: {
    remaining: number;
    limit: number;
    resetTime: Date;
  };
  metadata?: Record<string, unknown>;
}

export interface ProviderPerformanceMetrics {
  providerId: string;
  period?: { start: Date; end: Date };
  timeRange?: { start: Date; end: Date };
  totalRequests?: number;
  requestCount?: number;
  successfulRequests?: number;
  failedRequests?: number;
  successRate?: number;
  averageLatencyMs?: number;
  averageLatency?: number;
  medianLatency?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  p95Latency?: number;
  p99LatencyMs?: number;
  totalCost?: number;
  averageRequestCost?: number;
  totalTokensUsed?: number;
  errorRate?: number;
  topErrors?: Array<{ errorType: string; count: number }>;
  costTrends?: Array<{ timestamp: Date; cost: number }>;
  operationBreakdown?: Record<
    string,
    {
      requests: number;
      successRate: number;
      averageLatencyMs: number;
      totalCost: number;
    }
  >;
}

export interface ProviderComparison {
  operation: string;
  period?: { start: Date; end: Date };
  timeRange?: { start: Date; end: Date };
  providers: Array<{
    providerId: string;
    providerName?: string;
    requests: number;
    successRate: number;
    averageLatencyMs: number;
    totalCost: number;
    costPerRequest: number;
  }>;
  recommendation?: string;
  recommendations?: string[];
}

export interface ProviderUsageTrends {
  providerId: string;
  timePeriod?: 'hour' | 'day' | 'week' | 'month';
  data?: Array<{
    timestamp: Date;
    requests: number;
    successRate: number;
    averageLatencyMs: number;
    cost: number;
  }>;
  dataPoints?: Array<{
    timestamp: Date;
    requests: number;
    successRate: number;
    averageLatencyMs: number;
    cost: number;
  }>;
  trend?: 'increasing' | 'decreasing' | 'stable';
  changePercent?: number;
}
