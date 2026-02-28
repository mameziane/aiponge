/**
 * TimescaleDB Analytics Repository - Delegating Facade
 * Implements IAnalyticsRepository by delegating to domain-specific repositories
 *
 * Domain modules in timescale/:
 * - MetricsRepository: System metrics recording and querying
 * - ProviderUsageRepository: Provider usage tracking, cost analytics
 * - IntelligenceRepository: Anomaly detection, alerts (stubs)
 * - UserActivityRepository: User activity logging and summaries
 * - OperationsRepository: Health checks, cleanup, GDPR
 */

import { Pool } from 'pg';
import { IAnalyticsRepository, type UserActivityRecord } from '../../domains/repositories/IAnalyticsRepository';
import { MetricEntry, AggregatedMetric, MetricFilter } from '../../domains/entities/MetricEntry.js';
import {
  ProviderAnalytics,
  ProviderHealthMetrics,
  ProviderPerformanceMetrics,
  ProviderComparison,
  ProviderUsageTrends,
} from '../../domains/entities/ProviderAnalytics.js';
import {
  AnomalyDetectionResult,
  CostOptimizationRecommendation,
  PerformanceInsight,
  AlertRule,
} from '../../domains/entities/AnalyticsIntelligence.js';
import { getLogger } from '../../config/service-urls';
import { MetricsRepository } from './timescale/MetricsRepository';
import { ProviderUsageRepository } from './timescale/ProviderUsageRepository';
import { IntelligenceRepository } from './timescale/IntelligenceRepository';
import { UserActivityRepository } from './timescale/UserActivityRepository';
import { OperationsRepository } from './timescale/OperationsRepository';

const logger = getLogger('ai-analytics-service-timescaleanalyticsrepository');

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeoutMs?: number;
  queryTimeoutMs?: number;
}

