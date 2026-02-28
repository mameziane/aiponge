import { IProviderRepository } from '../../../domains/repositories/IAnalyticsRepository';
import {
  ProviderAnalytics,
  ProviderHealthMetrics,
  ProviderPerformanceMetrics,
} from '../../../domains/entities/ProviderAnalytics';
import type {
  ProviderAnalyticsWithInsights,
  ProviderSummaryStats,
  GetProviderAnalyticsRequest,
} from './types';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('ai-analytics-service-provider-enricher');

export class ProviderAnalyticsEnricher {
  constructor(private readonly repository: IProviderRepository) {}

  resolveTimeRange(request: GetProviderAnalyticsRequest): { start: Date; end: Date } {
    const now = new Date();
    const end = request.endTime || now;

    if (request.startTime) {
      return { start: request.startTime, end };
    }

    let start: Date;
    switch (request.timeRange) {
      case 'last_hour':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'last_24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last_7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last_90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end };
  }

  buildProviderFilter(request: GetProviderAnalyticsRequest, timeRange: { start: Date; end: Date }) {
    return {
      providerId: request.providerId,
      operation: request.operation,
      userId: request.userId,
      success: request.success,
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: Math.min(request.limit || 100, 10000),
      offset: request.offset || 0,
    };
  }

  sortProviderAnalytics(
    analytics: ProviderAnalytics[],
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc'
  ): ProviderAnalytics[] {
    if (!sortBy) {
      return analytics.sort((a, b) => {
        const aTime = a.timestamp.getTime();
        const bTime = b.timestamp.getTime();
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      });
    }

    return [...analytics].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'timestamp':
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case 'responseTime':
          comparison = (a.responseTimeMs ?? 0) - (b.responseTimeMs ?? 0);
          break;
        case 'cost':
          comparison = (a.cost ?? 0) - (b.cost ?? 0);
          break;
        case 'providerId':
          comparison = a.providerId.localeCompare(b.providerId);
          break;
        case 'success':
          comparison = (a.success ? 1 : 0) - (b.success ? 1 : 0);
          break;
        default:
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  applyPagination(
    analytics: ProviderAnalytics[],
    offset: number,
    limit: number
  ): {
    paginatedAnalytics: ProviderAnalytics[];
    hasMore: boolean;
  } {
    const startIndex = offset;
    const endIndex = offset + limit;

    return {
      paginatedAnalytics: analytics.slice(startIndex, endIndex),
      hasMore: endIndex < analytics.length,
    };
  }

  async enrichProviderAnalytics(
    analytics: ProviderAnalytics[],
    request: GetProviderAnalyticsRequest,
    timeRange: { start: Date; end: Date }
  ): Promise<ProviderAnalyticsWithInsights[]> {
    const enriched: ProviderAnalyticsWithInsights[] = [];

    const healthData = await this.repository.getProviderHealth();
    const healthMap = new Map(healthData.map(h => [h.providerId, h]));

    const providerPerformanceMap = new Map<string, ProviderPerformanceMetrics>();
    const uniqueProviders = [...new Set(analytics.map(a => a.providerId))];

    for (const providerId of uniqueProviders) {
      try {
        const perfMetrics = await this.repository.getProviderPerformanceMetrics(
          providerId,
          timeRange.start,
          timeRange.end
        );
        providerPerformanceMap.set(providerId, perfMetrics);
      } catch (error) {
        logger.warn('Failed to get performance metrics for provider ${providerId}:', { data: error });
      }
    }

    for (const analytic of analytics) {
      const enrichedAnalytic: ProviderAnalyticsWithInsights = { ...analytic };

      const health = healthMap.get(analytic.providerId);
      if (health) {
        enrichedAnalytic.healthContext = {
          currentStatus: health.healthStatus ?? 'unknown',
          recentErrors: health.lastError ? [health.lastError] : [],
          performanceTrend: this.determinePerformanceTrend(analytic, health),
          uptime24h: health.uptime,
        };
      }

      const perfMetrics = providerPerformanceMap.get(analytic.providerId);
      if (perfMetrics) {
        enrichedAnalytic.costContext = {
          costEfficiency: analytic.success ? (analytic.cost ?? 0) : 0,
          relativeCost: this.determineRelativeCost(analytic.cost ?? 0, perfMetrics.averageRequestCost ?? 0),
          costTrend: 'stable',
        };

        enrichedAnalytic.performanceContext = {
          latencyPercentile: this.calculateLatencyPercentile(analytic.responseTimeMs ?? 0, perfMetrics),
          successRateComparison: analytic.success ? 100 : 0,
          volumeImpact: this.determineVolumeImpact(analytic.timestamp),
        };
      }

      enriched.push(enrichedAnalytic);
    }

    return enriched;
  }

  async calculateProviderSummaryStats(
    analytics: ProviderAnalytics[],
    timeRange: { start: Date; end: Date }
  ): Promise<ProviderSummaryStats> {
    const totalRequests = analytics.length;
    const uniqueProviders = new Set(analytics.map(a => a.providerId)).size;
    const successfulRequests = analytics.filter(a => a.success).length;
    const totalResponseTime = analytics.reduce((sum, a) => sum + (a.responseTimeMs ?? 0), 0);
    const totalCost = analytics.reduce((sum, a) => sum + (a.cost ?? 0), 0);

    const providerStats = new Map<
      string,
      {
        requestCount: number;
        successCount: number;
        totalLatency: number;
        totalCost: number;
      }
    >();

    analytics.forEach(a => {
      if (!providerStats.has(a.providerId)) {
        providerStats.set(a.providerId, { requestCount: 0, successCount: 0, totalLatency: 0, totalCost: 0 });
      }
      const stats = providerStats.get(a.providerId)!;
      stats.requestCount++;
      if (a.success) stats.successCount++;
      stats.totalLatency += a.responseTimeMs ?? 0;
      stats.totalCost += a.cost ?? 0;
    });

    const topProvidersByUsage = Array.from(providerStats.entries())
      .map(([providerId, stats]) => ({
        providerId,
        requestCount: stats.requestCount,
        successRate: (stats.successCount / stats.requestCount) * 100,
        averageLatency: stats.totalLatency / stats.requestCount,
        totalCost: stats.totalCost,
        marketShare: (stats.requestCount / totalRequests) * 100,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    const errorStats = new Map<string, { errorCount: number; errors: Map<string, number> }>();
    analytics
      .filter(a => !a.success)
      .forEach(a => {
        if (!errorStats.has(a.providerId)) {
          errorStats.set(a.providerId, { errorCount: 0, errors: new Map() });
        }
        const stats = errorStats.get(a.providerId)!;
        stats.errorCount++;
        if (a.errorType) {
          stats.errors.set(a.errorType, (stats.errors.get(a.errorType) || 0) + 1);
        }
      });

    const topProvidersByError = Array.from(errorStats.entries())
      .map(([providerId, stats]) => {
        const providerTotal = providerStats.get(providerId)?.requestCount || 1;
        return {
          providerId,
          errorCount: stats.errorCount,
          errorRate: (stats.errorCount / providerTotal) * 100,
          topErrors: Array.from(stats.errors.entries())
            .map(([errorType, count]) => ({ errorType, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        };
      })
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 10);

    const costBreakdown: Record<string, { totalCost: number; percentage: number; averageRequestCost: number }> = {};
    const providerTypeCosts = new Map<string, { cost: number; count: number }>();

    analytics.forEach(a => {
      if (!providerTypeCosts.has(a.providerType ?? 'unknown')) {
        providerTypeCosts.set(a.providerType ?? 'unknown', { cost: 0, count: 0 });
      }
      const stats = providerTypeCosts.get(a.providerType ?? 'unknown')!;
      stats.cost += a.cost ?? 0;
      stats.count++;
    });

    providerTypeCosts.forEach((stats, providerType) => {
      costBreakdown[providerType] = {
        totalCost: stats.cost,
        percentage: (stats.cost / totalCost) * 100,
        averageRequestCost: stats.cost / stats.count,
      };
    });

    const fastRequests = analytics.filter(a => (a.responseTimeMs ?? 0) < 1000).length;
    const mediumRequests = analytics.filter(
      a => (a.responseTimeMs ?? 0) >= 1000 && (a.responseTimeMs ?? 0) <= 5000
    ).length;
    const slowRequests = analytics.filter(a => (a.responseTimeMs ?? 0) > 5000).length;

    const healthMetrics = await this.repository.getProviderHealth();
    const activeProviders = new Set(analytics.map(a => a.providerId)).size;
    const healthyProviders = healthMetrics.filter(h => h.healthStatus === 'healthy').length;

    return {
      totalRequests,
      uniqueProviders,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      totalCost,
      overallSuccessRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      activeProviders,
      healthyProviders,
      topProvidersByUsage,
      topProvidersByError,
      costBreakdown,
      performanceDistribution: {
        fast: fastRequests,
        medium: mediumRequests,
        slow: slowRequests,
      },
    };
  }

  private determinePerformanceTrend(
    analytic: ProviderAnalytics,
    health: ProviderHealthMetrics
  ): 'improving' | 'declining' | 'stable' {
    if ((analytic.responseTimeMs ?? 0) < 1000 && health.errorRate < 5) return 'improving';
    if ((analytic.responseTimeMs ?? 0) > 5000 || health.errorRate > 20) return 'declining';
    return 'stable';
  }

  private determineRelativeCost(cost: number, averageCost: number): 'low' | 'medium' | 'high' {
    if (cost < averageCost * 0.8) return 'low';
    if (cost > averageCost * 1.2) return 'high';
    return 'medium';
  }

  private calculateLatencyPercentile(latency: number, perfMetrics: ProviderPerformanceMetrics): number {
    if (latency <= (perfMetrics.medianLatency ?? 0)) return 50;
    if (latency <= (perfMetrics.p95Latency ?? 0)) return 95;
    return 99;
  }

  private determineVolumeImpact(timestamp: Date): 'peak' | 'normal' | 'low' {
    const hour = timestamp.getHours();
    if (hour >= 9 && hour <= 17) return 'peak';
    if (hour >= 6 && hour <= 22) return 'normal';
    return 'low';
  }
}
