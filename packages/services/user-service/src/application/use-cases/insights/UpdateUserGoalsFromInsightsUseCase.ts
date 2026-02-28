/**
 * Update User Goals From Insights Use Case - Profile Service
 * Derives user goals from insights, updates goal recommendations, tracks goal progression
 */

import { IProfileRepository } from '@domains/profile';
import { IEntryRepository, InsightRecord } from '@domains/profile';
import { IAnalysisRepository } from '@domains/profile';
import { getLogger } from '@config/service-urls';
import { GoalAnalysisData } from '../profile/highlight-types';
import { InsightsError } from '@application/errors';
import { GoalAnalysisService } from './GoalAnalysisService';
import { GoalRecommendationService } from './GoalRecommendationService';

const logger = getLogger('user-service-updateusergoalsfrominsightsusecase');

export interface UserGoal {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: 'personal' | 'professional' | 'health' | 'relationships' | 'learning' | 'spiritual' | 'creative';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'active' | 'paused' | 'completed' | 'abandoned';
  targetDate?: Date;
  createdFrom: 'insight' | 'pattern' | 'recommendation' | 'user_input' | 'ai_suggestion';
  sourceInsightIds: string[];
  sourcePatternIds: string[];
  progress: {
    currentLevel: number; // 0-100
    milestones: Array<{
      id: string;
      title: string;
      description: string;
      targetDate?: Date;
      completedAt?: Date;
      isCompleted: boolean;
    }>;
    lastUpdated: Date;
  };
  metrics: {
    successCriteria: string[];
    measurableOutcomes: string[];
    keyPerformanceIndicators: string[];
  };
  actionItems: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    estimatedEffort: string; // '5min', '30min', '1hour', '1day', '1week'
    category: string;
    isCompleted: boolean;
    completedAt?: Date;
    dueDate?: Date;
  }>;
  supportingResources: Array<{
    type: 'article' | 'book' | 'course' | 'video' | 'tool' | 'person';
    title: string;
    description?: string;
    url?: string;
    priority: 'recommended' | 'helpful' | 'optional';
  }>;
  relatedGoals: string[];
  tags: string[];
  metadata: {
    confidence: number; // How confident we are this is a good goal
    aiGenerated: boolean;
    userValidated: boolean;
    validatedAt?: Date;
    lastReviewed: Date;
    reviewFrequency: 'weekly' | 'monthly' | 'quarterly';
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalProgressUpdate {
  goalId: string;
  progressDelta: number; // Change in progress percentage
  completedMilestones: string[];
  completedActionItems: string[];
  notes?: string;
  evidence?: Array<{
    type: 'entry' | 'insight' | 'external';
    reference: string;
    description: string;
  }>;
}

export interface UpdateUserGoalsFromInsightsRequest {
  userId: string;
  analysisTimeframe?: {
    start: Date;
    end: Date;
  };
  goalGenerationMode: 'comprehensive' | 'focused' | 'maintenance';
  includeExistingGoals?: boolean;
  goalCategories?: string[];
  maxNewGoals?: number;
  confidenceThreshold?: number; // Minimum confidence for auto-generated goals
  requireUserValidation?: boolean;
  options?: {
    updateExistingGoals?: boolean;
    retireCompletedGoals?: boolean;
    consolidateSimilarGoals?: boolean;
    generateActionPlans?: boolean;
  };
}

export interface GoalRecommendation {
  title: string;
  description: string;
  category: string;
  priority: string;
  confidence: number;
  reasoning: string;
  sourceInsights: Array<{
    insightId: string;
    relevance: number;
    contribution: string;
  }>;
  sourcePatterns: Array<{
    patternId: string;
    relevance: number;
    contribution: string;
  }>;
  suggestedTimeline: string;
  estimatedDifficulty: 'low' | 'medium' | 'high';
  prerequisites: string[];
  potentialObstacles: string[];
  successIndicators: string[];
}

export interface UpdateUserGoalsFromInsightsResponse {
  userId: string;
  processedAt: Date;
  summary: {
    existingGoals: number;
    newGoalsGenerated: number;
    goalsUpdated: number;
    goalsRetired: number;
    goalProgress: Array<{
      goalId: string;
      previousProgress: number;
      newProgress: number;
      progressDelta: number;
    }>;
  };
  newGoals: UserGoal[];
  updatedGoals: UserGoal[];
  recommendations: GoalRecommendation[];
  progressUpdates: GoalProgressUpdate[];
  insights: {
    goalAlignment: number; // How well current goals align with insights
    focusRecommendations: string[];
    riskFactors: string[];
    opportunities: string[];
  };
  nextReviewDate: Date;
}

export class UpdateUserGoalsFromInsightsUseCase {
  private readonly goalAnalysisService: GoalAnalysisService;
  private readonly goalRecommendationService: GoalRecommendationService;

  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository,
    private readonly analysisRepository: IAnalysisRepository
  ) {
    this.goalAnalysisService = new GoalAnalysisService();
    this.goalRecommendationService = new GoalRecommendationService(analysisRepository);
  }

  async execute(request: UpdateUserGoalsFromInsightsRequest): Promise<UpdateUserGoalsFromInsightsResponse> {
    try {
      logger.info('Updating user goals from insights for user: {}', { data0: request.userId });

      this.validateRequest(request);

      const timeframe = request.analysisTimeframe || {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const existingGoals = request.includeExistingGoals ? await this.getExistingGoals(request.userId) : [];

      const analysisData = await this.gatherAnalysisData(request.userId, timeframe, request.goalCategories);

      const recommendations = await this.generateGoalRecommendations(
        analysisData,
        request.goalGenerationMode,
        request.confidenceThreshold || 0.7,
        request.maxNewGoals || 5
      );

      const newGoals = await this.goalRecommendationService.createGoalsFromRecommendations(
        request.userId,
        recommendations,
        request.requireUserValidation || false
      );

      const { updatedGoals, progressUpdates } = await this.goalRecommendationService.updateExistingGoals(
        existingGoals,
        analysisData,
        request.options?.updateExistingGoals || true
      );

      const retiredGoals = request.options?.retireCompletedGoals
        ? await this.goalRecommendationService.retireCompletedGoals(existingGoals)
        : [];

      if (request.options?.consolidateSimilarGoals) {
        await this.goalRecommendationService.consolidateSimilarGoals([...existingGoals, ...newGoals]);
      }

      if (request.options?.generateActionPlans) {
        await this.goalRecommendationService.generateActionPlans(newGoals, analysisData);
      }

      const goalInsights = this.goalRecommendationService.calculateGoalInsights(
        [...existingGoals, ...newGoals],
        analysisData,
        recommendations
      );

      await this.goalRecommendationService.saveGoalChanges(request.userId, newGoals, updatedGoals, retiredGoals);

      await this.goalRecommendationService.recordGoalUpdateEvent(request, newGoals, updatedGoals, recommendations);

      const nextReviewDate = this.goalRecommendationService.calculateNextReviewDate(newGoals, updatedGoals);

      logger.info('Successfully updated goals for user: {}', { data0: request.userId });

      return {
        userId: request.userId,
        processedAt: new Date(),
        summary: {
          existingGoals: existingGoals.length,
          newGoalsGenerated: newGoals.length,
          goalsUpdated: updatedGoals.length,
          goalsRetired: retiredGoals.length,
          goalProgress: progressUpdates.map(pu => ({
            goalId: pu.goalId,
            previousProgress: 0,
            newProgress: pu.progressDelta + 0,
            progressDelta: pu.progressDelta,
          })),
        },
        newGoals,
        updatedGoals,
        recommendations: recommendations.filter(r => r.confidence >= (request.confidenceThreshold || 0.7)),
        progressUpdates,
        insights: goalInsights,
        nextReviewDate,
      };
    } catch (error) {
      logger.error('Failed to update user goals from insights: {}', { data0: error });
      if (error instanceof InsightsError) {
        throw error;
      }
      throw InsightsError.internalError('Failed to update user goals', error instanceof Error ? error : undefined);
    }
  }

  private validateRequest(request: UpdateUserGoalsFromInsightsRequest): void {
    if (!request.userId?.trim()) {
      throw InsightsError.userIdRequired();
    }

    if (!['comprehensive', 'focused', 'maintenance'].includes(request.goalGenerationMode)) {
      throw InsightsError.validationError('goalGenerationMode', 'Invalid goal generation mode');
    }

    if (request.maxNewGoals && (request.maxNewGoals < 1 || request.maxNewGoals > 20)) {
      throw InsightsError.validationError('maxNewGoals', 'Max new goals must be between 1 and 20');
    }

    if (request.confidenceThreshold && (request.confidenceThreshold < 0 || request.confidenceThreshold > 1)) {
      throw InsightsError.validationError('confidenceThreshold', 'Confidence threshold must be between 0 and 1');
    }

    if (request.analysisTimeframe) {
      const { start, end } = request.analysisTimeframe;
      if (start >= end) {
        throw InsightsError.invalidDateRange(start, end);
      }
    }
  }

  private async getExistingGoals(userId: string): Promise<UserGoal[]> {
    return [
      {
        id: 'goal_1',
        userId,
        title: 'Improve emotional awareness',
        description: 'Develop better understanding of emotional patterns and triggers',
        category: 'personal',
        priority: 'high',
        status: 'active',
        createdFrom: 'insight',
        sourceInsightIds: ['insight_1'],
        sourcePatternIds: ['pattern_1'],
        progress: {
          currentLevel: 65,
          milestones: [
            {
              id: 'milestone_1',
              title: 'Complete emotional patterns analysis',
              description: 'Analyze emotional patterns from entries',
              isCompleted: true,
              completedAt: new Date(),
            },
          ],
          lastUpdated: new Date(),
        },
        metrics: {
          successCriteria: ['Identify emotional triggers', 'Develop coping strategies'],
          measurableOutcomes: ['95% emotion recognition accuracy'],
          keyPerformanceIndicators: ['Weekly emotional check-ins'],
        },
        actionItems: [],
        supportingResources: [],
        relatedGoals: [],
        tags: ['emotional-intelligence', 'self-awareness'],
        metadata: {
          confidence: 0.9,
          aiGenerated: true,
          userValidated: true,
          validatedAt: new Date(),
          lastReviewed: new Date(),
          reviewFrequency: 'weekly',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }

  private async gatherAnalysisData(userId: string, timeframe: { start: Date; end: Date }, categories?: string[]) {
    try {
      const insights = await this.entryRepository.getInsightsByUser(userId, {
        dateFrom: timeframe.start,
        dateTo: timeframe.end,
        minConfidence: 0.6,
      });

      const patterns = await this.analysisRepository.getUserPatterns(userId, {
        dateFrom: timeframe.start,
        dateTo: timeframe.end,
        isActive: true,
      });

      const entries = await this.entryRepository.getEntriesByUser(userId, {
        dateFrom: timeframe.start,
        dateTo: timeframe.end,
        isArchived: false,
      });

      const analytics = await this.analysisRepository.getProfileAnalytics(userId, {
        validFrom: timeframe.start,
        validTo: timeframe.end,
      });

      return {
        insights,
        patterns,
        entries,
        analytics,
        timeframe,
      };
    } catch (error) {
      logger.error('Error gathering analysis data: {}', { data0: error });
      throw error;
    }
  }

  private async generateGoalRecommendations(
    analysisData: GoalAnalysisData,
    mode: string,
    confidenceThreshold: number,
    maxGoals: number
  ): Promise<GoalRecommendation[]> {
    const recommendations: GoalRecommendation[] = [];

    try {
      const insightBasedGoals = this.goalAnalysisService.extractGoalsFromInsights(analysisData.insights);
      recommendations.push(...insightBasedGoals);

      const patternBasedGoals = this.goalAnalysisService.extractGoalsFromPatterns(analysisData.patterns);
      recommendations.push(...patternBasedGoals);

      const growthBasedGoals = this.goalAnalysisService.extractGoalsFromGrowthData(analysisData.analytics);
      recommendations.push(...growthBasedGoals);

      const filteredRecommendations = recommendations
        .filter(rec => rec.confidence >= confidenceThreshold)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxGoals);

      if (mode === 'comprehensive') {
        return this.goalRecommendationService.enhanceComprehensiveRecommendations(filteredRecommendations, analysisData);
      } else if (mode === 'focused') {
        return this.goalRecommendationService.enhanceFocusedRecommendations(filteredRecommendations, analysisData);
      } else {
        return this.goalRecommendationService.enhanceMaintenanceRecommendations(filteredRecommendations, analysisData);
      }
    } catch (error) {
      logger.error('Error generating goal recommendations: {}', { data0: error });
      return [];
    }
  }
}
