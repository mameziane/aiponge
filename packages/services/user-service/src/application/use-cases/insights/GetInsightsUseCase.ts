/**
 * Get Insights Use Case
 */

import { IIntelligenceRepository } from '@domains/intelligence';
import { Insight } from '@infrastructure/database/schemas/profile-schema';
import { getLogger } from '@config/service-urls';
import { InsightsError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('get-insights-use-case');

export interface GetInsightsRequest {
  userId: string;
  entryId?: string;
  filter?: {
    type?: string;
    category?: string;
    framework?: string;
    minConfidence?: number;
    dateFrom?: Date;
    dateTo?: Date;
  };
}

export interface GetInsightsResponse {
  insights: Insight[];
  summary: {
    totalInsights: number;
    highConfidenceInsights: number;
    averageConfidence: number;
    insightsByType: Record<string, number>;
    insightsByCategory: Record<string, number>;
  };
}

export class GetInsightsUseCase {
  constructor(private intelligenceRepository: IIntelligenceRepository) {}

  async execute(request: GetInsightsRequest): Promise<GetInsightsResponse> {
    try {
      if (!request.userId?.trim()) {
        throw InsightsError.userIdRequired();
      }

      let insights: Insight[];

      if (request.entryId) {
        insights = await this.intelligenceRepository.findInsightsByEntryId(request.entryId);

        if (insights.some(insight => insight.userId !== request.userId)) {
          throw InsightsError.ownershipRequired();
        }
      } else {
        insights = await this.intelligenceRepository.findInsightsByUserId(request.userId);
      }

      const summary = this.calculateInsightSummary(insights);

      logger.info('Insights retrieved', { userId: request.userId, count: insights.length });

      return {
        insights,
        summary,
      };
    } catch (error) {
      logger.error('Failed to get insights', { error: serializeError(error) });
      throw error;
    }
  }

  private calculateInsightSummary(insights: Insight[]) {
    const totalInsights = insights.length;
    const highConfidenceInsights = insights.filter(i => parseFloat(i.confidence || '0') > 0.7).length;
    const averageConfidence =
      insights.length > 0 ? insights.reduce((sum, i) => sum + parseFloat(i.confidence || '0'), 0) / insights.length : 0;

    const insightsByType: Record<string, number> = {};
    const insightsByCategory: Record<string, number> = {};

    insights.forEach(insight => {
      insightsByType[insight.type] = (insightsByType[insight.type] || 0) + 1;
      insightsByCategory[insight.category] = (insightsByCategory[insight.category] || 0) + 1;
    });

    return {
      totalInsights,
      highConfidenceInsights,
      averageConfidence,
      insightsByType,
      insightsByCategory,
    };
  }
}
