/**
 * Generate User Persona Use Case - Profile Service
 * Creates comprehensive user personas from aggregated data combining personality traits with behavior patterns
 * Refactored to use dedicated analyzer services for each analysis domain
 */

import type { IProfileRepository } from '@domains/profile';
import type { IEntryRepository } from '@domains/profile';
import type { IAnalysisRepository } from '@domains/profile';
import type { IPersonalityAnalyzer } from '../../services/persona/interfaces/IPersonalityAnalyzer';
import type { IBehaviorAnalyzer } from '../../services/persona/interfaces/IBehaviorAnalyzer';
import type { ICognitiveAnalyzer } from '../../services/persona/interfaces/ICognitiveAnalyzer';
import type { ISocialAnalyzer } from '../../services/persona/interfaces/ISocialAnalyzer';
import type { IGrowthAnalyzer } from '../../services/persona/interfaces/IGrowthAnalyzer';
import { ProfileError } from '@application/errors';
import type {
  PersonaAnalysisInput,
  EntryItem,
  InsightEntry,
  PatternEntry,
  AnalyticsEntry,
  HistoricalData,
  PersonalityData,
  BehaviorData,
  CognitiveData,
  SocialData,
  PersonalityTrait,
  BehaviorPattern,
} from '../../services/persona/types';
import type { IPersonaRepository } from '@infrastructure/repositories';
import { getLogger } from '@config/service-urls';

const logger = getLogger('user-service-generateuserpersonausecase');

export interface UserPersona {
  id: string;
  userId: string;
  name: string;
  description: string;
  personality: {
    primaryTraits: PersonalityTrait[];
    secondaryTraits: PersonalityTrait[];
    personalityType: string;
    cognitiveStyle: string;
    emotionalProfile: {
      dominantEmotions: string[];
      emotionalRange: number;
      emotionalStability: number;
      resilience: number;
    };
  };
  behavior: {
    patterns: BehaviorPattern[];
    preferences: {
      communicationStyle: string;
      learningStyle: string;
      decisionMaking: string;
      conflictResolution: string;
    };
    motivators: string[];
    stressors: string[];
  };
  cognitive: {
    thinkingPatterns: string[];
    problemSolvingStyle: string;
    creativity: number;
    analyticalThinking: number;
    intuitiveThinkers: number;
  };
  social: {
    relationshipStyle: string;
    socialNeeds: string[];
    communicationPreferences: string[];
  };
  growth: {
    developmentAreas: string[];
    strengths: string[];
    potentialGrowthPaths: string[];
  };
  metadata: {
    confidence: number;
    dataPoints: number;
    lastUpdated: Date;
    version: string;
  };
}

export type { PersonalityTrait, BehaviorPattern } from '../../services/persona/types';

export interface GenerateUserPersonaRequest {
  userId: string;
  timeframe?: {
    start: Date;
    end: Date;
  };
  includeHistorical?: boolean;
  personalizationDepth?: 'basic' | 'detailed' | 'comprehensive';
  focusAreas?: string[];
}

export interface GenerateUserPersonaResponse {
  persona: UserPersona;
  confidenceReport: {
    overallConfidence: number;
    dataQuality: 'low' | 'medium' | 'high';
    recommendationsForImprovement: string[];
  };
  recommendations: {
    personalizationSuggestions: string[];
    contentRecommendations: string[];
    growthOpportunities: string[];
  };
  generatedAt: Date;
}

