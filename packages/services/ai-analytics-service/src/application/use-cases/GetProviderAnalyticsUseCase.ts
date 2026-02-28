/**
 * Get Provider Analytics Use Case
 * Thin orchestrator delegating to domain-specific analyzers
 */

import { errorMessage } from '@aiponge/platform-core';
import { IProviderRepository } from '../../domains/repositories/IAnalyticsRepository';
import {
  ProviderComparison,
  ProviderPerformanceMetrics,
  ProviderUsageTrends,
} from '../../domains/entities/ProviderAnalytics';
import { TemplateServiceClient } from '../../infrastructure/clients/TemplateServiceClient';
import { getLogger } from '../../config/service-urls';
import { AnalyticsError } from '../errors';

import { ProviderAnalyticsEnricher } from './provider-analytics/ProviderAnalyticsEnricher';
import { ProviderHealthAnalyzer } from './provider-analytics/ProviderHealthAnalyzer';
import { ProviderCostAnalyzer } from './provider-analytics/ProviderCostAnalyzer';
import { ProviderComparisonAnalyzer } from './provider-analytics/ProviderComparisonAnalyzer';
import { ProviderInsightsGenerator } from './provider-analytics/ProviderInsightsGenerator';

export type {
  GetProviderAnalyticsRequest,
  ProviderComparisonRequest,
  ProviderHealthRequest,
  ProviderCostAnalysisRequest,
  GetProviderAnalyticsResult,
  ProviderAnalyticsWithInsights,
  ProviderSummaryStats,
  ProviderHealthSummary,
  ProviderCostAnalysis,
  ProviderInsight,
} from './provider-analytics/types';

import type {
  GetProviderAnalyticsRequest,
  GetProviderAnalyticsResult,
  ProviderComparisonRequest,
  ProviderHealthRequest,
  ProviderCostAnalysisRequest,
  ProviderHealthSummary,
  ProviderCostAnalysis,
} from './provider-analytics/types';

const logger = getLogger('ai-analytics-service-getprovideranalyticsusecase');

export class GetProviderAnalyticsUseCase {
  private readonly templateClient: TemplateServiceClient;
  private readonly enricher: ProviderAnalyticsEnricher;
  private readonly healthAnalyzer: ProviderHealthAnalyzer;
  private readonly costAnalyzer: ProviderCostAnalyzer;
  private readonly comparisonAnalyzer: ProviderComparisonAnalyzer;
  private readonly insightsGenerator: ProviderInsightsGenerator;

  constructor(private readonly repository: IProviderRepository) {
    this.templateClient = new TemplateServiceClient();
    this.enricher = new ProviderAnalyticsEnricher(repository);
    this.healthAnalyzer = new ProviderHealthAnalyzer(repository, this.templateClient);
    this.costAnalyzer = new ProviderCostAnalyzer(repository, this.templateClient);
    this.comparisonAnalyzer = new ProviderComparisonAnalyzer();
    this.insightsGenerator = new ProviderInsightsGenerator();
    logger.info('🔌 Initialized provider analytics service with template integration');
  }

