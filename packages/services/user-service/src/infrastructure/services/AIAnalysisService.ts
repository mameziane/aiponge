/**
 * AI Analysis Service - Real Implementation
 * Provides AI analysis using ContentServiceClient
 */

import { ContentServiceClient } from '../clients/ContentServiceClient';
import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('ai-analysis-service');

interface EntryAnalysisInput {
  content: string;
  userId: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

interface EntryAnalysisResult {
  themes: string[];
  sentiment: string;
  insights: string[];
  emotions?: string[];
  analysis: Record<string, unknown> | null;
  error?: string;
}

interface UserProfileInput {
  userId: string;
  totalInsights?: number;
  topThemes?: string[];
  recentActivity?: unknown;
}

interface ProfileAnalysisResult {
  persona: string;
  highlights: string[];
  analytics: Record<string, unknown>;
  strengths?: string[];
  growthAreas?: string[];
  error?: string;
}

interface WellnessInput {
  userId: string;
  totalInsights?: number;
  totalReflections?: number;
  totalEntries?: number;
  engagementPatterns?: Record<string, unknown>;
}

interface WellnessResult {
  score: number;
  breakdown: Record<string, number>;
  recommendations: string[];
  error?: string;
}

export class AIAnalysisService {
  private contentClient: ContentServiceClient;

  constructor() {
    this.contentClient = ContentServiceClient.getInstance();
  }

  async analyzeEntry(entryData: EntryAnalysisInput): Promise<EntryAnalysisResult> {
    try {
      const response = await this.contentClient.analyzeEntry(entryData);

      return {
        themes: response.analysis?.themes || [],
        sentiment: response.analysis?.sentiment || 'neutral',
        insights: response.analysis?.insights || [],
        emotions: response.analysis?.emotions || [],
        analysis: response.analysis,
      };
    } catch (error) {
      logger.error('AI analysis failed', {
        module: 'ai_analysis_service',
        error: serializeError(error),
      });

      return {
        themes: [],
        sentiment: 'neutral',
        insights: [],
        analysis: null,
        error: error instanceof Error ? error.message : 'Analysis failed',
      };
    }
  }

  async analyzeUserProfile(userData: UserProfileInput): Promise<ProfileAnalysisResult> {
    try {
      const analysisRequest = {
        content: JSON.stringify({
          userId: userData.userId,
          totalInsights: userData.totalInsights,
          topThemes: userData.topThemes,
          recentActivity: userData.recentActivity,
        }),
        type: 'profile-analysis',
        userId: userData.userId,
      };

      const response = await this.contentClient.analyzeContent(analysisRequest);
      const analysis = response.analysis as Record<string, unknown> | undefined;

      return {
        persona: (analysis?.persona as string) || 'exploratory',
        highlights: (analysis?.highlights as string[]) || [],
        analytics: analysis || {},
        strengths: (analysis?.strengths as string[]) || [],
        growthAreas: (analysis?.growthAreas as string[]) || [],
      };
    } catch (error) {
      logger.error('AI profile analysis failed', {
        module: 'ai_analysis_service',
        error: serializeError(error),
      });

      return {
        persona: 'default',
        highlights: [],
        analytics: {},
        error: error instanceof Error ? error.message : 'Profile analysis failed',
      };
    }
  }

  async calculateWellnessScore(userData: WellnessInput): Promise<WellnessResult> {
    try {
      const wellnessPrompt = `Calculate wellness score based on: 
        - Total insights: ${userData.totalInsights}
        - Total reflections: ${userData.totalReflections}
        - Total entries: ${userData.totalEntries}
        - Engagement patterns: ${JSON.stringify(userData.engagementPatterns || {})}`;

      const response = await this.contentClient.generateInsights(wellnessPrompt, {
        userId: userData.userId,
        analysisType: 'wellness-score',
      });

      const insights = response.insights || [];
      const scoreMatch = insights[0]?.match(/score[:\s]+(\d+)/i);
      const calculatedScore = scoreMatch ? parseInt(scoreMatch[1]) : 50;

      return {
        score: calculatedScore,
        breakdown: {
          entryConsistency: Math.min((userData.totalEntries || 0) * 2, 30),
          insightQuality: Math.min((userData.totalInsights || 0) * 3, 40),
          reflectionDepth: Math.min((userData.totalReflections || 0) * 2, 30),
        },
        recommendations: insights.slice(1) || ['Continue your wellness practice'],
      };
    } catch (error) {
      logger.error('Wellness score calculation failed', {
        module: 'ai_analysis_service',
        error: serializeError(error),
      });

      return {
        score: 0,
        breakdown: {},
        recommendations: [],
        error: error instanceof Error ? error.message : 'Wellness calculation failed',
      };
    }
  }
}
