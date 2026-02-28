/**
 * Repository Interfaces for Analytics Domain
 * Defines data access contracts for all analytics data operations
 */

import { MetricEntry, AggregatedMetric, MetricFilter } from '../entities/MetricEntry';
import {
  ProviderAnalytics,
  ProviderHealthMetrics,
  ProviderPerformanceMetrics,
  ProviderComparison,
  ProviderUsageTrends,
} from '../entities/ProviderAnalytics';
import {
  AnomalyDetectionResult,
  CostOptimizationRecommendation,
  PerformanceInsight,
  AlertRule,
} from '../entities/AnalyticsIntelligence';

// ================================
// METRICS REPOSITORY
// ================================

export interface IMetricsRepository {
  // Basic metric operations
  recordMetric(entry: MetricEntry): Promise<void>;
  recordMetrics(entries: MetricEntry[]): Promise<void>;

  // Metric retrieval
  getMetrics(filter: MetricFilter): Promise<MetricEntry[]>;
  getAggregatedMetrics(
    metricName: string,
    serviceName: string,
    startTime: Date,
    endTime: Date,
    aggregationWindow: 'minute' | 'hour' | 'day'
  ): Promise<AggregatedMetric[]>;

  // Time-series queries
  getMetricTimeSeries(
    metricName: string,
    startTime: Date,
    endTime: Date,
    intervalMinutes: number,
    tags?: Record<string, string>
  ): Promise<Array<{ timestamp: Date; value: number }>>;

  // Metric management
  deleteOldMetrics(olderThan: Date): Promise<number>;
  getMetricNames(serviceName?: string): Promise<string[]>;
  getServiceNames(): Promise<string[]>;

  // Prometheus export
  exportPrometheusMetrics(serviceName?: string): Promise<string>;
}

// ================================
// PROVIDER REPOSITORY
// ================================

export interface IProviderRepository {
  // Provider usage tracking
  recordProviderUsage(usage: ProviderAnalytics): Promise<void>;
  recordProviderUsagesBatch(usages: ProviderAnalytics[]): Promise<void>;
  recordProviderHealth(health: ProviderHealthMetrics): Promise<void>;

  // Provider retrieval
  getProviderUsage(filter: {
    providerId?: string;
    operation?: string;
    userId?: string;
    success?: boolean;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ProviderAnalytics[]>;

  getProviderHealth(providerId?: string): Promise<ProviderHealthMetrics[]>;

  // Performance metrics
  getProviderPerformanceMetrics(
    providerId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ProviderPerformanceMetrics>;

  getProviderComparison(operation: string, startTime: Date, endTime: Date): Promise<ProviderComparison>;

  getProviderUsageTrends(
    providerId: string,
    timePeriod: 'hour' | 'day' | 'week' | 'month',
    startTime: Date,
    endTime: Date
  ): Promise<ProviderUsageTrends>;

  // Cost analytics
  getProviderCostAnalytics(
    startTime: Date,
    endTime: Date,
    groupBy: 'provider' | 'operation' | 'user'
  ): Promise<
    Array<{
      group: string;
      totalCost: number;
      requestCount: number;
      averageCost: number;
    }>
  >;

  // Top queries
  getTopProvidersByUsage(
    startTime: Date,
    endTime: Date,
    limit: number
  ): Promise<
    Array<{
      providerId: string;
      requestCount: number;
      totalCost: number;
      averageLatency: number;
      successRate: number;
    }>
  >;

  getTopProvidersByError(
    startTime: Date,
    endTime: Date,
    limit: number
  ): Promise<
    Array<{
      providerId: string;
      errorCount: number;
      errorRate: number;
      topErrors: Array<{ errorType: string; count: number }>;
    }>
  >;
}

// ================================
// INTELLIGENCE REPOSITORY
// ================================

export interface IIntelligenceRepository {
  // Anomaly detection
  recordAnomaly(anomaly: AnomalyDetectionResult): Promise<string>;
  getAnomalies(filter: {
    severity?: string;
    status?: string;
    serviceName?: string;
    providerId?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<AnomalyDetectionResult[]>;

  updateAnomaly(id: string, updates: Partial<AnomalyDetectionResult>): Promise<void>;
  acknowledgeAnomaly(id: string, acknowledgedBy: string): Promise<void>;
  resolveAnomaly(id: string): Promise<void>;

  // Cost optimization
  recordCostOptimizationRecommendation(recommendation: CostOptimizationRecommendation): Promise<string>;
  getCostOptimizationRecommendations(filter: {
    priority?: string;
    type?: string;
    minSavings?: number;
    limit?: number;
  }): Promise<CostOptimizationRecommendation[]>;

  // Performance insights
  recordPerformanceInsight(insight: PerformanceInsight): Promise<string>;
  getPerformanceInsights(filter: {
    category?: string;
    impact?: string;
    severity?: string;
    serviceNames?: string[];
    limit?: number;
  }): Promise<PerformanceInsight[]>;

  // Alert rules
  createAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): Promise<string>;
  updateAlertRule(id: string, updates: Partial<AlertRule>): Promise<void>;
  deleteAlertRule(id: string): Promise<void>;
  getAlertRules(enabled?: boolean): Promise<AlertRule[]>;
  getAlertRule(id: string): Promise<AlertRule | null>;
  recordAlertTrigger(id: string): Promise<void>;
}

// ================================
// UNIFIED ANALYTICS REPOSITORY
// ================================

export interface UserActivityRecord {
  timestamp: Date;
  userId: string;
  userType: string;
  sessionId: string | null;
  action: string;
  resource: string | null;
  success: boolean;
  errorCode: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  processingTime: number | null;
  metadata: Record<string, unknown> | null;
}

export interface IAnalyticsRepository extends IMetricsRepository, IProviderRepository, IIntelligenceRepository {
  recordUserActivity(record: UserActivityRecord): Promise<void>;

  getUserActivityByIp(ipAddress: string, since: Date): Promise<UserActivityRecord[]>;
  getUserActivityByUserId(userId: string, since: Date): Promise<UserActivityRecord[]>;

  // Cross-domain analytics
  getDashboardData(
    dashboardType: 'overview' | 'providers' | 'costs' | 'health',
    timeRange: { start: Date; end: Date },
    filters?: Record<string, unknown>
  ): Promise<Record<string, unknown>>;

  // Health checks
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, unknown> }>;

  // Data cleanup
  cleanupOldData(retentionDays: number): Promise<{
    metricsDeleted: number;
    providerLogsDeleted: number;
    anomaliesDeleted: number;
  }>;

  // GDPR compliance
  deleteUserData(userId: string): Promise<{ deletedRecords: number }>;
  exportUserData?(userId: string): Promise<{ activityLogs: { eventType: string; timestamp: string }[] }>;
}
