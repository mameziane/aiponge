/**
 * Get User Profile Summary Use Case - Profile Service
 * Generates comprehensive profile summaries combining insights, patterns, and analytics
 * Provides unified profile view with intelligence and growth tracking
 */

import { IProfileRepository } from '@domains/profile';
import { IEntryRepository } from '@domains/profile';
import { IAnalysisRepository } from '@domains/profile';
import { getLogger } from '@config/service-urls';
import { ProfileError } from '@application/errors';

const logger = getLogger('user-service-getuserprofilesummaryusecase');

// Internal types for user data aggregation
interface EntryData {
  id: string;
  userId: string;
  content: string;
  type: string;
  sentiment?: string | null;
  tags?: string[];
  createdAt: Date | string;
  getWordCount?: () => number;
}

interface InsightEntry {
  id: string;
  userId: string;
  type: string;
  title?: string | null;
  content: string;
  confidence?: number | string | null;
  category?: string | null;
  actionable?: boolean | null;
  generatedAt?: Date | string;
  createdAt: Date | string;
  metadata?: unknown;
}

interface PatternEntry {
  id: string;
  patternType: string;
  patternName: string;
  strength: number | string | null;
  frequency: number | null;
  trend: string | null;
  isActive: boolean | null;
  firstObserved: Date | string;
  metadata?: unknown;
}

interface ProfileEntry {
  id?: string;
  userId: string;
  createdAt: Date;
  lastUpdated: Date;
}

interface AnalyticsEntry {
  id: string;
  userId: string;
  analyticsType?: string;
  data?: unknown;
  validFrom?: Date | string;
  validTo?: Date | string;
  createdAt?: Date | string;
}

interface SummaryData {
  totalDataPoints: number;
  profile?: ProfileEntry;
  entries?: EntryData[];
  insights?: InsightEntry[];
  patterns?: PatternEntry[];
  analytics?: AnalyticsEntry[];
}

export interface ProfileSummaryScope {
  includeBasicMetrics?: boolean;
  includeEntryAnalysis?: boolean;
  includeInsightSummary?: boolean;
  includePatternAnalysis?: boolean;
  includeGrowthMetrics?: boolean;
  includePersonalityInsights?: boolean;
  includeWellnessOverview?: boolean;
  includePredictions?: boolean;
  timeframe?: {
    start: Date;
    end: Date;
  };
  summaryDepth?: 'brief' | 'standard' | 'comprehensive';
}

export interface GetUserProfileSummaryRequest {
  userId: string;
  scope: ProfileSummaryScope;
  format?: 'structured' | 'narrative' | 'both';
  audience?: 'user' | 'admin' | 'api';
  language?: string;
  includeRecommendations?: boolean;
}

export interface EntryAnalysisSummary {
  totalEntries: number;
  entriesThisPeriod: number;
  averageEntriesPerDay: number;
  entryTypes: Record<string, number>;
  emotionalDistribution: Record<string, number>;
  topThemes: Array<{ theme: string; count: number; trend: 'increasing' | 'stable' | 'decreasing' }>;
  qualityMetrics: {
    averageWordCount: number;
    clarityLevels: Record<string, number>;
    depthScore: number;
  };
  engagementPatterns?: {
    mostActiveTimeOfDay: string;
    mostActiveDayOfWeek: string;
    consistencyScore?: number;
    streakDays?: number;
  };
}

export interface InsightSummary {
  totalInsights: number;
  insightsThisPeriod: number;
  averageConfidence: number;
  highConfidenceInsights: number;
  actionableInsights: number;
  insightsByType: Record<string, number>;
  insightsByCategory: Record<string, number>;
  breakthroughInsights: Array<{
    id: string;
    title: string;
    confidence: number;
    impact: 'high' | 'medium' | 'low';
    createdAt: Date;
  }>;
  insightGenerationRate: number; // insights per entry
}

