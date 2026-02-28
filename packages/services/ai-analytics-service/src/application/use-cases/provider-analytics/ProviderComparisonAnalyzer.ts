import { ProviderComparison } from '../../../domains/entities/ProviderAnalytics';

export class ProviderComparisonAnalyzer {
  generateDetailedProviderComparison(providers: ProviderComparison['providers'], requestedMetrics: string[]) {
    const bestProvider = providers.reduce((best, current) => {
      const bestScore = this.calculateProviderScore(best, requestedMetrics);
      const currentScore = this.calculateProviderScore(current, requestedMetrics);
      return currentScore > bestScore ? current : best;
    });

    return {
      bestProvider: {
        providerId: bestProvider.providerId,
        reason: `Highest overall score based on ${requestedMetrics.join(', ')}`,
        advantages: this.identifyProviderAdvantages(bestProvider, providers),
      },
      recommendations: this.generateProviderRecommendations(providers),
      riskAssessment: this.assessProviderRisks(providers),
    };
  }

  private calculateProviderScore(provider: ProviderComparison['providers'][number], metrics: string[]): number {
    let score = 0;
    let weightSum = 0;

    if (metrics.includes('latency')) {
      score += (1 / Math.max(provider.averageLatencyMs, 1)) * 30;
      weightSum += 30;
    }
    if (metrics.includes('success_rate')) {
      score += provider.successRate * 25;
      weightSum += 25;
    }
    if (metrics.includes('cost')) {
      score += (1 / Math.max(provider.costPerRequest, 0.001)) * 25;
      weightSum += 25;
    }
    if (metrics.includes('reliability')) {
      score += provider.successRate * 20;
      weightSum += 20;
    }

    return weightSum > 0 ? score / weightSum : 0;
  }

  private identifyProviderAdvantages(provider: ProviderComparison['providers'][number], allProviders: ProviderComparison['providers']): string[] {
    const advantages: string[] = [];

    const avgLatency = allProviders.reduce((sum, p) => sum + p.averageLatencyMs, 0) / allProviders.length;
    if (provider.averageLatencyMs < avgLatency * 0.8) {
      advantages.push('Significantly faster response times');
    }

    const avgCost = allProviders.reduce((sum, p) => sum + p.costPerRequest, 0) / allProviders.length;
    if (provider.costPerRequest < avgCost * 0.8) {
      advantages.push('Lower cost per request');
    }

    if (provider.successRate > 98) {
      advantages.push('High reliability');
    }

    return advantages;
  }

  private generateProviderRecommendations(providers: ProviderComparison['providers']) {
    return [
      {
        scenario: 'Cost optimization',
        recommendedProvider: providers.sort((a, b) => a.costPerRequest - b.costPerRequest)[0].providerId,
        reasoning: 'Lowest cost per request while maintaining acceptable performance',
      },
      {
        scenario: 'Performance critical',
        recommendedProvider: providers.sort((a, b) => a.averageLatencyMs - b.averageLatencyMs)[0].providerId,
        reasoning: 'Fastest response times for time-sensitive operations',
      },
      {
        scenario: 'High reliability',
        recommendedProvider: providers.sort((a, b) => b.successRate - a.successRate)[0].providerId,
        reasoning: 'Highest success rate for critical operations',
      },
    ];
  }

  private assessProviderRisks(providers: ProviderComparison['providers']): Record<string, { reliability: 'low' | 'medium' | 'high'; costVolatility: 'low' | 'medium' | 'high'; performanceConsistency: 'low' | 'medium' | 'high' }> {
    const riskAssessment: Record<string, { reliability: 'low' | 'medium' | 'high'; costVolatility: 'low' | 'medium' | 'high'; performanceConsistency: 'low' | 'medium' | 'high' }> = {};

    providers.forEach(provider => {
      riskAssessment[provider.providerId] = {
        reliability: provider.successRate > 98 ? 'low' : provider.successRate > 95 ? 'medium' : 'high',
        costVolatility: 'low',
        performanceConsistency: provider.averageLatencyMs < 2000 ? 'high' : 'medium',
      };
    });

    return riskAssessment;
  }
}
