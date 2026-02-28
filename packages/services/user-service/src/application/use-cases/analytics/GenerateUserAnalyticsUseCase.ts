import { AnalysisRepository } from '@infrastructure/repositories';
import { getLogger } from '@config/service-urls';
import { AnalyticsError } from '@application/errors';

const logger = getLogger('generate-user-analytics');

// Internal types for analytics data
interface EntryData {
  id: string;
  userId: string;
  content: string;
  type?: string;
  sentiment?: string | null;
  createdAt: Date | string;
}

interface InsightEntry {
  id: string;
  userId: string;
  type: string;
  confidence?: string | number | null;
  actionable?: boolean | null;
  createdAt: Date | string;
}

interface AnalyticsData {
  entryActivity: {
    totalEntries: number;
    entriesPerDay: number;
    streakDays: number;
    mostActiveDay: string;
    entryTypes: Record<string, number>;
  };
  emotionalWellbeing: {
    overallSentiment: string;
    emotionalVariability: number;
    positiveEntries: number;
    challengingEntries: number;
    moodTrends: Array<{ date: string; mood: string; count: number }>;
  };
  cognitivePatterns: {
    clarityLevels: Record<string, number>;
    averageEntryComplexity: number;
    topThemes: Array<{ theme: string; count: number }>;
    reasoningPatterns: string[];
  };
  growthIndicators: {
    selfAwarenessScore: number;
    reflectionDepth: number;
    insightGeneration: number;
    actionableInsights: number;
  };
}

interface PeriodComparison {
  entryActivity: { totalEntries: number; entriesPerDay: number };
  overallScore: number;
}

interface GeneratedInsight {
  type: string;
  title: string;
  description: string;
  significance: 'low' | 'medium' | 'high';
  actionable: boolean;
}

export interface GenerateUserAnalyticsRequest {
  userId: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  analyticsDepth: 'summary' | 'detailed' | 'comprehensive';
  includeComparisons?: boolean;
  includePredictions?: boolean;
}

export interface UserAnalyticsReport {
  userId: string;
  reportPeriod: {
    start: Date;
    end: Date;
  };
  analytics: {
    entryActivity: {
      totalEntries: number;
      entriesPerDay: number;
      streakDays: number;
      mostActiveDay: string;
      entryTypes: Record<string, number>;
    };
    emotionalWellbeing: {
      overallSentiment: string;
      emotionalVariability: number;
      positiveEntries: number;
      challengingEntries: number;
      moodTrends: Array<{ date: string; mood: string; count: number }>;
    };
    cognitivePatterns: {
      clarityLevels: Record<string, number>;
      averageEntryComplexity: number;
      topThemes: Array<{ theme: string; count: number }>;
      reasoningPatterns: string[];
    };
    growthIndicators: {
      selfAwarenessScore: number;
      reflectionDepth: number;
      insightGeneration: number;
      actionableInsights: number;
    };
  };
  insights: Array<{
    type: string;
    title: string;
    description: string;
    significance: 'low' | 'medium' | 'high';
    actionable: boolean;
  }>;
  comparisons?: {
    previousPeriod?: PeriodComparison;
    userAverage?: PeriodComparison;
  };
  predictions?: {
    nextWeekOutlook: string;
    recommendedActions: string[];
    riskFactors: string[];
  };
  overallScore: number;
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
    recommendations: string[];
  };
  growthOpportunities: string[];
  generatedAt: Date;
}

export class GenerateUserAnalyticsUseCase {
  constructor(private repository: AnalysisRepository) {}

