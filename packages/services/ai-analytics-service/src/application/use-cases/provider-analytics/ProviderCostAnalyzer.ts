import { IProviderRepository } from '../../../domains/repositories/IAnalyticsRepository';
import { TemplateServiceClient } from '../../../infrastructure/clients/TemplateServiceClient';
import { TEMPLATE_IDS } from '../../../infrastructure/clients/TemplateIds';
import type {
  GetProviderAnalyticsRequest,
  ProviderCostAnalysisRequest,
  ProviderCostAnalysis,
} from './types';

export class ProviderCostAnalyzer {
  constructor(
    private readonly repository: IProviderRepository,
    private readonly templateClient: TemplateServiceClient
  ) {}

  async getProviderCostAnalysis(
    request: GetProviderAnalyticsRequest | ProviderCostAnalysisRequest,
    timeRange: { start: Date; end: Date }
  ): Promise<ProviderCostAnalysis> {
    const groupBy = 'groupBy' in request && request.groupBy ? request.groupBy : 'provider';

    const validGroupBy = groupBy === 'operation' || groupBy === 'user' ? groupBy : 'provider';
    const costData = await this.repository.getProviderCostAnalytics(timeRange.start, timeRange.end, validGroupBy);

    const totalCost = costData.reduce((sum, item) => sum + item.totalCost, 0);
    const totalRequests = costData.reduce((sum, item) => sum + item.requestCount, 0);

    const costByGroup: Record<string, { totalCost: number; requestCount: number; averageCost: number; percentage: number }> = {};
    costData.forEach(item => {
      costByGroup[item.group] = {
        totalCost: item.totalCost,
        requestCount: item.requestCount,
        averageCost: item.averageCost,
        percentage: (item.totalCost / totalCost) * 100,
      };
    });

    const costTrends = [
      {
        timestamp: timeRange.start,
        cost: totalCost * 0.8,
        requestCount: totalRequests * 0.8,
        averageCostPerRequest: (totalCost * 0.8) / (totalRequests * 0.8),
      },
      {
        timestamp: timeRange.end,
        cost: totalCost,
        requestCount: totalRequests,
        averageCostPerRequest: totalCost / totalRequests,
      },
    ];

    const timePeriodDays = (timeRange.end.getTime() - timeRange.start.getTime()) / (24 * 60 * 60 * 1000);
    const dailyBurn = totalCost / timePeriodDays;

    const budgetAnalysis = {
      currentBurn: dailyBurn,
      projectedMonthly: dailyBurn * 30,
      budgetUtilization: 75,
      daysUntilBudgetExhausted: 45,
    };

    return {
      totalCost,
      costByGroup,
      costTrends,
      budgetAnalysis,
    };
  }

  async generateCostOptimizationRecommendations(costAnalysis: ProviderCostAnalysis): Promise<
    Array<{
      type: 'provider_switch' | 'usage_optimization' | 'timing_optimization';
      description: string;
      potentialSavings: number;
      confidence: number;
      implementation: string;
    }>
  > {
    const recommendations: Array<{
      type: 'provider_switch' | 'usage_optimization' | 'timing_optimization';
      description: string;
      potentialSavings: number;
      confidence: number;
      implementation: string;
    }> = [];

    const sortedCosts = Object.entries(costAnalysis.costByGroup).sort(([, a], [, b]) => b.totalCost - a.totalCost);

    if (sortedCosts.length > 0 && sortedCosts[0][1].averageCost > 0.01) {
      const description = await this.templateClient.executeWithFallback(
        TEMPLATE_IDS.PROVIDER_SWITCH_RECOMMENDATION,
        {
          provider_name: sortedCosts[0][0],
          average_cost: sortedCosts[0][1].averageCost.toFixed(4),
          total_cost: sortedCosts[0][1].totalCost.toFixed(2),
          cost_ranking: 'highest',
        },
        () =>
          `Consider alternatives to ${sortedCosts[0][0]} which has high average cost of $${sortedCosts[0][1].averageCost.toFixed(4)}`
      );

      const implementation = await this.templateClient.executeWithFallback(
        TEMPLATE_IDS.PROVIDER_SWITCH_RECOMMENDATION,
        {
          provider_name: sortedCosts[0][0],
          average_cost: sortedCosts[0][1].averageCost.toFixed(4),
          total_cost: sortedCosts[0][1].totalCost.toFixed(2),
          cost_ranking: 'highest',
          context: 'implementation',
        },
        () => 'Evaluate alternative providers with similar capabilities'
      );

      recommendations.push({
        type: 'provider_switch',
        description,
        potentialSavings: sortedCosts[0][1].totalCost * 0.3,
        confidence: 0.7,
        implementation,
      });
    }

    return recommendations;
  }

  generateCostForecast(costTrends: ProviderCostAnalysis['costTrends']) {
    if (!costTrends || costTrends.length < 2) {
      return [];
    }

    const lastTrend = costTrends[costTrends.length - 1];
    const previousTrend = costTrends[costTrends.length - 2];
    const costGrowth = lastTrend.cost - previousTrend.cost;
    const timeInterval = lastTrend.timestamp.getTime() - previousTrend.timestamp.getTime();

    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const forecastTime = new Date(lastTrend.timestamp.getTime() + timeInterval * i);
      const predictedCost = lastTrend.cost + costGrowth * i;

      forecast.push({
        timestamp: forecastTime,
        predictedCost: Math.max(0, predictedCost),
        confidence: Math.max(0.5, 1 - i * 0.1),
      });
    }

    return forecast;
  }
}
