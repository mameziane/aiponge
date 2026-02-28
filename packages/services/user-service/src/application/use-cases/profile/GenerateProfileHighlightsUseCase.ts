/**
 * Generate Profile Highlights Use Case - Profile Service
 * Extracts key moments from user journey, identifies breakthrough insights, creates profile highlights reel
 */

import { IProfileRepository } from '@domains/profile';
import { IEntryRepository } from '@domains/profile';
import { IAnalysisRepository } from '@domains/profile';
import { ProfileError } from '@application/errors';
import { type ContentVisibility } from '@aiponge/shared-contracts';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';
import {
  UserHighlightData,
} from './highlight-types';
import { HighlightIdentificationService } from './HighlightIdentificationService';
import { HighlightScoringService } from './HighlightScoringService';
import { HighlightNarrativeService } from './HighlightNarrativeService';

const logger = getLogger('user-service-generateprofilehighlightsusecase');

export interface ProfileHighlight {
  id: string;
  userId: string;
  type:
    | 'breakthrough_insight'
    | 'milestone_achievement'
    | 'pattern_discovery'
    | 'growth_moment'
    | 'turning_point'
    | 'reflection_quality'
    | 'consistency_streak';
  title: string;
  description: string;
  significance: 'high' | 'medium' | 'low';
  category: 'emotional' | 'cognitive' | 'behavioral' | 'social' | 'spiritual' | 'creative' | 'wellness';
  date: Date;
  timeframe: {
    start: Date;
    end: Date;
  };
  relatedContent: {
    entryIds: string[];
    insightIds: string[];
    patternIds: string[];
    analyticsIds: string[];
  };
  metrics: {
    impactScore: number; // 0-100
    rarityScore: number; // How uncommon this type of highlight is
    growthContribution: number; // How much this contributed to overall growth
    qualityScore: number; // Quality of the underlying data
  };
  narrative: {
    summary: string;
    context: string;
    impact: string;
    futureImplications: string;
  };
  visualizations?: {
    chartType: 'timeline' | 'progress' | 'comparison' | 'network' | 'heatmap';
    data: Record<string, unknown>;
    configuration: Record<string, unknown>;
  }[];
  tags: string[];
  visibility: ContentVisibility;
  isFeatured: boolean;
  createdAt: Date;
}

export interface HighlightCollection {
  id: string;
  userId: string;
  title: string;
  description: string;
  highlights: ProfileHighlight[];
  timeframe: {
    start: Date;
    end: Date;
  };
  collectionType: 'journey_overview' | 'year_in_review' | 'growth_story' | 'breakthrough_moments' | 'custom';
  metadata: {
    totalHighlights: number;
    significanceDistribution: Record<string, number>;
    categoryDistribution: Record<string, number>;
    averageImpactScore: number;
    timelineLength: number; // days
  };
  narrativeSummary: string;
  createdAt: Date;
}

export interface GenerateProfileHighlightsRequest {
  userId: string;
  timeframe?: {
    start: Date;
    end: Date;
  };
  highlightTypes?: string[];
  categories?: string[];
  maxHighlights?: number;
  minSignificance?: 'low' | 'medium' | 'high';
  includeVisualizations?: boolean;
  collectionType?: 'journey_overview' | 'year_in_review' | 'growth_story' | 'breakthrough_moments' | 'custom';
  customFilters?: {
    minImpactScore?: number;
    minRarityScore?: number;
    requireNarrative?: boolean;
    includeDrafts?: boolean;
  };
  outputFormat?: 'detailed' | 'summary' | 'narrative_focused';
}

export interface GenerateProfileHighlightsResponse {
  collection: HighlightCollection;
  highlights: ProfileHighlight[];
  analytics: {
    totalCandidates: number;
    selectedHighlights: number;
    significanceBreakdown: Record<string, number>;
    timelineAnalysis: {
      averageTimeBetweenHighlights: number; // days
      mostActiveMonth: string;
      highlightDensity: number; // highlights per month
    };
    growthTrajectory: {
      overallTrend: 'improving' | 'stable' | 'declining';
      accelerationPoints: Date[];
      plateauPeriods: Array<{ start: Date; end: Date }>;
    };
  };
  recommendations: {
    nextHighlightOpportunities: string[];
    improvementAreas: string[];
    celebrationMoments: string[];
  };
  generatedAt: Date;
}