export class GenerateUserPersonaUseCase {
  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository,
    private readonly analysisRepository: IAnalysisRepository,
    private readonly personaRepository: IPersonaRepository,
    private readonly personalityAnalyzer: IPersonalityAnalyzer,
    private readonly behaviorAnalyzer: IBehaviorAnalyzer,
    private readonly cognitiveAnalyzer: ICognitiveAnalyzer,
    private readonly socialAnalyzer: ISocialAnalyzer,
    private readonly growthAnalyzer: IGrowthAnalyzer
  ) {}

  async execute(request: GenerateUserPersonaRequest): Promise<GenerateUserPersonaResponse> {
    try {
      logger.info('🎭 Generating user persona for user: {}', { data0: request.userId });

      this.validateRequest(request);

      const timeframe = request.timeframe || {
        start: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const userData = await this.gatherUserData(request.userId, timeframe, request.includeHistorical);
      const depth = request.personalizationDepth || 'detailed';

      const personality = await this.personalityAnalyzer.analyze(userData, depth);
      const behavior = await this.behaviorAnalyzer.analyze(userData, depth);
      const cognitive = await this.cognitiveAnalyzer.analyze(userData, depth);
      const social = await this.socialAnalyzer.analyze(userData, depth);
      const growth = await this.growthAnalyzer.analyze(userData, personality, behavior, cognitive);

      const personaName = this.generatePersonaName(personality, behavior);
      const personaDescription = this.generatePersonaDescription(personality, behavior, cognitive, social);

      const persona: UserPersona = {
        id: `persona_${request.userId}_${Date.now()}`,
        userId: request.userId,
        name: personaName,
        description: personaDescription,
        personality,
        behavior,
        cognitive,
        social,
        growth,
        metadata: {
          confidence: this.calculateOverallConfidence(personality, behavior, cognitive, social),
          dataPoints: userData.totalDataPoints,
          lastUpdated: new Date(),
          version: '2.0',
        },
      };

      const confidenceReport = this.generateConfidenceReport(persona, userData);
      const recommendations = this.generateRecommendations(persona, userData);

      // Persist the persona to database
      const persistedPersona = await this.personaRepository.upsertLatestPersona({
        userId: request.userId,
        personaName: persona.name,
        personaDescription: persona.description,
        personality: persona.personality,
        behavior: persona.behavior,
        cognitive: persona.cognitive,
        social: persona.social,
        growth: persona.growth,
        confidence: persona.metadata.confidence,
        dataPoints: persona.metadata.dataPoints,
        version: persona.metadata.version,
        sourceTimeframeStart: timeframe.start,
        sourceTimeframeEnd: timeframe.end,
      });

      // Update persona id with the persisted id
      persona.id = persistedPersona.id;

      await this.analysisRepository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'persona_generated',
        eventData: {
          personaId: persona.id,
          personalizationDepth: request.personalizationDepth,
          dataPoints: userData.totalDataPoints,
          confidence: persona.metadata.confidence,
          focusAreas: request.focusAreas,
          persisted: true,
        },
      });

      logger.info('Successfully generated and persisted persona {} for user: {}', {
        data0: persona.id,
        data1: request.userId,
      });

      return {
        persona,
        confidenceReport,
        recommendations,
        generatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      logger.error('Failed to generate user persona: {}', { data0: error });
      throw ProfileError.internalError('Failed to generate user persona', error instanceof Error ? error : undefined);
    }
  }

  private validateRequest(request: GenerateUserPersonaRequest): void {
    if (!request.userId?.trim()) {
      throw ProfileError.userIdRequired();
    }

    if (
      request.personalizationDepth &&
      !['basic', 'detailed', 'comprehensive'].includes(request.personalizationDepth)
    ) {
      throw ProfileError.invalidDepth(request.personalizationDepth);
    }

    if (request.timeframe) {
      const { start, end } = request.timeframe;
      if (start >= end) {
        throw ProfileError.invalidDateRange();
      }
    }
  }

  private async gatherUserData(
    userId: string,
    timeframe: { start: Date; end: Date },
    includeHistorical?: boolean
  ): Promise<PersonaAnalysisInput> {
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
      isActive: true,
    });

    const analytics = await this.analysisRepository.getProfileAnalytics(userId, {
      validFrom: timeframe.start,
      validTo: timeframe.end,
    });

    let historicalData: HistoricalData = {};
    if (includeHistorical) {
      historicalData = await this.gatherHistoricalData(userId);
    }

    return {
      entries: entries as unknown as EntryItem[],
      insights: insights as unknown as InsightEntry[],
      patterns: patterns as unknown as PatternEntry[],
      analytics: analytics as unknown as AnalyticsEntry[],
      historicalData,
      totalDataPoints: entries.length + insights.length + patterns.length + analytics.length,
      timeframe,
    };
  }

  private async gatherHistoricalData(userId: string): Promise<HistoricalData> {
    const historicalEntries = await this.entryRepository.getEntriesByUser(userId, {
      isArchived: false,
    });

    const historicalInsights = await this.entryRepository.getInsightsByUser(userId);

    return {
      historicalEntries: historicalEntries as unknown as EntryItem[],
      historicalInsights: historicalInsights as unknown as InsightEntry[],
    };
  }

  private generatePersonaName(personality: PersonalityData, _behavior: BehaviorData): string {
    return `The ${personality.personalityType}`;
  }

  private generatePersonaDescription(
    personality: PersonalityData,
    _behavior: BehaviorData,
    _cognitive: CognitiveData,
    social: SocialData
  ): string {
    return `A ${personality.personalityType.toLowerCase()} who approaches life with ${personality.cognitiveStyle.toLowerCase()} and maintains ${social.relationshipStyle.toLowerCase()} in relationships. This persona combines thoughtful reflection with purposeful action.`;
  }

  private calculateOverallConfidence(
    personality: PersonalityData,
    behavior: BehaviorData,
    _cognitive: CognitiveData,
    _social: SocialData
  ): number {
    const personalityConfidence =
      personality.primaryTraits.reduce((sum: number, trait: PersonalityTrait) => sum + trait.confidence, 0) /
      personality.primaryTraits.length;
    const behaviorConfidence = behavior.patterns.length > 3 ? 0.8 : 0.6;
    const cognitiveConfidence = 0.7;
    const socialConfidence = 0.6;

    return personalityConfidence * 0.4 + behaviorConfidence * 0.3 + cognitiveConfidence * 0.2 + socialConfidence * 0.1;
  }

  private generateConfidenceReport(persona: UserPersona, userData: PersonaAnalysisInput) {
    const confidence = persona.metadata.confidence;
    const dataQuality: 'high' | 'medium' | 'low' =
      userData.totalDataPoints > 50 ? 'high' : userData.totalDataPoints > 20 ? 'medium' : 'low';

    const recommendations: string[] = [];
    if (dataQuality === 'low') {
      recommendations.push('Increase your writing frequency for better insights');
    }
    if (confidence < 0.7) {
      recommendations.push('Continue using the platform for more accurate persona development');
    }

    return {
      overallConfidence: confidence,
      dataQuality,
      recommendationsForImprovement: recommendations,
    };
  }

  private generateRecommendations(persona: UserPersona, _userData: PersonaAnalysisInput) {
    const personalizationSuggestions = [
      `Content focused on ${persona.personality.primaryTraits[0]?.trait} development`,
      `${persona.cognitive.problemSolvingStyle} problem-solving frameworks`,
      `Resources for ${persona.growth.developmentAreas[0]} improvement`,
    ];

    const contentRecommendations = [
      'Reflective writing exercises tailored to your thinking style',
      'Growth-oriented content matching your identified patterns',
      'Community connections with similar persona types',
    ];

    const growthOpportunities = persona.growth.potentialGrowthPaths;

    return {
      personalizationSuggestions,
      contentRecommendations,
      growthOpportunities,
    };
  }
}
