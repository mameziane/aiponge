/**
 * Entry Analysis Service
 * Provides AI-powered entry analysis capabilities
 */

import type { IContentAnalysisPort } from '@domains/profile/ports/IContentAnalysisPort';

export interface EntryInsight {
  type: string;
  content: string;
  confidence: number;
  themes?: string[];
  actionableSuggestions?: string[];
  framework?: string;
}

export interface MusicDecision {
  shouldGenerateMusic: boolean;
  suggestedMood: string;
  suggestedThemes: string[];
  confidence: number;
}

export interface AnalysisData {
  sentiment?: string;
  themes?: string[];
  insights?: Array<{
    type?: string;
    content?: string;
    text?: string;
    confidence?: number;
    themes?: string[];
    actionableSuggestions?: string[];
    framework?: string;
  }>;
}

export interface EntryAnalysisRequest {
  userId: string;
  content: string;
  type: 'text' | 'voice' | 'image';
  moodContext?: string;
  analysisOptions?: {
    includeInsights?: boolean;
    includeMusicDecision?: boolean;
    includeRecommendations?: boolean;
  };
}

export interface EntryForBatch {
  userId: string;
  content: string;
  type?: 'text' | 'voice' | 'image';
  moodContext?: string;
}

export interface BatchAnalysisResult {
  success: boolean;
  analyses: Array<{
    insights: EntryInsight[];
    recommendations?: string[];
    musicDecision?: MusicDecision;
  }>;
  error?: string;
}

export interface EntryAnalysisResult {
  success: boolean;
  analysis: {
    insights: EntryInsight[];
    recommendations?: string[];
    musicDecision?: MusicDecision;
  };
  error?: string;
}

export class EntryAnalysisService {
  constructor(private contentServiceClient: IContentAnalysisPort) {}

  async analyzeEntry(request: EntryAnalysisRequest): Promise<EntryAnalysisResult> {
    try {
      const analysisResponse = await this.contentServiceClient.analyzeEntry({
        userId: request.userId,
        content: request.content,
        entryId: `entry-${Date.now()}`,
      });

      if (analysisResponse.error) {
        return {
          success: false,
          analysis: {
            insights: [],
            recommendations: [],
          },
          error: analysisResponse.error,
        };
      }

      const analysis = analysisResponse.analysis || {};

      const analysisData = analysis as AnalysisData;
      const insights: EntryInsight[] = (analysisData.insights || []).map(insight => ({
        type: insight.type || 'general',
        content: insight.content || insight.text || '',
        confidence: insight.confidence || 0.8,
        themes: insight.themes || analysisData.themes || [],
        actionableSuggestions: insight.actionableSuggestions || [],
        framework: insight.framework || 'general',
      }));

      if (insights.length === 0 && analysisData.sentiment) {
        insights.push({
          type: 'emotional',
          content: `Detected ${analysisData.sentiment} sentiment`,
          confidence: 0.8,
          themes: analysisData.themes || [],
          actionableSuggestions: [],
          framework: 'sentiment_analysis',
        });
      }

      return {
        success: true,
        analysis: {
          insights,
          recommendations: request.analysisOptions?.includeRecommendations
            ? this.generateRecommendations(insights)
            : [],
          musicDecision: request.analysisOptions?.includeMusicDecision
            ? this.generateMusicDecision(analysisData)
            : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        analysis: {
          insights: [],
          recommendations: [],
        },
        error: error instanceof Error ? error.message : 'Unknown error during entry analysis',
      };
    }
  }

  async analyzeBatch(entries: EntryForBatch[]): Promise<BatchAnalysisResult> {
    try {
      const analyses = await Promise.all(
        entries.map(entry =>
          this.analyzeEntry({
            userId: entry.userId,
            content: entry.content,
            type: entry.type || 'text',
            moodContext: entry.moodContext,
            analysisOptions: {
              includeInsights: true,
              includeRecommendations: false,
              includeMusicDecision: false,
            },
          })
        )
      );

      return {
        success: true,
        analyses: analyses.map(a => a.analysis),
      };
    } catch (error) {
      return {
        success: false,
        analyses: [],
        error: error instanceof Error ? error.message : 'Unknown error during batch analysis',
      };
    }
  }

  private generateRecommendations(insights: EntryInsight[]): string[] {
    const recommendations: string[] = [];

    insights.forEach(insight => {
      if (insight.actionableSuggestions && insight.actionableSuggestions.length > 0) {
        recommendations.push(...insight.actionableSuggestions);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Continue your reflection practice');
    }

    return Array.from(new Set(recommendations));
  }

  private generateMusicDecision(analysis: AnalysisData): MusicDecision {
    const sentiment = analysis.sentiment || 'neutral';
    const themes = analysis.themes || [];

    return {
      shouldGenerateMusic: themes.length > 0 || sentiment !== 'neutral',
      suggestedMood: sentiment,
      suggestedThemes: themes,
      confidence: 0.7,
    };
  }
}