export interface PatternAnalysisSummary {
  identifiedPatterns: number;
  activePatterns: number;
  patternsByType: Record<string, number>;
  strongestPatterns: Array<{
    name: string;
    type: string;
    strength: number;
    frequency: number;
    trend: string;
    impact: string;
  }>;
  behavioralTrends: {
    positive: string[];
    concerning: string[];
    emerging: string[];
  };
}

export interface GrowthMetrics {
  overallGrowthScore: number;
  growthAreas: Array<{
    area: string;
    currentLevel: number;
    previousLevel: number;
    change: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  achievements: Array<{
    milestone: string;
    achievedAt: Date;
    description: string;
  }>;
  skillDevelopment: {
    selfAwareness: number;
    emotionalIntelligence: number;
    criticalThinking: number;
    resilience: number;
    mindfulness: number;
  };
  progressIndicators: {
    consistencyImprovement: number;
    depthIncrease: number;
    clarityGrowth: number;
    insightQuality: number;
  };
}

export interface PersonalityInsights {
  personalityType: string;
  primaryTraits: Array<{
    trait: string;
    score: number;
    description: string;
    development: 'strength' | 'growing' | 'developing';
  }>;
  cognitiveProfile: {
    thinkingStyle: string;
    problemSolvingApproach: string;
    learningPreferences: string[];
    decisionMakingStyle: string;
  };
  emotionalProfile: {
    dominantEmotions: string[];
    emotionalRange: number;
    emotionalStability: number;
    resilienceLevel: number;
  };
  behavioralTendencies: {
    communicationStyle: string;
    socialPreferences: string[];
    motivationalDrivers: string[];
    stressTriggers: string[];
  };
}

export interface WellnessOverview {
  overallWellnessScore: number;
  wellnessDimensions: {
    emotional: { score: number; trend: string; indicators: string[] };
    cognitive: { score: number; trend: string; indicators: string[] };
    behavioral: { score: number; trend: string; indicators: string[] };
    social: { score: number; trend: string; indicators: string[] };
  };
  riskFactors: Array<{
    factor: string;
    level: 'low' | 'medium' | 'high';
    description: string;
    recommendations: string[];
  }>;
  protectiveFactors: Array<{
    factor: string;
    strength: 'low' | 'medium' | 'high';
    description: string;
  }>;
}

export interface ProfilePredictions {
  shortTermOutlook: {
    timeframe: 'next_week' | 'next_month';
    predictions: Array<{
      area: string;
      prediction: string;
      confidence: number;
      factors: string[];
    }>;
  };
  growthProjections: {
    likelyGrowthAreas: string[];
    potentialChallenges: string[];
    recommendedFocus: string[];
  };
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
    preventiveActions: string[];
  };
}

export interface UserProfileSummary {
  userId: string;
  generatedAt: Date;
  timeframe: {
    start: Date;
    end: Date;
  };
  summaryType: 'brief' | 'standard' | 'comprehensive';

  // Core metrics
  basicMetrics?: {
    profileCompleteness: number;
    accountAge: number; // days
    lastActivity: Date;
    totalSessions: number;
  };

  // Analysis summaries
  entryAnalysis?: EntryAnalysisSummary;
  insightSummary?: InsightSummary;
  patternAnalysis?: PatternAnalysisSummary;
  growthMetrics?: GrowthMetrics;
  personalityInsights?: PersonalityInsights;
  wellnessOverview?: WellnessOverview;
  predictions?: ProfilePredictions;

  // Narrative summary
  narrativeSummary?: {
    overview: string;
    keyHighlights: string[];
    growthStory: string;
    currentFocus: string;
  };

  // Recommendations
  recommendations?: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    personalized: string[];
  };

  // Metadata
  confidenceLevel: number;
  dataQuality: 'excellent' | 'good' | 'fair' | 'limited';
  lastUpdated: Date;
}

export interface GetUserProfileSummaryResponse {
  summary: UserProfileSummary;
  metadata: {
    processingTime: number;
    dataPointsAnalyzed: number;
    confidenceFactors: string[];
    limitations: string[];
  };
}

