/**
 * Calculate User Wellness Score Use Case - Profile Service
 * Calculates overall wellness metrics, aggregates emotional and cognitive data, provides wellness trends and recommendations
 */

import { IProfileRepository } from '@domains/profile';
import { IEntryRepository } from '@domains/profile';
import { IAnalysisRepository } from '@domains/profile';
import { getLogger } from '@config/service-urls';
import { InsightsError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

import type {
  EntryData,
  InsightEntry,
  PatternEntry,
  AnalyticsEntry,
  WellnessData,
  WellnessMetrics,
  WellnessDimension,
  CalculateUserWellnessScoreRequest,
  CalculateUserWellnessScoreResponse,
} from './wellness-types';

import {
  calculateEmotionalWellness,
  calculateCognitiveWellness,
  calculateBehavioralWellness,
  calculateSocialWellness,
  calculatePhysicalWellness,
  calculateSpiritualWellness,
} from './wellness-dimension-calculators';

import {
  calculateOverallWellnessScore,
  determineWellnessGrade,
  generateWellnessTrends,
  generateWellnessInsights,
  createWellnessSummary,
  generateWellnessComparison,
  generateWellnessAlerts,
  calculateConfidenceMetrics,
} from './wellness-scoring';

export type {
  WellnessDimension,
  WellnessMetrics,
  WellnessTrend,
  WellnessInsight,
  CalculateUserWellnessScoreRequest,
  CalculateUserWellnessScoreResponse,
} from './wellness-types';

const logger = getLogger('user-service-calculateuserwellnessscoreusecase');

export class CalculateUserWellnessScoreUseCase {
  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository,
    private readonly analysisRepository: IAnalysisRepository
  ) {}

  async execute(request: CalculateUserWellnessScoreRequest): Promise<CalculateUserWellnessScoreResponse> {
    try {
      logger.info('💚 Calculating wellness score for user: {}', { data0: request.userId });

      this.validateRequest(request);

      const timeframe = request.timeframe || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const wellnessData = await this.gatherWellnessData(request.userId, timeframe);

      const metrics = this.calculateWellnessMetrics(
        wellnessData,
        request.dimensions,
        request.analysisDepth || 'comprehensive'
      );

      const overallScore = calculateOverallWellnessScore(metrics);
      const wellnessGrade = determineWellnessGrade(overallScore);

      const trends = request.includeTrends ? generateWellnessTrends(timeframe, metrics, overallScore) : [];

      const insights = request.includeInsights ? generateWellnessInsights(metrics, wellnessData, trends) : [];

      const summary = createWellnessSummary(metrics, insights, overallScore);

      const comparison = request.compareWithPrevious ? generateWellnessComparison(overallScore, metrics) : undefined;

      const alerts = request.generateAlerts ? generateWellnessAlerts(metrics, insights, overallScore) : [];

      const confidence = calculateConfidenceMetrics(wellnessData, timeframe);

      await this.recordWellnessCalculationEvent(request, overallScore, metrics);

      logger.info('Successfully calculated wellness score for user: {} - Score: {}', {
        data0: request.userId,
        data1: overallScore,
      });

      return {
        userId: request.userId,
        overallWellnessScore: overallScore,
        wellnessGrade,
        calculatedAt: new Date(),
        timeframe,
        metrics,
        trends,
        insights,
        summary,
        comparison,
        alerts,
        confidence,
      };
    } catch (error) {
      logger.error('Failed to calculate wellness score: {}', { data0: error });
      if (error instanceof InsightsError) {
        throw error;
      }
      throw InsightsError.internalError(
        'Failed to calculate wellness score',
        error instanceof Error ? error : undefined
      );
    }
  }

  private validateRequest(request: CalculateUserWellnessScoreRequest): void {
    if (!request.userId?.trim()) {
      throw InsightsError.userIdRequired();
    }

    if (request.analysisDepth && !['basic', 'comprehensive', 'detailed'].includes(request.analysisDepth)) {
      throw InsightsError.validationError('analysisDepth', 'Invalid analysis depth');
    }

    if (request.timeframe) {
      const { start, end } = request.timeframe;
      if (start >= end) {
        throw InsightsError.invalidDateRange(start, end);
      }

      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff < 7) {
        logger.warn('Timeframe less than 7 days may produce less reliable wellness scores');
      }
    }

    if (request.dimensions) {
      const validDimensions = ['emotional', 'cognitive', 'behavioral', 'social', 'physical', 'spiritual'];
      const invalidDimensions = request.dimensions.filter(d => !validDimensions.includes(d));
      if (invalidDimensions.length > 0) {
        throw InsightsError.validationError('dimensions', `Invalid dimensions: ${invalidDimensions.join(', ')}`);
      }
    }
  }

  private async gatherWellnessData(userId: string, timeframe: { start: Date; end: Date }): Promise<WellnessData> {
    try {
      const [entriesResult, insightsResult, patternsResult, analyticsResult, historicalResult] =
        await Promise.allSettled([
          this.entryRepository.getEntriesByUser(userId, {
            dateFrom: timeframe.start,
            dateTo: timeframe.end,
            isArchived: false,
          }),
          this.entryRepository.getInsightsByUser(userId, {
            dateFrom: timeframe.start,
            dateTo: timeframe.end,
            minConfidence: 0.5,
          }),
          this.analysisRepository.getUserPatterns(userId, {
            dateFrom: timeframe.start,
            dateTo: timeframe.end,
            isActive: true,
          }),
          this.analysisRepository.getProfileAnalytics(userId, {
            validFrom: timeframe.start,
            validTo: timeframe.end,
          }),
          this.getHistoricalWellnessData(userId, timeframe.start),
        ]);

      if (entriesResult.status === 'rejected') throw entriesResult.reason;
      if (insightsResult.status === 'rejected') throw insightsResult.reason;

      const entries = entriesResult.value;
      const insights = insightsResult.value;

      const patterns = patternsResult.status === 'fulfilled' ? patternsResult.value : [];
      const analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value : [];
      const historicalWellness = historicalResult.status === 'fulfilled' ? historicalResult.value : [];

      if (patternsResult.status === 'rejected') {
        logger.warn('Failed to fetch user patterns, degrading gracefully', { userId, error: patternsResult.reason });
      }
      if (analyticsResult.status === 'rejected') {
        logger.warn('Failed to fetch profile analytics, degrading gracefully', {
          userId,
          error: analyticsResult.reason,
        });
      }
      if (historicalResult.status === 'rejected') {
        logger.warn('Failed to fetch historical wellness data, degrading gracefully', {
          userId,
          error: historicalResult.reason,
        });
      }

      return {
        entries: entries as unknown as EntryData[],
        insights: insights as unknown as InsightEntry[],
        patterns: patterns as unknown as PatternEntry[],
        analytics: analytics as unknown as AnalyticsEntry[],
        historicalWellness,
        timeframe,
        dataPoints:
          entries.length +
          insights.length +
          (patternsResult.status === 'fulfilled' ? patterns.length : 0) +
          (analyticsResult.status === 'fulfilled' ? analytics.length : 0),
      };
    } catch (error) {
      logger.error('Error gathering wellness data: {}', { data0: error });
      throw error;
    }
  }

  private calculateWellnessMetrics(
    wellnessData: WellnessData,
    dimensions?: string[],
    depth: string = 'comprehensive'
  ): WellnessMetrics {
    const requestedDimensions = dimensions || [
      'emotional',
      'cognitive',
      'behavioral',
      'social',
      'physical',
      'spiritual',
    ];

    const calculators: Record<string, (data: WellnessData, depth: string) => WellnessDimension> = {
      emotional: calculateEmotionalWellness,
      cognitive: calculateCognitiveWellness,
      behavioral: calculateBehavioralWellness,
      social: calculateSocialWellness,
      physical: calculatePhysicalWellness,
      spiritual: calculateSpiritualWellness,
    };

    const metrics: Partial<WellnessMetrics> = {};

    for (const dimension of requestedDimensions) {
      const calculator = calculators[dimension];
      if (calculator) {
        metrics[dimension as keyof WellnessMetrics] = calculator(wellnessData, depth);
      }
    }

    return metrics as WellnessMetrics;
  }

  private async getHistoricalWellnessData(_userId: string, _beforeDate: Date) {
    return [];
  }

  private async recordWellnessCalculationEvent(
    request: CalculateUserWellnessScoreRequest,
    overallScore: number,
    metrics: WellnessMetrics
  ): Promise<void> {
    try {
      await this.analysisRepository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'wellness_score_calculated',
        eventData: {
          overallScore,
          analysisDepth: request.analysisDepth,
          timeframeDays: request.timeframe
            ? Math.ceil((request.timeframe.end.getTime() - request.timeframe.start.getTime()) / (1000 * 60 * 60 * 24))
            : 30,
          dimensionsAnalyzed: Object.keys(metrics),
          dimensionScores: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, value.score])),
          includeTrends: request.includeTrends,
          includeRecommendations: request.includeRecommendations,
          includeInsights: request.includeInsights,
        },
      });
    } catch (error) {
      logger.error('Failed to record wellness calculation event:', {
        error: serializeError(error),
      });
    }
  }
}
