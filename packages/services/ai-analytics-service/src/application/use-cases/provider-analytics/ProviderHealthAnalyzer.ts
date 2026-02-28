import { IProviderRepository } from '../../../domains/repositories/IAnalyticsRepository';
import { ProviderPerformanceMetrics, ProviderUsageTrends } from '../../../domains/entities/ProviderAnalytics';
import { TemplateServiceClient } from '../../../infrastructure/clients/TemplateServiceClient';
import { TEMPLATE_IDS } from '../../../infrastructure/clients/TemplateIds';
import type { GetProviderAnalyticsRequest, ProviderHealthSummary } from './types';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('ai-analytics-service-provider-health-analyzer');

export class ProviderHealthAnalyzer {
  constructor(
    private readonly repository: IProviderRepository,
    private readonly templateClient: TemplateServiceClient
  ) {}

  async getProviderHealthSummary(
    providerId?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<ProviderHealthSummary> {
    const healthMetrics = await this.repository.getProviderHealth(providerId);

    const healthyCount = healthMetrics.filter(h => h.healthStatus === 'healthy').length;
    const degradedCount = healthMetrics.filter(h => h.healthStatus === 'degraded').length;
    const unhealthyCount = healthMetrics.filter(h => h.healthStatus === 'unhealthy').length;
    const unavailableCount = healthMetrics.filter(h => h.healthStatus === 'unavailable').length;

    const overallHealth = this.determineOverallHealth(healthyCount, degradedCount, unhealthyCount, unavailableCount);

    const healthByType: Record<string, { healthy: number; degraded: number; unhealthy: number }> = {};

    const criticalIssues = healthMetrics
      .filter(h => h.healthStatus === 'unhealthy' && h.errorRate > 50)
      .map(h => ({
        providerId: h.providerId,
        issue: h.lastError || 'High error rate',
        severity: 'critical' as const,
        duration: Date.now() - (h.timestamp ?? new Date()).getTime(),
      }));

    const healthTrends = timeRange
      ? [
          {
            timestamp: timeRange.start,
            healthyCount: healthyCount,
            issues: degradedCount + unhealthyCount + unavailableCount,
          },
          {
            timestamp: timeRange.end,
            healthyCount: healthyCount,
            issues: degradedCount + unhealthyCount + unavailableCount,
          },
        ]
      : [];

    return {
      overallHealth,
      healthyCount,
      degradedCount,
      unhealthyCount,
      unavailableCount,
      healthByType,
      criticalIssues,
      healthTrends,
    };
  }

  async getProviderPerformanceMetrics(
    request: GetProviderAnalyticsRequest,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, ProviderPerformanceMetrics>> {
    const metrics: Record<string, ProviderPerformanceMetrics> = {};

    if (request.providerId) {
      metrics[request.providerId] = await this.repository.getProviderPerformanceMetrics(
        request.providerId,
        timeRange.start,
        timeRange.end
      );
    } else {
      const topProviders = await this.repository.getTopProvidersByUsage(timeRange.start, timeRange.end, 10);
      for (const provider of topProviders) {
        try {
          metrics[provider.providerId] = await this.repository.getProviderPerformanceMetrics(
            provider.providerId,
            timeRange.start,
            timeRange.end
          );
        } catch (error) {
          logger.warn('Failed to get performance metrics for ${provider.providerId}:', { data: error });
        }
      }
    }

    return metrics;
  }

  async getProviderTrends(
    request: GetProviderAnalyticsRequest,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, ProviderUsageTrends>> {
    const trends: Record<string, ProviderUsageTrends> = {};

    if (request.providerId) {
      const aggregationWindow = request.aggregationWindow === 'minute' ? 'hour' : request.aggregationWindow || 'hour';
      trends[request.providerId] = await this.repository.getProviderUsageTrends(
        request.providerId,
        aggregationWindow,
        timeRange.start,
        timeRange.end
      );
    } else {
      const topProviders = await this.repository.getTopProvidersByUsage(timeRange.start, timeRange.end, 5);
      for (const provider of topProviders) {
        try {
          const aggregationWindow =
            request.aggregationWindow === 'minute' ? 'hour' : request.aggregationWindow || 'hour';
          trends[provider.providerId] = await this.repository.getProviderUsageTrends(
            provider.providerId,
            aggregationWindow,
            timeRange.start,
            timeRange.end
          );
        } catch (error) {
          logger.warn('Failed to get trends for ${provider.providerId}:', { data: error });
        }
      }
    }

    return trends;
  }

  generateHealthAlerts(healthStatus: ProviderHealthSummary) {
    const alerts: Array<{
      providerId: string;
      alertType: 'performance' | 'availability' | 'error_rate' | 'cost';
      severity: 'warning' | 'critical';
      message: string;
      startTime: Date;
      resolved: boolean;
    }> = [];

    healthStatus.criticalIssues.forEach(issue => {
      alerts.push({
        providerId: issue.providerId,
        alertType: 'availability',
        severity: 'critical',
        message: issue.issue,
        startTime: new Date(Date.now() - issue.duration),
        resolved: false,
      });
    });

    return alerts;
  }

  async generateHealthRecommendations(
    healthStatus: ProviderHealthSummary,
    healthHistory?: Array<{
      timestamp: Date;
      providerId: string;
      status: string;
      responseTime?: number;
      errorRate: number;
    }>
  ): Promise<
    Array<{
      providerId: string;
      recommendation: string;
      urgency: 'low' | 'medium' | 'high';
      impact: string;
    }>
  > {
    const recommendations: Array<{
      providerId: string;
      recommendation: string;
      urgency: 'low' | 'medium' | 'high';
      impact: string;
    }> = [];

    for (const issue of healthStatus.criticalIssues) {
      const recommendation = await this.templateClient.executeWithFallback(
        TEMPLATE_IDS.CRITICAL_ISSUE_RECOMMENDATION,
        {
          provider_id: issue.providerId,
          issue_description: issue.issue,
          duration: issue.duration || 'unknown',
          severity: 'critical',
        },
        () => `Immediate investigation required for: ${issue.issue}`
      );

      const impact = await this.templateClient.executeWithFallback(
        TEMPLATE_IDS.CRITICAL_ISSUE_RECOMMENDATION,
        {
          provider_id: issue.providerId,
          issue_description: issue.issue,
          duration: issue.duration || 'unknown',
          severity: 'critical',
          context: 'impact',
        },
        () => 'Service disruption and poor user experience'
      );

      recommendations.push({
        providerId: issue.providerId,
        recommendation,
        urgency: 'high',
        impact,
      });
    }

    return recommendations;
  }

  private determineOverallHealth(
    healthy: number,
    degraded: number,
    unhealthy: number,
    unavailable: number
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const total = healthy + degraded + unhealthy + unavailable;
    if (total === 0) return 'healthy';

    const healthyPercentage = (healthy / total) * 100;
    if (healthyPercentage >= 90) return 'healthy';
    if (healthyPercentage >= 70) return 'degraded';
    return 'unhealthy';
  }
}