  async execute(request: GenerateUserAnalyticsRequest): Promise<UserAnalyticsReport> {
    try {
      // Validate request
      this.validateRequest(request);

      // Set default time range if not provided (last 30 days)
      const timeRange = request.timeRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      logger.warn('Generating user analytics report', {
        module: 'generate_user_analytics',
        operation: 'execute',
        userId: request.userId,
        analyticsDepth: request.analyticsDepth,
        phase: 'analytics_generation_started',
      });

      // Get or create user analytics
      const analytics = await this.generateUserAnalyticsData(request.userId, timeRange, request.analyticsDepth);

      // Generate insights based on analytics depth
      const insights = await this.generateInsights(analytics, request.analyticsDepth);

      // Generate comparisons if requested
      const comparisons = request.includeComparisons
        ? await this.generateComparisons(request.userId, timeRange)
        : undefined;

      // Generate predictions if requested
      const predictions = request.includePredictions ? await this.generatePredictiveInsights(analytics) : undefined;

      // Calculate overall score
      const overallScore = this.calculateOverallScore(analytics);

      // Assess risk level
      const riskAssessment = await this.assessRisk(analytics);

      // Identify growth opportunities
      const growthOpportunities = await this.identifyGrowthOpportunities(analytics, insights);

      // Record analytics event
      await this.repository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'member_analytics_generated',
        eventData: {
          analyticsDepth: request.analyticsDepth,
          timeRange,
          overallScore,
          riskLevel: riskAssessment.level,
          growthOpportunities: growthOpportunities.length,
        },
      });