  async execute(request: GetProviderAnalyticsRequest): Promise<GetProviderAnalyticsResult> {
    try {
      const startTime = Date.now();
      const timeRange = this.enricher.resolveTimeRange(request);
      const filter = this.enricher.buildProviderFilter(request, timeRange);

      const analytics = await this.repository.getProviderUsage(filter);
      const total = analytics.length;

      const sortedAnalytics = this.enricher.sortProviderAnalytics(analytics, request.sortBy, request.sortOrder);
      const { paginatedAnalytics, hasMore } = this.enricher.applyPagination(
        sortedAnalytics,
        request.offset || 0,
        request.limit || 100
      );

      const enrichedAnalytics = await this.enricher.enrichProviderAnalytics(paginatedAnalytics, request, timeRange);
      const summary = await this.enricher.calculateProviderSummaryStats(analytics, timeRange);

      let healthStatus: ProviderHealthSummary | undefined;
      if (request.includeHealthMetrics) {
        healthStatus = await this.healthAnalyzer.getProviderHealthSummary(request.providerId, timeRange);
      }

      let performanceMetrics: Record<string, ProviderPerformanceMetrics> | undefined;
      if (request.includePerformanceMetrics) {
        performanceMetrics = await this.healthAnalyzer.getProviderPerformanceMetrics(request, timeRange);
      }

      let trends: Record<string, ProviderUsageTrends> | undefined;
      if (request.includeTrendAnalysis) {
        trends = await this.healthAnalyzer.getProviderTrends(request, timeRange);
      }

      let comparison: ProviderComparison | undefined;
      if (request.includeComparison && request.operation) {
        comparison = await this.repository.getProviderComparison(request.operation, timeRange.start, timeRange.end);
      }

      let costAnalysis: ProviderCostAnalysis | undefined;
      if (request.includeCostAnalysis) {
        costAnalysis = await this.costAnalyzer.getProviderCostAnalysis(request, timeRange);
      }

      const insights = await this.insightsGenerator.generateProviderInsights(
        analytics,
        summary,
        performanceMetrics,
        costAnalysis,
        healthStatus
      );

      const processingTime = Date.now() - startTime;
      logger.info('🔌 Retrieved analytics for {} entries in {}ms', {
        data0: enrichedAnalytics.length,
        data1: processingTime,
      });

      return {
        analytics: enrichedAnalytics,
        total,
        pagination: {
          offset: request.offset || 0,
          limit: request.limit || 100,
          hasMore,
        },
        summary,
        healthStatus,
        performanceMetrics,
        trends,
        comparison,
        costAnalysis,
        insights,
      };
    } catch (error) {
      logger.error('Failed to retrieve provider analytics:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw AnalyticsError.queryFailed(
        'getProviderAnalytics',
        `Failed to retrieve provider analytics: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getProviderComparison(request: ProviderComparisonRequest): Promise<
    ProviderComparison & {
      detailedAnalysis: {
        bestProvider: {
          providerId: string;
          reason: string;
          advantages: string[];
        };
        recommendations: Array<{
          scenario: string;
          recommendedProvider: string;
          reasoning: string;
        }>;
        riskAssessment: Record<
          string,
          {
            reliability: 'low' | 'medium' | 'high';
            costVolatility: 'low' | 'medium' | 'high';
            performanceConsistency: 'low' | 'medium' | 'high';
          }
        >;
      };
    }
  > {
    try {
      const baseComparison = await this.repository.getProviderComparison(
        request.operation,
        request.startTime,
        request.endTime
      );

      let providers = baseComparison.providers;
      if (request.providerIds) {
        providers = providers.filter(p => request.providerIds!.includes(p.providerId));
      }

      const detailedAnalysis = this.comparisonAnalyzer.generateDetailedProviderComparison(providers, request.metrics);

      return {
        ...baseComparison,
        providers,
        detailedAnalysis,
      };
    } catch (error) {
      logger.error('Failed to get provider comparison:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw AnalyticsError.queryFailed(
        'getProviderComparison',
        `Failed to get provider comparison: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getProviderHealthDashboard(request: ProviderHealthRequest): Promise<{
    currentHealth: ProviderHealthSummary;
    healthHistory?: Array<{
      timestamp: Date;
      providerId: string;
      status: string;
      responseTime?: number;
      errorRate: number;
    }>;
    alerts: Array<{
      providerId: string;
      alertType: 'performance' | 'availability' | 'error_rate' | 'cost';
      severity: 'warning' | 'critical';
      message: string;
      startTime: Date;
      resolved: boolean;
    }>;
    recommendations: Array<{
      providerId: string;
      recommendation: string;
      urgency: 'low' | 'medium' | 'high';
      impact: string;
    }>;
  }> {
    try {
      const timeRange = this.enricher.resolveTimeRange({ timeRange: request.timeRange || 'last_24h' });

      const currentHealth = await this.healthAnalyzer.getProviderHealthSummary(request.providerId, timeRange);

      let healthHistory: Array<{ timestamp: Date; providerId: string; status: string; responseTime?: number; errorRate: number }> | undefined;
      if (request.includeHistorical) {
        const healthMetrics = await this.repository.getProviderHealth(request.providerId);
        healthHistory = healthMetrics
          .filter(h => h.timestamp && h.timestamp >= timeRange.start && h.timestamp <= timeRange.end)
          .map(h => ({
            timestamp: h.timestamp!,
            providerId: h.providerId,
            status: h.healthStatus ?? 'unknown',
            responseTime: h.responseTimeMs,
            errorRate: h.errorRate,
          }));
      }

      const alerts = this.healthAnalyzer.generateHealthAlerts(currentHealth);
      const recommendations = await this.healthAnalyzer.generateHealthRecommendations(currentHealth, healthHistory);

      return {
        currentHealth,
        healthHistory,
        alerts,
        recommendations,
      };
    } catch (error) {
      logger.error('Failed to get provider health dashboard:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw AnalyticsError.queryFailed(
        'getProviderHealthDashboard',
        `Failed to get provider health dashboard: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getProviderCostOptimization(request: ProviderCostAnalysisRequest): Promise<ProviderCostAnalysis> {
    try {
      const costAnalysis = await this.costAnalyzer.getProviderCostAnalysis(request, {
        start: request.startTime,
        end: request.endTime,
      });

      if (request.includeOptimizationRecommendations) {
        costAnalysis.optimizationRecommendations = await this.costAnalyzer.generateCostOptimizationRecommendations(costAnalysis);
      }

      if (request.includeForecast) {
        costAnalysis.forecast = this.costAnalyzer.generateCostForecast(costAnalysis.costTrends);
      }

      return costAnalysis;
    } catch (error) {
      logger.error('Failed to get cost optimization analysis:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw AnalyticsError.queryFailed(
        'getCostOptimization',
        `Failed to get cost optimization analysis: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}
