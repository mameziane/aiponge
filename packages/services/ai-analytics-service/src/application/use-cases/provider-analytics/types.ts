import {
  ProviderAnalytics,
  ProviderPerformanceMetrics,
  ProviderComparison,
  ProviderUsageTrends,
} from '../../../domains/entities/ProviderAnalytics';

export interface GetProviderAnalyticsRequest {
  providerId?: string;
  providerType?: 'llm' | 'music' | 'image' | 'audio';
  operation?: string;
  userId?: string;
  success?: boolean;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  startTime?: Date;
  endTime?: Date;
  timeRange?: 'last_hour' | 'last_24h' | 'last_7d' | 'last_30d' | 'last_90d' | 'custom';
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'responseTime' | 'cost' | 'providerId' | 'success';
  sortOrder?: 'asc' | 'desc';
  includeHealthMetrics?: boolean;
  includePerformanceMetrics?: boolean;
  includeTrendAnalysis?: boolean;
  includeComparison?: boolean;
  includeCostAnalysis?: boolean;
  includeUsagePatterns?: boolean;
  groupBy?: 'provider' | 'operation' | 'user' | 'hour' | 'day' | 'week';
  aggregationWindow?: 'minute' | 'hour' | 'day' | 'week' | 'month';
}

export interface ProviderComparisonRequest {
  operation: string;
  providerIds?: string[];
  startTime: Date;
  endTime: Date;
  metrics: ('latency' | 'cost' | 'success_rate' | 'throughput' | 'reliability')[];
}

export interface ProviderHealthRequest {
  providerId?: string;
  includeHistorical?: boolean;
  timeRange?: 'last_hour' | 'last_24h' | 'last_7d';
}

export interface ProviderCostAnalysisRequest {
  startTime: Date;
  endTime: Date;
  groupBy: 'provider' | 'operation' | 'user';
  includeForecast?: boolean;
  includeOptimizationRecommendations?: boolean;
}

export interface GetProviderAnalyticsResult {
  analytics: ProviderAnalyticsWithInsights[];
  total: number;
  pagination: {
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  summary: ProviderSummaryStats;
  healthStatus?: ProviderHealthSummary;
  performanceMetrics?: Record<string, ProviderPerformanceMetrics>;
  trends?: Record<string, ProviderUsageTrends>;
  comparison?: ProviderComparison;
  costAnalysis?: ProviderCostAnalysis;
  insights: ProviderInsight[];
}

export interface ProviderAnalyticsWithInsights extends ProviderAnalytics {
  healthContext?: {
    currentStatus: string;
    recentErrors: string[];
    performanceTrend: 'improving' | 'declining' | 'stable';
    uptime24h: number;
  };
  costContext?: {
    costEfficiency: number;
    relativeCost: 'low' | 'medium' | 'high';
    costTrend: 'increasing' | 'decreasing' | 'stable';
  };
  performanceContext?: {
    latencyPercentile: number;
    successRateComparison: number;
    volumeImpact: 'peak' | 'normal' | 'low';
  };
}

export interface ProviderSummaryStats {
  totalRequests: number;
  uniqueProviders: number;
  averageResponseTime: number;
  totalCost: number;
  overallSuccessRate: number;
  activeProviders: number;
  healthyProviders: number;
  topProvidersByUsage: Array<{
    providerId: string;
    requestCount: number;
    successRate: number;
    averageLatency: number;
    totalCost: number;
    marketShare: number;
  }>;
  topProvidersByError: Array<{
    providerId: string;
    errorCount: number;
    errorRate: number;
    topErrors: Array<{ errorType: string; count: number }>;
  }>;
  costBreakdown: Record<
    string,
    {
      totalCost: number;
      percentage: number;
      averageRequestCost: number;
    }
  >;
  performanceDistribution: {
    fast: number;
    medium: number;
    slow: number;
  };
}

export interface ProviderHealthSummary {
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  unavailableCount: number;
  healthByType: Record<
    string,
    {
      healthy: number;
      degraded: number;
      unhealthy: number;
    }
  >;
  criticalIssues: Array<{
    providerId: string;
    issue: string;
    severity: 'high' | 'critical';
    duration: number;
  }>;
  healthTrends: Array<{
    timestamp: Date;
    healthyCount: number;
    issues: number;
  }>;
}

export interface ProviderCostAnalysis {
  totalCost: number;
  costByGroup: Record<
    string,
    {
      totalCost: number;
      requestCount: number;
      averageCost: number;
      percentage: number;
    }
  >;
  costTrends: Array<{
    timestamp: Date;
    cost: number;
    requestCount: number;
    averageCostPerRequest: number;
  }>;
  forecast?: Array<{
    timestamp: Date;
    predictedCost: number;
    confidence: number;
  }>;
  optimizationRecommendations?: Array<{
    type: 'provider_switch' | 'usage_optimization' | 'timing_optimization';
    description: string;
    potentialSavings: number;
    confidence: number;
    implementation: string;
  }>;
  budgetAnalysis?: {
    currentBurn: number;
    projectedMonthly: number;
    budgetUtilization: number;
    daysUntilBudgetExhausted?: number;
  };
}

export interface ProviderInsight {
  type: 'performance' | 'cost' | 'reliability' | 'health' | 'usage';
  priority: 'low' | 'medium' | 'high' | 'critical';
  providerId?: string;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  metrics: Record<string, number>;
  confidence: number;
  actionable: boolean;
  estimatedSavings?: number;
  estimatedPerformanceGain?: number;
}