      return {
        userId: request.userId,
        reportPeriod: timeRange,
        analytics,
        insights,
        comparisons,
        predictions,
        overallScore,
        riskAssessment,
        growthOpportunities,
        generatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof AnalyticsError) {
        throw error;
      }
      throw AnalyticsError.internalError(
        'Failed to generate member analytics',
        error instanceof Error ? error : undefined
      );
    }
  }

  private validateRequest(request: GenerateUserAnalyticsRequest): void {
    if (!request.userId?.trim()) {
      throw AnalyticsError.userIdRequired();
    }

    if (!['summary', 'detailed', 'comprehensive'].includes(request.analyticsDepth)) {
      throw AnalyticsError.validationError('analyticsDepth', 'Invalid analytics depth');
    }

    if (request.timeRange) {
      const { start, end } = request.timeRange;
      if (start >= end) {
        throw AnalyticsError.invalidDateRange(start, end);
      }
    }
  }

  private async generateUserAnalyticsData(userId: string, timeRange: { start: Date; end: Date }, depth: string) {
    // Get entries in time range
    const entries = await this.repository.getEntriesByUser(userId, {
      dateFrom: timeRange.start,
      dateTo: timeRange.end,
      isArchived: false,
    });

    // Get insights for the period
    const insights = await this.repository.getInsightsByUser(userId, {
      dateFrom: timeRange.start,
      dateTo: timeRange.end,
    });

    // Calculate entry activity
    const entryActivity = this.calculateEntryActivity(entries, timeRange);

    // Analyze emotional wellbeing
    const emotionalWellbeing = this.analyzeEmotionalWellbeing(entries, insights);

    // Identify cognitive patterns
    const cognitivePatterns = this.analyzeCognitivePatterns(entries);

    // Calculate growth indicators
    const growthIndicators = this.calculateGrowthIndicators(entries, insights);

    return {
      entryActivity,
      emotionalWellbeing,
      cognitivePatterns,
      growthIndicators,
    };
  }

  private calculateEntryActivity(entries: EntryData[], timeRange: { start: Date; end: Date }) {
    const daysDiff = Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24));

    // Group entries by type
    const entryTypes: Record<string, number> = {};
    entries.forEach(entry => {
      const type = entry.type || 'general';
      entryTypes[type] = (entryTypes[type] || 0) + 1;
    });

    // Calculate streak days (mock implementation)
    const streakDays = Math.min(daysDiff, 14); // Mock streak calculation

    // Find most active day (mock)
    const mostActiveDay = 'Monday'; // Would analyze actual daily patterns

    return {
      totalEntries: entries.length,
      entriesPerDay: Math.round((entries.length / daysDiff) * 100) / 100,
      streakDays,
      mostActiveDay,
      entryTypes,
    };
  }

  private analyzeEmotionalWellbeing(entries: EntryData[], insights: InsightEntry[]) {
    // Mock emotional analysis - would use sentiment analysis in production
    const positiveEntries = Math.floor(entries.length * 0.6);
    const challengingEntries = entries.length - positiveEntries;

    const moodTrends = [
      { date: '2024-01-01', mood: 'positive', count: 5 },
      { date: '2024-01-02', mood: 'neutral', count: 3 },
      { date: '2024-01-03', mood: 'positive', count: 7 },
    ];

    return {
      overallSentiment: 'positive',
      emotionalVariability: 0.3,
      positiveEntries,
      challengingEntries,
      moodTrends,
    };
  }

  private analyzeCognitivePatterns(entries: EntryData[]) {
    // Mock cognitive pattern analysis
    const clarityLevels = {
      high: Math.floor(entries.length * 0.4),
      medium: Math.floor(entries.length * 0.4),
      low: Math.floor(entries.length * 0.2),
    };

    const topThemes = [
      { theme: 'personal growth', count: 15 },
      { theme: 'work challenges', count: 12 },
      { theme: 'relationships', count: 10 },
    ];

    return {
      clarityLevels,
      averageEntryComplexity: 0.7,
      topThemes,
      reasoningPatterns: ['analytical', 'reflective', 'solution-oriented'],
    };
  }

  private calculateGrowthIndicators(entries: EntryData[], insights: InsightEntry[]) {
    // Mock growth indicators calculation
    return {
      selfAwarenessScore: 0.75,
      reflectionDepth: 0.68,
      insightGeneration: insights.length / Math.max(entries.length, 1),
      actionableInsights: Math.floor(insights.length * 0.6),
    };
  }

  private async generateInsights(analytics: AnalyticsData, depth: string): Promise<GeneratedInsight[]> {
    const insights: GeneratedInsight[] = [
      {
        type: 'trend',
        title: 'Consistent Reflection Pattern',
        description: 'You maintain a regular reflection practice',
        significance: 'high' as const,
        actionable: true,
      },
      {
        type: 'growth',
        title: 'Increased Self-Awareness',
        description: 'Your self-awareness score has improved over time',
        significance: 'medium' as const,
        actionable: true,
      },
    ];

    if (depth === 'comprehensive') {
      insights.push({
        type: 'pattern',
        title: 'Peak Performance Times',
        description: 'Your most productive thinking occurs in the morning',
        significance: 'medium' as const,
        actionable: true,
      });
    }

    return insights;
  }

  private async generateComparisons(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{ previousPeriod: PeriodComparison; userAverage: PeriodComparison }> {
    // Mock comparison data
    return {
      previousPeriod: {
        entryActivity: { totalEntries: 45, entriesPerDay: 1.5 },
        overallScore: 72,
      },
      userAverage: {
        entryActivity: { totalEntries: 50, entriesPerDay: 1.7 },
        overallScore: 75,
      },
    };
  }

  private async generatePredictiveInsights(analytics: AnalyticsData) {
    return {
      nextWeekOutlook: 'Positive growth trajectory expected',
      recommendedActions: [
        'Continue daily reflection practice',
        'Focus on identified growth areas',
        'Explore new analytical frameworks',
      ],
      riskFactors: ['Potential burnout from over-analysis', 'Need for variety in reflection topics'],
    };
  }

  private calculateOverallScore(analytics: AnalyticsData): number {
    const activityScore = Math.min(100, analytics.entryActivity.entriesPerDay * 30);
    const wellbeingScore = analytics.emotionalWellbeing.overallSentiment === 'positive' ? 80 : 60;
    const growthScore = analytics.growthIndicators.selfAwarenessScore * 100;

    return Math.round(activityScore * 0.3 + wellbeingScore * 0.3 + growthScore * 0.4);
  }

  private async assessRisk(analytics: AnalyticsData) {
    const riskFactors = [];
    let level: 'low' | 'medium' | 'high' = 'low';

    if (analytics.emotionalWellbeing.emotionalVariability > 0.7) {
      riskFactors.push('High emotional variability');
      level = 'medium';
    }

    if (analytics.entryActivity.entriesPerDay < 0.5) {
      riskFactors.push('Low reflection frequency');
      level = 'medium';
    }

    const recommendations = [];
    if (level === 'medium') {
      recommendations.push('Consider increasing reflection frequency');
      recommendations.push('Focus on emotional regulation techniques');
    }

    return {
      level,
      factors: riskFactors,
      recommendations,
    };
  }

  private async identifyGrowthOpportunities(analytics: AnalyticsData, insights: GeneratedInsight[]) {
    const opportunities = [
      'Develop deeper analytical thinking skills',
      'Explore new psychological frameworks',
      'Increase variety in reflection topics',
    ];

    if (analytics.growthIndicators.selfAwarenessScore < 0.7) {
      opportunities.push('Focus on self-awareness development');
    }

    return opportunities;
  }
}