export class GenerateProfileHighlightsUseCase {
  private readonly identificationService: HighlightIdentificationService;
  private readonly scoringService: HighlightScoringService;
  private readonly narrativeService: HighlightNarrativeService;

  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository,
    private readonly analysisRepository: IAnalysisRepository
  ) {
    this.identificationService = new HighlightIdentificationService();
    this.scoringService = new HighlightScoringService();
    this.narrativeService = new HighlightNarrativeService();
  }

  async execute(request: GenerateProfileHighlightsRequest): Promise<GenerateProfileHighlightsResponse> {
    try {
      logger.info('🌟 Generating profile highlights for user: {}', { data0: request.userId });

      this.validateRequest(request);

      const timeframe = request.timeframe || {
        start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const userData = await this.gatherUserDataForHighlights(request.userId, timeframe);

      const candidates = this.identificationService.identifyAllCandidates(
        userData,
        request.highlightTypes,
        request.categories
      );

      const scoredCandidates = this.scoringService.scoreHighlightCandidates(candidates, userData);

      const filteredHighlights = this.scoringService.filterHighlights(
        scoredCandidates,
        request.minSignificance || 'low',
        request.customFilters
      );

      const selectedHighlights = this.scoringService.selectTopHighlights(
        filteredHighlights,
        request.maxHighlights || 10
      );

      const highlightsWithNarratives = await this.narrativeService.generateHighlightNarratives(
        selectedHighlights,
        userData,
        request.outputFormat || 'detailed'
      );

      if (request.includeVisualizations) {
        await this.narrativeService.addVisualizationsToHighlights(highlightsWithNarratives, userData);
      }

      const collection = this.narrativeService.createHighlightCollection(
        request.userId,
        highlightsWithNarratives,
        timeframe,
        request.collectionType || 'journey_overview'
      );

      const analytics = this.narrativeService.generateHighlightAnalytics(
        candidates,
        highlightsWithNarratives,
        userData,
        timeframe
      );

      const recommendations = this.narrativeService.generateRecommendations(
        highlightsWithNarratives,
        userData,
        analytics
      );

      await this.recordHighlightGenerationEvent(request, collection, analytics);

      logger.info('Successfully generated {} highlights for user: {}', {
        data0: highlightsWithNarratives.length,
        data1: request.userId,
      });

      return {
        collection,
        highlights: highlightsWithNarratives,
        analytics,
        recommendations,
        generatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      logger.error('Failed to generate profile highlights: {}', { data0: error });
      throw ProfileError.internalError(
        'Failed to generate profile highlights',
        error instanceof Error ? error : undefined
      );
    }
  }

  private validateRequest(request: GenerateProfileHighlightsRequest): void {
    if (!request.userId?.trim()) {
      throw ProfileError.userIdRequired();
    }

    if (request.maxHighlights && (request.maxHighlights < 1 || request.maxHighlights > 50)) {
      throw ProfileError.validationError('maxHighlights', 'Must be between 1 and 50');
    }

    if (request.timeframe) {
      const { start, end } = request.timeframe;
      if (start >= end) {
        throw ProfileError.invalidDateRange();
      }
    }

    if (request.minSignificance && !['low', 'medium', 'high'].includes(request.minSignificance)) {
      throw ProfileError.validationError('minSignificance', 'Invalid minimum significance level');
    }
  }

  private async gatherUserDataForHighlights(
    userId: string,
    timeframe: { start: Date; end: Date }
  ): Promise<UserHighlightData> {
    try {
      const entries = await this.entryRepository.getEntriesByUser(userId, {
        dateFrom: timeframe.start,
        dateTo: timeframe.end,
        isArchived: false,
      });

      const insights = await this.entryRepository.getInsightsByUser(userId, {
        dateFrom: timeframe.start,
        dateTo: timeframe.end,
      });

      const patterns = await this.analysisRepository.getUserPatterns(userId, {
        dateFrom: timeframe.start,
        dateTo: timeframe.end,
      });

      const analytics = await this.analysisRepository.getProfileAnalytics(userId, {
        validFrom: timeframe.start,
        validTo: timeframe.end,
      });

      const profile = await this.profileRepository.getProfile(userId);

      return {
        entries,
        insights,
        patterns,
        analytics,
        profile,
        timeframe,
      };
    } catch (error) {
      logger.error('Error gathering user data for highlights: {}', { data0: error });
      throw error;
    }
  }

  private async recordHighlightGenerationEvent(
    request: GenerateProfileHighlightsRequest,
    collection: HighlightCollection,
    analytics: { totalCandidates: number; selectedHighlights: number }
  ): Promise<void> {
    try {
      await this.analysisRepository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'profile_highlights_generated',
        eventData: {
          collectionId: collection.id,
          collectionType: collection.collectionType,
          highlightCount: collection.highlights.length,
          timeframeDays: collection.metadata.timelineLength,
          significanceDistribution: collection.metadata.significanceDistribution,
          averageImpactScore: collection.metadata.averageImpactScore,
          candidatesAnalyzed: analytics.totalCandidates,
          includeVisualizations: request.includeVisualizations,
          outputFormat: request.outputFormat,
        },
      });
    } catch (error) {
      logger.error('Failed to record highlight generation event:', {
        error: serializeError(error),
      });
    }
  }
}