export class TimescaleAnalyticsRepository implements IAnalyticsRepository {
  private readonly pool: Pool;
  private readonly metrics: MetricsRepository;
  private readonly providerUsage: ProviderUsageRepository;
  private readonly intelligence: IntelligenceRepository;
  private readonly userActivity: UserActivityRepository;
  private readonly operations: OperationsRepository;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: true } : false,
      max: config.maxConnections || (process.env.NODE_ENV === 'production' ? 50 : 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
      statement_timeout: config.queryTimeoutMs || 30000,
      query_timeout: config.queryTimeoutMs || 30000,
    });

    this.pool.on('error', err => {
      logger.error('Pool error:', { data: err });
    });

    this.pool.on('connect', () => {
      logger.debug('New client connected');
    });

    this.metrics = new MetricsRepository(this.pool);
    this.providerUsage = new ProviderUsageRepository(this.pool);
    this.intelligence = new IntelligenceRepository(this.pool);
    this.userActivity = new UserActivityRepository(this.pool);
    this.operations = new OperationsRepository(this.pool);

    logger.debug('Repository initialized with connection pool');
  }

  // ================================
  // METRICS DELEGATION
  // ================================

  recordMetric(entry: MetricEntry): Promise<void> {
    return this.metrics.recordMetric(entry);
  }

  recordMetrics(entries: MetricEntry[]): Promise<void> {
    return this.metrics.recordMetrics(entries);
  }

  getMetrics(filter: MetricFilter): Promise<MetricEntry[]> {
    return this.metrics.getMetrics(filter);
  }

  getAggregatedMetrics(
    metricName: string,
    serviceName: string,
    startTime: Date,
    endTime: Date,
    aggregationWindow: 'minute' | 'hour' | 'day'
  ): Promise<AggregatedMetric[]> {
    return this.metrics.getAggregatedMetrics(metricName, serviceName, startTime, endTime, aggregationWindow);
  }

  getMetricTimeSeries(
    metricName: string,
    startTime: Date,
    endTime: Date,
    intervalMinutes: number,
    tags?: Record<string, string>
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    return this.metrics.getMetricTimeSeries(metricName, startTime, endTime, intervalMinutes, tags);
  }

  deleteOldMetrics(olderThan: Date): Promise<number> {
    return this.metrics.deleteOldMetrics(olderThan);
  }

  getMetricNames(serviceName?: string): Promise<string[]> {
    return this.metrics.getMetricNames(serviceName);
  }

  getServiceNames(): Promise<string[]> {
    return this.metrics.getServiceNames();
  }

  exportPrometheusMetrics(serviceName?: string): Promise<string> {
    return this.metrics.exportPrometheusMetrics(serviceName);
  }

  // ================================
  // PROVIDER USAGE DELEGATION
  // ================================

  recordProviderUsage(usage: ProviderAnalytics): Promise<void> {
    return this.providerUsage.recordProviderUsage(usage);
  }

  recordProviderUsagesBatch(usages: ProviderAnalytics[]): Promise<void> {
    return this.providerUsage.recordProviderUsagesBatch(usages);
  }

  getProviderUsage(filter: {
    providerId?: string;
    operation?: string;
    userId?: string;
    success?: boolean;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ProviderAnalytics[]> {
    return this.providerUsage.getProviderUsage(filter);
  }

  getProviderPerformanceMetrics(
    providerId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ProviderPerformanceMetrics> {
    return this.providerUsage.getProviderPerformanceMetrics(providerId, startTime, endTime);
  }

  getProviderComparison(operation: string, startTime: Date, endTime: Date): Promise<ProviderComparison> {
    return this.providerUsage.getProviderComparison(operation, startTime, endTime);
  }

  getProviderUsageTrends(
    providerId: string,
    timePeriod: 'hour' | 'day' | 'week' | 'month',
    startTime: Date,
    endTime: Date
  ): Promise<ProviderUsageTrends> {
    return this.providerUsage.getProviderUsageTrends(providerId, timePeriod, startTime, endTime);
  }

  recordProviderHealth(health: ProviderHealthMetrics): Promise<void> {
    return this.providerUsage.recordProviderHealth(health);
  }

  getProviderHealth(providerId?: string): Promise<ProviderHealthMetrics[]> {
    return this.providerUsage.getProviderHealth(providerId);
  }

  getProviderCostAnalytics(
    startTime: Date,
    endTime: Date,
    groupBy: 'provider' | 'operation' | 'user'
  ): Promise<Array<{ group: string; totalCost: number; requestCount: number; averageCost: number }>> {
    return this.providerUsage.getProviderCostAnalytics(startTime, endTime, groupBy);
  }

  getTopProvidersByUsage(
    startTime: Date,
    endTime: Date,
    limit: number
  ): Promise<
    Array<{ providerId: string; requestCount: number; totalCost: number; averageLatency: number; successRate: number }>
  > {
    return this.providerUsage.getTopProvidersByUsage(startTime, endTime, limit);
  }

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
  > {
    return this.providerUsage.getTopProvidersByError(startTime, endTime, limit);
  }

  getProviderUsageSummary(): Promise<{
    totalRequests: number;
    successRate: number;
    totalCost: number;
    byProvider: Record<string, { requests: number; cost: number; avgLatency: number }>;
  }> {
    return this.providerUsage.getProviderUsageSummary();
  }

  // ================================
  // INTELLIGENCE DELEGATION
  // ================================

  recordAnomaly(anomaly: AnomalyDetectionResult): Promise<string> {
    return this.intelligence.recordAnomaly(anomaly);
  }

  getAnomalies(filter: {
    severity?: string;
    status?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<AnomalyDetectionResult[]> {
    return this.intelligence.getAnomalies(filter);
  }

  updateAnomaly(id: string, updates: Partial<AnomalyDetectionResult>): Promise<void> {
    return this.intelligence.updateAnomaly(id, updates);
  }

  acknowledgeAnomaly(id: string, acknowledgedBy: string): Promise<void> {
    return this.intelligence.acknowledgeAnomaly(id, acknowledgedBy);
  }

  resolveAnomaly(id: string): Promise<void> {
    return this.intelligence.resolveAnomaly(id);
  }

  recordCostOptimizationRecommendation(recommendation: CostOptimizationRecommendation): Promise<string> {
    return this.intelligence.recordCostOptimizationRecommendation(recommendation);
  }

  getCostOptimizationRecommendations(filter: {
    type?: string;
    priority?: string;
    status?: string;
    limit?: number;
  }): Promise<CostOptimizationRecommendation[]> {
    return this.intelligence.getCostOptimizationRecommendations(filter);
  }

  recordPerformanceInsight(insight: PerformanceInsight): Promise<string> {
    return this.intelligence.recordPerformanceInsight(insight);
  }

  getPerformanceInsights(filter: {
    category?: string;
    severity?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<PerformanceInsight[]> {
    return this.intelligence.getPerformanceInsights(filter);
  }

  createAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): Promise<string> {
    return this.intelligence.createAlertRule(rule);
  }

  updateAlertRule(id: string, updates: Partial<AlertRule>): Promise<void> {
    return this.intelligence.updateAlertRule(id, updates);
  }

  deleteAlertRule(id: string): Promise<void> {
    return this.intelligence.deleteAlertRule(id);
  }

  getAlertRules(enabled?: boolean): Promise<AlertRule[]> {
    return this.intelligence.getAlertRules(enabled);
  }

  getAlertRule(id: string): Promise<AlertRule | null> {
    return this.intelligence.getAlertRule(id);
  }

  recordAlertTrigger(id: string): Promise<void> {
    return this.intelligence.recordAlertTrigger(id);
  }

  // ================================
  // USER ACTIVITY DELEGATION
  // ================================

  recordUserActivity(record: UserActivityRecord): Promise<void> {
    return this.userActivity.recordUserActivity(record);
  }

  getUserActivityByIp(ipAddress: string, since: Date): Promise<UserActivityRecord[]> {
    return this.userActivity.getUserActivityByIp(ipAddress, since);
  }

  getUserActivityByUserId(userId: string, since: Date): Promise<UserActivityRecord[]> {
    return this.userActivity.getUserActivityByUserId(userId, since);
  }

  getUserActivityLogs(filter: {
    userId?: string;
    action?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<
    Array<{
      id: number;
      timestamp: Date;
      userId: string;
      userType: string;
      sessionId: string | null;
      action: string;
      resource: string | null;
      workflowType: string | null;
      providerId: string | null;
      cost: number;
      processingTime: number | null;
      success: boolean;
      errorCode: string | null;
      metadata: Record<string, unknown> | null;
    }>
  > {
    return this.userActivity.getUserActivityLogs(filter);
  }

  getUserActivitySummary(options: {
    startTime?: Date;
    endTime?: Date;
    groupBy?: 'action' | 'hour' | 'day';
  }): Promise<{
    totalActions: number;
    uniqueUsers: number;
    byAction: Record<string, number>;
    byHour: Record<string, number>;
    topUsers: Array<{ userId: string; actionCount: number }>;
  }> {
    return this.userActivity.getUserActivitySummary(options);
  }

  // ================================
  // OPERATIONS DELEGATION
  // ================================

  getDashboardData(
    dashboardType: 'overview' | 'providers' | 'costs' | 'health',
    timeRange: { start: Date; end: Date },
    filters?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.operations.getDashboardData(dashboardType, timeRange, filters);
  }

  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, unknown> }> {
    return this.operations.healthCheck();
  }

  cleanupOldData(retentionDays: number): Promise<{
    metricsDeleted: number;
    providerLogsDeleted: number;
    anomaliesDeleted: number;
  }> {
    return this.operations.cleanupOldData(retentionDays);
  }

  deleteUserData(userId: string): Promise<{ deletedRecords: number }> {
    return this.operations.deleteUserData(userId);
  }

  exportUserData(userId: string): Promise<{ activityLogs: { eventType: string; timestamp: string }[] }> {
    return this.operations.exportUserData(userId);
  }

  close(): Promise<void> {
    return this.operations.close();
  }
}