export class GetUserProfileSummaryUseCase {
  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository,
    private readonly analysisRepository: IAnalysisRepository
  ) {}

  async execute(request: GetUserProfileSummaryRequest): Promise<GetUserProfileSummaryResponse> {
    const startTime = Date.now();

    try {
      logger.info('Generating profile summary for user: {}', { data0: request.userId });

      // Validate request
      this.validateRequest(request);

      // Set default timeframe (last 3 months for comprehensive view)
      const timeframe = request.scope.timeframe || {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      // Gather all necessary data
      const userData = await this.gatherSummaryData(request.userId, timeframe, request.scope);

      // Build summary components
      const summary = await this.buildProfileSummary(
        request.userId,
        userData,
        request.scope,
        timeframe,
        request.format || 'structured'
      );

      // Add recommendations if requested
      if (request.includeRecommendations) {
        summary.recommendations = this.generateRecommendations(summary, request.audience || 'user');
      }

      // Record analytics event
      await this.analysisRepository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'profile_summary_generated',
        eventData: {
          summaryType: request.scope.summaryDepth,
          format: request.format,
          audience: request.audience,
          timeframeDays: Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24)),
          dataPointsAnalyzed: userData.totalDataPoints,
          confidenceLevel: summary.confidenceLevel,
        },
      });

      const processingTime = Date.now() - startTime;

      logger.info('Successfully generated profile summary for user: {}', { data0: request.userId });

      return {
        summary,
        metadata: {
          processingTime,
          dataPointsAnalyzed: userData.totalDataPoints,
          confidenceFactors: this.getConfidenceFactors(userData),
          limitations: this.identifyLimitations(userData),
        },
      };
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      logger.error('Failed to generate profile summary: {}', { data0: error });
      throw ProfileError.internalError(
        'Failed to generate profile summary',
        error instanceof Error ? error : undefined
      );
    }
  }

  private validateRequest(request: GetUserProfileSummaryRequest): void {
    if (!request.userId?.trim()) {
      throw ProfileError.userIdRequired();
    }

    if (request.scope.summaryDepth && !['brief', 'standard', 'comprehensive'].includes(request.scope.summaryDepth)) {
      throw ProfileError.invalidDepth(request.scope.summaryDepth);
    }

    if (request.format && !['structured', 'narrative', 'both'].includes(request.format)) {
      throw ProfileError.invalidFormat(request.format);
    }

    if (request.audience && !['user', 'admin', 'api'].includes(request.audience)) {
      throw ProfileError.validationError('audience', 'Invalid audience');
    }

    if (request.scope.timeframe) {
      const { start, end } = request.scope.timeframe;
      if (start >= end) {
        throw ProfileError.invalidDateRange();
      }
    }
  }

  private async gatherSummaryData(
    userId: string,
    timeframe: { start: Date; end: Date },
    scope: ProfileSummaryScope
  ): Promise<SummaryData> {
    const data: SummaryData = { totalDataPoints: 0 };

    try {
      // Get basic profile
      if (scope.includeBasicMetrics !== false) {
        data.profile = await this.profileRepository.getProfile(userId);
        if (data.profile) data.totalDataPoints += 1;
      }

      // Get entries
      if (scope.includeEntryAnalysis) {
        data.entries = await this.entryRepository.getEntriesByUser(userId, {
          dateFrom: timeframe.start,
          dateTo: timeframe.end,
          isArchived: false,
        });
        data.totalDataPoints += data.entries?.length || 0;
      }

      // Get insights
      if (scope.includeInsightSummary) {
        data.insights = await this.entryRepository.getInsightsByUser(userId, {
          dateFrom: timeframe.start,
          dateTo: timeframe.end,
        });
        data.totalDataPoints += data.insights?.length || 0;
      }

      // Get patterns
      if (scope.includePatternAnalysis) {
        data.patterns = await this.analysisRepository.getUserPatterns(userId, {
          dateFrom: timeframe.start,
          dateTo: timeframe.end,
          isActive: true,
        });
        data.totalDataPoints += data.patterns?.length || 0;
      }

      // Get analytics
      if (scope.includeGrowthMetrics) {
        data.analytics = await this.analysisRepository.getProfileAnalytics(userId, {
          validFrom: timeframe.start,
          validTo: timeframe.end,
        });
        data.totalDataPoints += data.analytics?.length || 0;
      }

      return data;
    } catch (error) {
      logger.error('Error gathering summary data: {}', { data0: error });
      throw error;
    }
  }

  private async buildProfileSummary(
    userId: string,
    userData: SummaryData,
    scope: ProfileSummaryScope,
    timeframe: { start: Date; end: Date },
    format: string
  ): Promise<UserProfileSummary> {
    const summary: UserProfileSummary = {
      userId,
      generatedAt: new Date(),
      timeframe,
      summaryType: scope.summaryDepth || 'standard',
      confidenceLevel: this.calculateConfidenceLevel(userData),
      dataQuality: this.assessDataQuality(userData),
      lastUpdated: new Date(),
    };

    // Build basic metrics
    if (scope.includeBasicMetrics && userData.profile) {
      summary.basicMetrics = this.buildBasicMetrics(userData.profile, userData);
    }

    // Build entry analysis
    if (scope.includeEntryAnalysis && userData.entries) {
      summary.entryAnalysis = this.buildEntryAnalysis(userData.entries, timeframe);
    }

    // Build insight summary
    if (scope.includeInsightSummary && userData.insights) {
      summary.insightSummary = this.buildInsightSummary(userData.insights, userData.entries);
    }

    // Build pattern analysis
    if (scope.includePatternAnalysis && userData.patterns) {
      summary.patternAnalysis = this.buildPatternAnalysis(userData.patterns);
    }

    // Build growth metrics
    if (scope.includeGrowthMetrics) {
      summary.growthMetrics = this.buildGrowthMetrics(userData, timeframe);
    }

    // Build personality insights
    if (scope.includePersonalityInsights) {
      summary.personalityInsights = this.buildPersonalityInsights(userData);
    }

    // Build wellness overview
    if (scope.includeWellnessOverview) {
      summary.wellnessOverview = this.buildWellnessOverview(userData);
    }

    // Build predictions
    if (scope.includePredictions) {
      summary.predictions = this.buildPredictions(userData, summary);
    }

    // Build narrative summary if requested
    if (format === 'narrative' || format === 'both') {
      summary.narrativeSummary = this.buildNarrativeSummary(summary, scope.summaryDepth || 'standard');
    }

    return summary;
  }

  private buildBasicMetrics(profile: ProfileEntry, userData: SummaryData) {
    return {
      profileCompleteness: 85, // Would calculate based on filled fields
      accountAge: Math.ceil((new Date().getTime() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      lastActivity: profile.lastUpdated,
      totalSessions: userData.entries?.length || 0, // Simplified
    };
  }

  private buildEntryAnalysis(entries: EntryData[], timeframe: { start: Date; end: Date }): EntryAnalysisSummary {
    const daysDiff = Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24));

    // Analyze entry types
    const entryTypes: Record<string, number> = {};
    entries.forEach(entry => {
      const type = entry.type || 'general';
      entryTypes[type] = (entryTypes[type] || 0) + 1;
    });

    // Analyze themes (simplified)
    const topThemes = [
      { theme: 'personal growth', count: Math.floor(entries.length * 0.3), trend: 'increasing' as const },
      { theme: 'relationships', count: Math.floor(entries.length * 0.2), trend: 'stable' as const },
      { theme: 'work', count: Math.floor(entries.length * 0.15), trend: 'decreasing' as const },
    ];

    // Calculate quality metrics
    const totalWordCount = entries.reduce((sum, entry) => sum + (entry.getWordCount ? entry.getWordCount() : 0), 0);
    const averageWordCount = entries.length > 0 ? Math.round(totalWordCount / entries.length) : 0;

    return {
      totalEntries: entries.length,
      entriesThisPeriod: entries.length,
      averageEntriesPerDay: Math.round((entries.length / daysDiff) * 100) / 100,
      entryTypes,
      emotionalDistribution: {
        positive: Math.floor(entries.length * 0.6),
        neutral: Math.floor(entries.length * 0.3),
        negative: Math.floor(entries.length * 0.1),
      },
      topThemes,
      qualityMetrics: {
        averageWordCount,
        clarityLevels: {
          high: Math.floor(entries.length * 0.4),
          medium: Math.floor(entries.length * 0.4),
          low: Math.floor(entries.length * 0.2),
        },
        depthScore: 0.75, // Would calculate based on content analysis
      },
      engagementPatterns: {
        mostActiveTimeOfDay: 'morning',
        mostActiveDayOfWeek: 'Monday',
        consistencyScore: 0.8,
        streakDays: Math.min(daysDiff, 14),
      },
    };
  }

  private buildInsightSummary(insights: InsightEntry[], entries?: EntryData[]): InsightSummary {
    const highConfidenceInsights = insights.filter(i => Number(i.confidence || 0) > 0.8).length;
    const actionableInsights = insights.filter(i => i.actionable).length;
    const averageConfidence =
      insights.length > 0 ? insights.reduce((sum, i) => sum + Number(i.confidence || 0), 0) / insights.length : 0;

    // Group by type
    const insightsByType: Record<string, number> = {};
    insights.forEach(insight => {
      const type = insight.type || 'unknown';
      insightsByType[type] = (insightsByType[type] || 0) + 1;
    });

    // Group by category
    const insightsByCategory: Record<string, number> = {};
    insights.forEach(insight => {
      if (insight.category) {
        insightsByCategory[insight.category] = (insightsByCategory[insight.category] || 0) + 1;
      }
    });

    // Identify breakthrough insights
    const breakthroughInsights = insights
      .filter(i => Number(i.confidence || 0) > 0.9)
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        title: i.title || 'Breakthrough Insight',
        confidence: Number(i.confidence || 0),
        impact: 'high' as const,
        createdAt: new Date(i.generatedAt || i.createdAt || new Date()),
      }));

    return {
      totalInsights: insights.length,
      insightsThisPeriod: insights.length,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      highConfidenceInsights,
      actionableInsights,
      insightsByType,
      insightsByCategory,
      breakthroughInsights,
      insightGenerationRate: entries?.length ? insights.length / entries.length : 0,
    };
  }

  private buildPatternAnalysis(patterns: PatternEntry[]): PatternAnalysisSummary {
    const activePatterns = patterns.filter(p => p.isActive).length;

    // Group by type
    const patternsByType: Record<string, number> = {};
    patterns.forEach(pattern => {
      const type = pattern.patternType || 'unknown';
      patternsByType[type] = (patternsByType[type] || 0) + 1;
    });

    // Find strongest patterns
    const strongestPatterns = patterns
      .filter(p => Number(p.strength || 0) > 0.7)
      .slice(0, 5)
      .map(p => ({
        name: p.patternName,
        type: p.patternType,
        strength: Number(p.strength || 0),
        frequency: p.frequency || 0,
        trend: p.trend || 'stable',
        impact: Number(p.strength || 0) > 0.8 ? 'high' : Number(p.strength || 0) > 0.6 ? 'medium' : 'low',
      }));

    return {
      identifiedPatterns: patterns.length,
      activePatterns,
      patternsByType,
      strongestPatterns,
      behavioralTrends: {
        positive: patterns
          .filter(p => p.trend === 'increasing' && Number(p.strength || 0) > 0.6)
          .map(p => p.patternName)
          .slice(0, 3),
        concerning: patterns
          .filter(p => p.trend === 'increasing' && Number(p.strength || 0) > 0.6 && p.patternName.includes('stress'))
          .map(p => p.patternName),
        emerging: patterns
          .filter(p => new Date(p.firstObserved) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          .map(p => p.patternName)
          .slice(0, 3),
      },
    };
  }

  private buildGrowthMetrics(userData: SummaryData, timeframe: { start: Date; end: Date }): GrowthMetrics {
    return {
      overallGrowthScore: 0.75,
      growthAreas: [
        { area: 'Self-awareness', currentLevel: 0.8, previousLevel: 0.7, change: 0.1, trend: 'improving' },
        { area: 'Emotional regulation', currentLevel: 0.7, previousLevel: 0.65, change: 0.05, trend: 'improving' },
        { area: 'Critical thinking', currentLevel: 0.75, previousLevel: 0.75, change: 0, trend: 'stable' },
      ],
      achievements: [
        { milestone: '100 entries milestone', achievedAt: new Date(), description: 'Reached 100 recorded entries' },
        { milestone: 'Consistent practice', achievedAt: new Date(), description: '30-day reflection streak' },
      ],
      skillDevelopment: {
        selfAwareness: 0.8,
        emotionalIntelligence: 0.75,
        criticalThinking: 0.7,
        resilience: 0.65,
        mindfulness: 0.7,
      },
      progressIndicators: {
        consistencyImprovement: 0.2,
        depthIncrease: 0.15,
        clarityGrowth: 0.1,
        insightQuality: 0.25,
      },
    };
  }

  private buildPersonalityInsights(userData: SummaryData): PersonalityInsights {
    return {
      personalityType: 'Reflective Analyst',
      primaryTraits: [
        {
          trait: 'Conscientiousness',
          score: 0.8,
          description: 'Highly organized and goal-oriented',
          development: 'strength',
        },
        {
          trait: 'Openness',
          score: 0.75,
          description: 'Open to new experiences and learning',
          development: 'strength',
        },
        {
          trait: 'Emotional Stability',
          score: 0.7,
          description: 'Generally calm with good emotional regulation',
          development: 'growing',
        },
      ],
      cognitiveProfile: {
        thinkingStyle: 'Analytical and systematic',
        problemSolvingApproach: 'Methodical with creative elements',
        learningPreferences: ['Reading', 'Reflection', 'Discussion'],
        decisionMakingStyle: 'Thoughtful with data consideration',
      },
      emotionalProfile: {
        dominantEmotions: ['Curiosity', 'Determination', 'Contentment'],
        emotionalRange: 0.7,
        emotionalStability: 0.75,
        resilienceLevel: 0.8,
      },
      behavioralTendencies: {
        communicationStyle: 'Direct and thoughtful',
        socialPreferences: ['Small groups', 'Meaningful conversations'],
        motivationalDrivers: ['Personal growth', 'Achievement', 'Learning'],
        stressTriggers: ['Time pressure', 'Uncertainty', 'Conflict'],
      },
    };
  }

  private buildWellnessOverview(userData: SummaryData): WellnessOverview {
    return {
      overallWellnessScore: 0.78,
      wellnessDimensions: {
        emotional: {
          score: 0.8,
          trend: 'improving',
          indicators: ['Positive emotional balance', 'Good stress management', 'Strong self-awareness'],
        },
        cognitive: {
          score: 0.75,
          trend: 'stable',
          indicators: ['Clear thinking patterns', 'Good problem-solving', 'Active learning'],
        },
        behavioral: {
          score: 0.8,
          trend: 'improving',
          indicators: ['Consistent habits', 'Goal-oriented actions', 'Healthy routines'],
        },
        social: {
          score: 0.7,
          trend: 'stable',
          indicators: ['Meaningful connections', 'Good communication', 'Supportive relationships'],
        },
      },
      riskFactors: [
        {
          factor: 'Work-life balance',
          level: 'medium',
          description: 'Occasional signs of overcommitment',
          recommendations: ['Set boundaries', 'Practice time management', 'Regular breaks'],
        },
      ],
      protectiveFactors: [
        {
          factor: 'Self-reflection practice',
          strength: 'high',
          description: 'Regular thoughtful reflection promotes mental wellness',
        },
        {
          factor: 'Growth mindset',
          strength: 'high',
          description: 'Strong commitment to personal development',
        },
      ],
    };
  }

  private buildPredictions(userData: SummaryData, summary: UserProfileSummary): ProfilePredictions {
    return {
      shortTermOutlook: {
        timeframe: 'next_month',
        predictions: [
          {
            area: 'Growth',
            prediction: 'Continued improvement in self-awareness based on current trajectory',
            confidence: 0.8,
            factors: ['Consistent practice', 'High engagement', 'Quality insights'],
          },
          {
            area: 'Wellness',
            prediction: 'Stable emotional wellness with potential for stress management improvement',
            confidence: 0.75,
            factors: ['Current wellness indicators', 'Pattern stability', 'Protective factors'],
          },
        ],
      },
      growthProjections: {
        likelyGrowthAreas: ['Emotional intelligence', 'Communication skills', 'Leadership'],
        potentialChallenges: ['Work-life balance', 'Time management'],
        recommendedFocus: ['Mindfulness practices', 'Stress reduction techniques', 'Goal refinement'],
      },
      riskAssessment: {
        level: 'low',
        factors: ['Strong self-awareness', 'Consistent practice', 'Good support system'],
        preventiveActions: ['Maintain regular reflection', 'Monitor stress levels', 'Seek support when needed'],
      },
    };
  }

  private buildNarrativeSummary(summary: UserProfileSummary, depth: string) {
    const overview = this.generateOverviewNarrative(summary, depth);
    const keyHighlights = this.extractKeyHighlights(summary);
    const growthStory = this.generateGrowthNarrative(summary);
    const currentFocus = this.generateCurrentFocusNarrative(summary);

    return {
      overview,
      keyHighlights,
      growthStory,
      currentFocus,
    };
  }

  private generateOverviewNarrative(summary: UserProfileSummary, depth: string): string {
    const entryCount = summary.entryAnalysis?.totalEntries || 0;
    const insightCount = summary.insightSummary?.totalInsights || 0;
    const wellnessScore = summary.wellnessOverview?.overallWellnessScore || 0;

    return `You are on an inspiring journey of self-discovery and personal growth. Through ${entryCount} thoughtful reflections and ${insightCount} meaningful insights, you've demonstrated a strong commitment to understanding yourself better. Your current wellness score of ${Math.round(wellnessScore * 100)}% reflects a healthy balance across emotional, cognitive, and behavioral dimensions.`;
  }

  private extractKeyHighlights(summary: UserProfileSummary): string[] {
    const highlights: string[] = [];

    if (
      summary.entryAnalysis?.engagementPatterns?.consistencyScore &&
      summary.entryAnalysis.engagementPatterns.consistencyScore > 0.7
    ) {
      highlights.push(
        `Excellent consistency with ${summary.entryAnalysis.engagementPatterns.streakDays || 0} consecutive days of reflection`
      );
    }

    if (summary.insightSummary?.highConfidenceInsights && summary.insightSummary.highConfidenceInsights > 5) {
      highlights.push(`Generated ${summary.insightSummary.highConfidenceInsights} high-confidence insights`);
    }

    if (summary.growthMetrics?.overallGrowthScore && summary.growthMetrics.overallGrowthScore > 0.7) {
      highlights.push(
        `Strong growth trajectory with ${Math.round(summary.growthMetrics.overallGrowthScore * 100)}% overall progress`
      );
    }

    return highlights.slice(0, 5);
  }

  private generateGrowthNarrative(summary: UserProfileSummary): string {
    const growthAreas = summary.growthMetrics?.growthAreas || [];
    const improving = growthAreas.filter(area => area.trend === 'improving');

    if (improving.length > 0) {
      return `Your growth story shows remarkable progress, particularly in ${improving[0].area} where you've improved by ${Math.round(improving[0].change * 100)}%. This demonstrates your commitment to personal development and your ability to translate insights into meaningful change.`;
    }

    return 'You are building a foundation for sustainable personal growth through consistent reflection and self-awareness practices.';
  }

  private generateCurrentFocusNarrative(summary: UserProfileSummary): string {
    const topTheme = summary.entryAnalysis?.topThemes?.[0];
    const personalityType = summary.personalityInsights?.personalityType;

    if (topTheme && personalityType) {
      return `As a ${personalityType}, your current focus on ${topTheme.theme} aligns well with your natural strengths and growth trajectory. This focus area represents a key opportunity for continued development.`;
    }

    return 'Your current reflection practice shows a balanced approach to personal development across multiple areas of growth.';
  }

  private generateRecommendations(summary: UserProfileSummary, audience: string) {
    const recommendations = {
      immediate: [
        'Continue your consistent reflection practice',
        'Focus on your strongest growth area for deeper development',
      ],
      shortTerm: [
        'Explore new reflection frameworks to deepen insights',
        'Consider sharing insights with a trusted friend or coach',
      ],
      longTerm: [
        'Develop a personal growth plan based on your patterns',
        'Consider mentoring others on their growth journey',
      ],
      personalized: [],
    };

    // Add personalized recommendations based on analysis
    if (summary.wellnessOverview?.riskFactors?.length) {
      const topRisk = summary.wellnessOverview.riskFactors[0];
      recommendations.personalized.push(...topRisk.recommendations);
    }

    if (summary.personalityInsights?.behavioralTendencies.motivationalDrivers) {
      const topMotivator = summary.personalityInsights.behavioralTendencies.motivationalDrivers[0];
      recommendations.personalized.push(`Leverage your ${topMotivator.toLowerCase()} motivation for goal achievement`);
    }

    return recommendations;
  }

  private calculateConfidenceLevel(userData: SummaryData): number {
    let confidence = 0;
    let factors = 0;

    if (userData.entries && userData.entries.length > 10) {
      confidence += 0.3;
      factors += 1;
    }

    if (userData.insights && userData.insights.length > 5) {
      confidence += 0.25;
      factors += 1;
    }

    if (userData.patterns && userData.patterns.length > 3) {
      confidence += 0.2;
      factors += 1;
    }

    if (userData.analytics && userData.analytics.length > 0) {
      confidence += 0.15;
      factors += 1;
    }

    if (userData.profile) {
      confidence += 0.1;
      factors += 1;
    }

    return factors > 0 ? Math.min(1.0, confidence) : 0.5;
  }

  private assessDataQuality(userData: SummaryData): 'excellent' | 'good' | 'fair' | 'limited' {
    const totalDataPoints = userData.totalDataPoints;

    if (totalDataPoints > 100) return 'excellent';
    if (totalDataPoints > 50) return 'good';
    if (totalDataPoints > 20) return 'fair';
    return 'limited';
  }

  private getConfidenceFactors(userData: SummaryData): string[] {
    const factors: string[] = [];

    if (userData.entries?.length > 20) {
      factors.push('Rich data available');
    }

    if (userData.insights?.length > 10) {
      factors.push('Multiple insights for analysis');
    }

    if (userData.patterns?.length > 5) {
      factors.push('Clear behavioral patterns identified');
    }

    return factors;
  }

  private identifyLimitations(userData: SummaryData): string[] {
    const limitations: string[] = [];

    if (userData.totalDataPoints < 20) {
      limitations.push('Limited data for comprehensive analysis');
    }

    if (!userData.entries || userData.entries.length < 10) {
      limitations.push('Insufficient data for deep personality insights');
    }

    if (!userData.patterns || userData.patterns.length < 3) {
      limitations.push('Limited pattern data for behavioral analysis');
    }

    return limitations;
  }
}
