import { ProviderAnalytics, ProviderPerformanceMetrics } from '../../../domains/entities/ProviderAnalytics';
import type { ProviderSummaryStats, ProviderHealthSummary, ProviderCostAnalysis, ProviderInsight } from './types';

export class ProviderInsightsGenerator {
  async generateProviderInsights(
    analytics: ProviderAnalytics[],
    summary: ProviderSummaryStats,
    performanceMetrics?: Record<string, ProviderPerformanceMetrics>,
    costAnalysis?: ProviderCostAnalysis,
    healthStatus?: ProviderHealthSummary
  ): Promise<ProviderInsight[]> {
    const insights: ProviderInsight[] = [];

    if (summary.averageResponseTime > 5000) {
      insights.push({
        type: 'performance',
        priority: 'high',
        title: 'High Average Response Time',
        description: `Average provider response time is ${Math.round(summary.averageResponseTime / 1000)} seconds, significantly above optimal range.`,
        impact: 'Slow response times degrade user experience and workflow performance.',
        recommendation: 'Consider switching to faster providers or optimizing request patterns.',
        metrics: {
          averageResponseTime: summary.averageResponseTime,
          slowRequests: summary.performanceDistribution.slow,
        },
        confidence: 0.9,
        actionable: true,
      });
    }

    if (costAnalysis && costAnalysis.totalCost > 100) {
      insights.push({
        type: 'cost',
        priority: 'medium',
        title: 'High Provider Costs',
        description: `Total provider costs are $${costAnalysis.totalCost.toFixed(2)}, which may benefit from optimization.`,
        impact: 'High costs impact budget efficiency and operational sustainability.',
        recommendation: 'Review provider selection and consider cost-effective alternatives.',
        metrics: {
          totalCost: costAnalysis.totalCost,
          dailyBurn: costAnalysis.budgetAnalysis?.currentBurn || 0,
        },
        confidence: 0.8,
        actionable: true,
        estimatedSavings: costAnalysis.totalCost * 0.2,
      });
    }

    if (summary.overallSuccessRate < 95) {
      const problematicProviders = summary.topProvidersByError.filter(p => p.errorRate > 10);

      insights.push({
        type: 'reliability',
        priority: 'critical',
        title: 'Low Provider Reliability',
        description: `Overall success rate is ${summary.overallSuccessRate.toFixed(1)}%, with ${problematicProviders.length} providers showing high error rates.`,
        impact: 'Poor reliability affects system stability and user trust.',
        recommendation: `Address issues with providers: ${problematicProviders.map(p => p.providerId).join(', ')}`,
        metrics: {
          successRate: summary.overallSuccessRate,
          problematicProviders: problematicProviders.length,
        },
        confidence: 0.95,
        actionable: true,
      });
    }

    if (healthStatus && healthStatus.overallHealth !== 'healthy') {
      insights.push({
        type: 'health',
        priority: healthStatus.criticalIssues.length > 0 ? 'critical' : 'high',
        title: 'Provider Health Issues',
        description: `System health is ${healthStatus.overallHealth} with ${healthStatus.criticalIssues.length} critical issues.`,
        impact: 'Health issues can lead to service degradation and outages.',
        recommendation: 'Investigate and resolve provider health issues immediately.',
        metrics: {
          healthyProviders: healthStatus.healthyCount,
          unhealthyProviders: healthStatus.unhealthyCount,
          criticalIssues: healthStatus.criticalIssues.length,
        },
        confidence: 1.0,
        actionable: true,
      });
    }

    const topProvider = summary.topProvidersByUsage[0];
    if (topProvider && topProvider.marketShare > 70) {
      insights.push({
        type: 'usage',
        priority: 'medium',
        title: 'High Provider Concentration Risk',
        description: `${topProvider.providerId} handles ${topProvider.marketShare.toFixed(1)}% of all requests, creating concentration risk.`,
        impact: 'Over-reliance on single provider increases risk of service disruption.',
        recommendation: 'Diversify provider usage to reduce concentration risk.',
        metrics: {
          topProviderShare: topProvider.marketShare,
          requestCount: topProvider.requestCount,
        },
        confidence: 0.8,
        actionable: true,
      });
    }

    return insights;
  }
}
