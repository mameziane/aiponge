import { InsightRecord } from '@domains/profile';
import { GOAL_STATUS } from '@aiponge/shared-contracts';
import { IAnalysisRepository } from '@domains/profile';
import { getLogger } from '@config/service-urls';
import { GoalAnalysisData, parseConfidence } from '../profile/highlight-types';
import { serializeError } from '@aiponge/platform-core';
import {
  UserGoal,
  GoalProgressUpdate,
  GoalRecommendation,
  UpdateUserGoalsFromInsightsRequest,
} from './UpdateUserGoalsFromInsightsUseCase';

const logger = getLogger('user-service-goalrecommendationservice');

export class GoalRecommendationService {
  constructor(private readonly analysisRepository: IAnalysisRepository) {}

  async createGoalsFromRecommendations(
    userId: string,
    recommendations: GoalRecommendation[],
    requireValidation: boolean
  ): Promise<UserGoal[]> {
    const goals: UserGoal[] = [];

    for (const rec of recommendations) {
      const goal: UserGoal = {
        id: this.generateGoalId(userId),
        userId,
        title: rec.title,
        description: rec.description,
        category: rec.category as UserGoal['category'],
        priority: rec.priority as UserGoal['priority'],
        status: requireValidation ? 'draft' : 'active',
        createdFrom: 'insight',
        sourceInsightIds: rec.sourceInsights.map(si => si.insightId),
        sourcePatternIds: rec.sourcePatterns.map(sp => sp.patternId),
        progress: {
          currentLevel: 0,
          milestones: this.generateMilestones(rec),
          lastUpdated: new Date(),
        },
        metrics: {
          successCriteria: rec.successIndicators,
          measurableOutcomes: rec.successIndicators.slice(0, 3),
          keyPerformanceIndicators: ['Weekly check-in', 'Progress tracking'],
        },
        actionItems: this.generateInitialActionItems(rec),
        supportingResources: this.generateSupportingResources(rec),
        relatedGoals: [],
        tags: this.generateGoalTags(rec),
        metadata: {
          confidence: rec.confidence,
          aiGenerated: true,
          userValidated: !requireValidation,
          validatedAt: requireValidation ? undefined : new Date(),
          lastReviewed: new Date(),
          reviewFrequency: 'weekly',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      goals.push(goal);
    }

    return goals;
  }

  async updateExistingGoals(
    existingGoals: UserGoal[],
    analysisData: GoalAnalysisData,
    shouldUpdate: boolean
  ): Promise<{ updatedGoals: UserGoal[]; progressUpdates: GoalProgressUpdate[] }> {
    const updatedGoals: UserGoal[] = [];
    const progressUpdates: GoalProgressUpdate[] = [];

    if (!shouldUpdate) {
      return { updatedGoals, progressUpdates };
    }

    for (const goal of existingGoals) {
      try {
        const relevantInsights = this.findRelevantInsights(goal, analysisData.insights);
        const progressDelta = this.calculateProgressFromInsights(goal, relevantInsights);

        if (progressDelta > 0) {
          const updatedGoal = {
            ...goal,
            progress: {
              ...goal.progress,
              currentLevel: Math.min(100, goal.progress.currentLevel + progressDelta),
              lastUpdated: new Date(),
            },
            updatedAt: new Date(),
          };

          updatedGoals.push(updatedGoal);
          progressUpdates.push({
            goalId: goal.id,
            progressDelta,
            completedMilestones: [],
            completedActionItems: [],
            evidence: relevantInsights.map(insight => ({
              type: 'insight' as const,
              reference: insight.id,
              description: insight.title || 'Relevant insight',
            })),
          });
        }

        const newActionItems = this.generateActionItemsFromInsights(goal, relevantInsights);
        if (newActionItems.length > 0) {
          const goalWithNewActions = updatedGoals.find(g => g.id === goal.id) || goal;
          goalWithNewActions.actionItems.push(...newActionItems);
          if (!updatedGoals.some(g => g.id === goal.id)) {
            updatedGoals.push(goalWithNewActions);
          }
        }
      } catch (error) {
        logger.error('Error updating goal {}: {}', { data0: goal.id, data1: error });
      }
    }

    return { updatedGoals, progressUpdates };
  }

  async retireCompletedGoals(goals: UserGoal[]): Promise<UserGoal[]> {
    return goals
      .filter(goal => goal.progress.currentLevel >= 100 && goal.status === GOAL_STATUS.ACTIVE)
      .map(goal => ({
        ...goal,
        status: 'completed' as const,
        updatedAt: new Date(),
      }));
  }

  async consolidateSimilarGoals(goals: UserGoal[]): Promise<void> {
    const groupedGoals = this.groupSimilarGoals(goals);

    groupedGoals.forEach(group => {
      if (group.length > 1) {
        logger.info('Found {} similar goals that could be consolidated', { data0: group.length });
      }
    });
  }

  async generateActionPlans(goals: UserGoal[], analysisData: GoalAnalysisData): Promise<void> {
    for (const goal of goals) {
      if (goal.actionItems.length === 0) {
        goal.actionItems = this.generateComprehensiveActionPlan(goal, analysisData);
      }
    }
  }

  calculateGoalInsights(
    goals: UserGoal[],
    _analysisData: GoalAnalysisData,
    _recommendations: GoalRecommendation[]
  ) {
    const activeGoals = goals.filter(g => g.status === GOAL_STATUS.ACTIVE);
    const avgProgress =
      activeGoals.length > 0
        ? activeGoals.reduce((sum, g) => sum + g.progress.currentLevel, 0) / activeGoals.length / 100
        : 0;

    return {
      goalAlignment: Math.min(1.0, avgProgress + 0.2),
      focusRecommendations: [
        'Focus on high-priority goals first',
        'Ensure action items are specific and time-bound',
        'Regular review and adjustment of goals',
      ],
      riskFactors: ['Too many active goals might reduce focus', 'Some goals lack specific action plans'],
      opportunities: [
        'Strong insight generation suggests good goal achievement potential',
        'Consistent reflection practice supports goal tracking',
      ],
    };
  }

  async saveGoalChanges(
    userId: string,
    newGoals: UserGoal[],
    updatedGoals: UserGoal[],
    retiredGoals: UserGoal[]
  ): Promise<void> {
    logger.info('💾 Saving goal changes for user {}: {} new, {} updated, {} retired', {
      data0: userId,
      data1: newGoals.length,
      data2: updatedGoals.length,
      data3: retiredGoals.length,
    });
  }

  calculateNextReviewDate(newGoals: UserGoal[], updatedGoals: UserGoal[]): Date {
    const allGoals = [...newGoals, ...updatedGoals];
    const hasWeeklyReview = allGoals.some(g => g.metadata.reviewFrequency === 'weekly');

    if (hasWeeklyReview) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  enhanceComprehensiveRecommendations(
    recommendations: GoalRecommendation[],
    _analysisData: GoalAnalysisData
  ): GoalRecommendation[] {
    return recommendations.map(rec => ({
      ...rec,
      description: `${rec.description} This comprehensive goal addresses multiple aspects of your development based on detailed analysis of your entries, insights, and patterns.`,
      prerequisites: [...rec.prerequisites, 'Commitment to long-term development', 'Regular self-reflection practice'],
    }));
  }

  enhanceFocusedRecommendations(
    recommendations: GoalRecommendation[],
    _analysisData: GoalAnalysisData
  ): GoalRecommendation[] {
    return recommendations
      .filter(rec => rec.priority === 'high' || rec.estimatedDifficulty === 'low')
      .slice(0, 3)
      .map(rec => ({
        ...rec,
        description: `${rec.description} This focused goal is designed for immediate impact and quick wins.`,
      }));
  }

  enhanceMaintenanceRecommendations(
    recommendations: GoalRecommendation[],
    _analysisData: GoalAnalysisData
  ): GoalRecommendation[] {
    return recommendations
      .filter(rec => rec.title.toLowerCase().includes('maintain') || rec.title.toLowerCase().includes('continue'))
      .map(rec => ({
        ...rec,
        description: `${rec.description} This maintenance goal helps sustain and optimize your current progress.`,
        estimatedDifficulty: 'low' as const,
      }));
  }

  async recordGoalUpdateEvent(
    request: UpdateUserGoalsFromInsightsRequest,
    newGoals: UserGoal[],
    updatedGoals: UserGoal[],
    recommendations: GoalRecommendation[]
  ): Promise<void> {
    try {
      await this.analysisRepository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'goals_updated_from_insights',
        eventData: {
          goalGenerationMode: request.goalGenerationMode,
          newGoalsCount: newGoals.length,
          updatedGoalsCount: updatedGoals.length,
          recommendationsCount: recommendations.length,
          averageConfidence:
            recommendations.length > 0
              ? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
              : 0,
          categories: Array.from(new Set(newGoals.map(g => g.category))),
          timeframeAnalyzed: request.analysisTimeframe
            ? {
                days: Math.ceil(
                  (request.analysisTimeframe.end.getTime() - request.analysisTimeframe.start.getTime()) /
                    (1000 * 60 * 60 * 24)
                ),
              }
            : null,
        },
      });
    } catch (error) {
      logger.error('Failed to record goal update event:', {
        error: serializeError(error),
      });
    }
  }

  private generateGoalId(userId: string): string {
    const { randomUUID } = require('crypto');
    return `goal_${userId}_${Date.now()}_${randomUUID()}`;
  }

  private generateMilestones(rec: GoalRecommendation) {
    return [
      {
        id: 'milestone_1',
        title: 'Initial assessment',
        description: 'Complete baseline assessment and planning',
        targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isCompleted: false,
      },
      {
        id: 'milestone_2',
        title: 'Mid-point review',
        description: 'Evaluate progress and adjust approach',
        targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isCompleted: false,
      },
    ];
  }

  private generateInitialActionItems(rec: GoalRecommendation) {
    return [
      {
        id: 'action_1',
        title: 'Create action plan',
        description: 'Develop detailed action plan for achieving this goal',
        priority: 'high' as const,
        estimatedEffort: '1hour',
        category: 'planning',
        isCompleted: false,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    ];
  }

  private generateSupportingResources(rec: GoalRecommendation) {
    return [
      {
        type: 'article' as const,
        title: `Guide to ${rec.category} development`,
        description: 'Comprehensive guide for this development area',
        priority: 'recommended' as const,
      },
    ];
  }

  private generateGoalTags(rec: GoalRecommendation): string[] {
    return [rec.category, 'ai-generated', 'insight-based'];
  }

  private findRelevantInsights(goal: UserGoal, insights: InsightRecord[]): InsightRecord[] {
    return insights.filter(
      insight =>
        goal.sourceInsightIds.includes(insight.id) ||
        insight.category === goal.category ||
        goal.tags.some(tag => insight.themes?.includes(tag))
    );
  }

  private calculateProgressFromInsights(goal: UserGoal, insights: InsightRecord[]): number {
    if (insights.length === 0) return 0;

    const avgConfidence = insights.reduce((sum, i) => sum + parseConfidence(i.confidence), 0) / insights.length;
    return Math.min(20, Math.round(avgConfidence * 15));
  }

  private generateActionItemsFromInsights(goal: UserGoal, insights: InsightRecord[]) {
    const actionItems: Array<{
      id: string;
      title: string;
      description: string;
      priority: 'low' | 'medium' | 'high';
      estimatedEffort: string;
      category: string;
      isCompleted: boolean;
      completedAt?: Date;
      dueDate?: Date;
    }> = [];

    insights.forEach(insight => {
      if (insight.actionable && insight.type === 'recommendation') {
        actionItems.push({
          id: `action_insight_${insight.id}`,
          title: `Act on: ${insight.title || 'Insight recommendation'}`,
          description: typeof insight.content === 'string' ? insight.content : 'Follow insight recommendation',
          priority: 'medium',
          estimatedEffort: '30min',
          category: 'insight-action',
          isCompleted: false,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    });

    return actionItems;
  }

  private groupSimilarGoals(goals: UserGoal[]): UserGoal[][] {
    const groups: UserGoal[][] = [];

    goals.forEach(goal => {
      const similarGroup = groups.find(
        group => group[0].category === goal.category && this.calculateTitleSimilarity(group[0].title, goal.title) > 0.6
      );

      if (similarGroup) {
        similarGroup.push(goal);
      } else {
        groups.push([goal]);
      }
    });

    return groups;
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = title1.toLowerCase().split(' ');
    const words2 = title2.toLowerCase().split(' ');

    const intersection = words1.filter(word => words2.includes(word));
    const union = Array.from(new Set([...words1, ...words2]));

    return intersection.length / union.length;
  }

  private generateComprehensiveActionPlan(goal: UserGoal, _analysisData: GoalAnalysisData) {
    return [
      {
        id: `action_plan_${goal.id}_1`,
        title: 'Define specific objectives',
        description: 'Break down the goal into specific, measurable objectives',
        priority: 'high' as const,
        estimatedEffort: '1hour',
        category: 'planning',
        isCompleted: false,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: `action_plan_${goal.id}_2`,
        title: 'Identify resources',
        description: 'Research and gather necessary resources and tools',
        priority: 'medium' as const,
        estimatedEffort: '2hours',
        category: 'preparation',
        isCompleted: false,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    ];
  }
}
