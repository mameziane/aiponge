import { InsightRecord } from '@domains/profile';
import { PatternRecord, ProfileAnalyticsRecord } from '@domains/profile';
import { parseConfidence, parseStrength } from '../profile/highlight-types';
import { GoalRecommendation } from './UpdateUserGoalsFromInsightsUseCase';

export class GoalAnalysisService {
  extractGoalsFromInsights(insights: InsightRecord[]): GoalRecommendation[] {
    const goals: GoalRecommendation[] = [];

    const actionableInsights = insights.filter(
      insight => insight.actionable && parseConfidence(insight.confidence) > 0.7
    );

    actionableInsights.forEach(insight => {
      if (insight.type === 'recommendation' || insight.category === 'behavioral') {
        goals.push({
          title: this.generateGoalTitle(insight),
          description: this.generateGoalDescription(insight),
          category: this.mapInsightToGoalCategory(insight),
          priority: this.calculateGoalPriority(insight),
          confidence: parseConfidence(insight.confidence),
          reasoning: `Generated from high-confidence ${insight.type} insight about ${insight.category}`,
          sourceInsights: [{ insightId: insight.id, relevance: 1.0, contribution: 'Primary source' }],
          sourcePatterns: [],
          suggestedTimeline: this.suggestTimelineFromInsight(insight),
          estimatedDifficulty: this.estimateDifficultyFromInsight(insight),
          prerequisites: this.extractPrerequisites(insight),
          potentialObstacles: this.identifyObstacles(insight),
          successIndicators: this.defineSuccessIndicators(insight),
        });
      }
    });

    return goals;
  }

  extractGoalsFromPatterns(patterns: PatternRecord[]): GoalRecommendation[] {
    const goals: GoalRecommendation[] = [];

    const improvablePatterns = patterns.filter(
      pattern =>
        parseStrength(pattern.strength) > 0.6 &&
        (pattern.trend === 'decreasing' || pattern.patternName.includes('challenge'))
    );

    improvablePatterns.forEach(pattern => {
      const strength = parseStrength(pattern.strength);
      goals.push({
        title: `Improve ${pattern.patternName}`,
        description: `Address the ${pattern.patternName} pattern to enhance overall well-being`,
        category: this.mapPatternToGoalCategory(pattern.patternType),
        priority: strength > 0.8 ? 'high' : 'medium',
        confidence: strength,
        reasoning: `Generated from ${pattern.patternType} pattern with ${pattern.trend} trend`,
        sourceInsights: [],
        sourcePatterns: [
          { patternId: pattern.id, relevance: Number(pattern.strength || 0), contribution: 'Pattern identified' },
        ],
        suggestedTimeline: this.calculatePatternTimeline(pattern),
        estimatedDifficulty: (pattern.frequency || 0) > 10 ? 'high' : 'medium',
        prerequisites: [`Understanding of ${pattern.patternName} triggers`],
        potentialObstacles: pattern.triggerFactors || [],
        successIndicators: [`Reduction in ${pattern.patternName} frequency`, 'Improved pattern strength score'],
      });
    });

    return goals;
  }

  extractGoalsFromGrowthData(analytics: ProfileAnalyticsRecord[]): GoalRecommendation[] {
    const goals: GoalRecommendation[] = [];

    analytics.forEach(analytic => {
      const indicators = analytic.progressIndicators as Record<string, unknown> | null;
      const growthAreas = (indicators?.growthAreas as string[]) || [];

      if (growthAreas.length > 0) {
        growthAreas.forEach((area: string) => {
          goals.push({
            title: `Develop ${area}`,
            description: `Focus on developing ${area} based on analytics insights`,
            category: this.mapGrowthAreaToCategory(area),
            priority: 'medium',
            confidence: 0.75,
            reasoning: `Identified as growth area in ${analytic.analysisType} analysis`,
            sourceInsights: [],
            sourcePatterns: [],
            suggestedTimeline: '3 months',
            estimatedDifficulty: 'medium',
            prerequisites: ['Current skill assessment'],
            potentialObstacles: ['Time constraints', 'Learning curve'],
            successIndicators: [`Improvement in ${area} metrics`, 'Consistent practice'],
          });
        });
      }
    });

    return goals;
  }

  private generateGoalTitle(insight: InsightRecord): string {
    if (insight.type === 'recommendation') {
      return insight.title || 'Personal Development Goal';
    }
    return `Improve ${insight.category || 'personal'} based on insights`;
  }

  private generateGoalDescription(insight: InsightRecord): string {
    return typeof insight.content === 'string'
      ? insight.content
      : 'Develop this area based on your insights and patterns';
  }

  private mapInsightToGoalCategory(insight: InsightRecord): string {
    const categoryMap: Record<string, string> = {
      emotional: 'personal',
      cognitive: 'learning',
      behavioral: 'personal',
      social: 'relationships',
      wellness: 'health',
    };
    return categoryMap[insight.category || ''] || 'personal';
  }

  private calculateGoalPriority(insight: InsightRecord): string {
    const confidence = parseConfidence(insight.confidence);
    if (confidence > 0.9) return 'high';
    if (confidence > 0.7) return 'medium';
    return 'low';
  }

  private suggestTimelineFromInsight(insight: InsightRecord): string {
    if (insight.type === 'pattern') return '3 months';
    if (insight.actionable) return '1 month';
    return '2 months';
  }

  private estimateDifficultyFromInsight(insight: InsightRecord): 'low' | 'medium' | 'high' {
    const confidence = parseConfidence(insight.confidence);
    if (confidence > 0.8) return 'low';
    if (confidence > 0.6) return 'medium';
    return 'high';
  }

  private extractPrerequisites(_insight: InsightRecord): string[] {
    return ['Self-assessment', 'Understanding of current state'];
  }

  private identifyObstacles(_insight: InsightRecord): string[] {
    return ['Time constraints', 'Motivation fluctuations', 'External factors'];
  }

  private defineSuccessIndicators(_insight: InsightRecord): string[] {
    return ['Consistent progress tracking', 'Behavioral change evidence', 'Improved metrics'];
  }

  private mapPatternToGoalCategory(patternType: string): string {
    const categoryMap: Record<string, string> = {
      emotional: 'personal',
      behavioral: 'personal',
      cognitive: 'learning',
      temporal: 'personal',
    };
    return categoryMap[patternType] || 'personal';
  }

  private calculatePatternTimeline(pattern: PatternRecord): string {
    const strength = parseStrength(pattern.strength);
    if (strength > 0.8) return '2 months';
    if (strength > 0.6) return '3 months';
    return '4 months';
  }

  private mapGrowthAreaToCategory(area: string): string {
    if (area.includes('emotional')) return 'personal';
    if (area.includes('social')) return 'relationships';
    if (area.includes('cognitive')) return 'learning';
    return 'personal';
  }
}
