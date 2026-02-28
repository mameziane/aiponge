/**
 * Analyze Entry Use Case
 * Analyzes individual entries and generates insights
 */

import { IIntelligenceRepository } from '@domains/intelligence';
import { Entry, Insight } from '@infrastructure/database/schemas/profile-schema';
import { EntryAnalysisService } from '@domains/profile/services/EntryAnalysisService';
import { ContentServiceClient } from '@infrastructure/clients/ContentServiceClient';
import { ConfigServiceClient } from '@infrastructure/clients/ConfigServiceClient';
import { getLogger } from '@config/service-urls';
import { LibraryError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('user-service-analyzeentryusecase');

// Cache for LLM model name with TTL (5 minutes)
let cachedLlmModel: { model: string; fetchedAt: number } | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface AIAnalysisResult {
  sentiment: string;
  themes: string[];
  emotions: string[];
  complexity: 'high' | 'medium' | 'low';
  confidence: number;
  timestamp: Date;
  framework: string;
  keywords?: string[];
  insights?: string[];
}

export interface AnalyzeEntryRequest {
  entryId: string;
  userId: string;
  aiAnalysisResult?: AIAnalysisResult;
  generateInsights?: boolean;
}

export interface AnalyzeEntryResponse {
  entry: Entry;
  insights: Insight[];
  analysisMetrics: {
    confidenceScore: number;
    themes: string[];
    emotions: string[];
    processingTime: number;
  };
  recommendations: string[];
}

export class AnalyzeEntryUseCase {
  private entryAnalysisService: EntryAnalysisService;
  private templateSystemEnabled: boolean;
  private configClient: ConfigServiceClient;

  constructor(
    private intelligenceRepository: IIntelligenceRepository,
    entryAnalysisService?: EntryAnalysisService
  ) {
    this.entryAnalysisService = entryAnalysisService || new EntryAnalysisService(new ContentServiceClient());
    this.templateSystemEnabled = process.env.ENABLE_TEMPLATE_SYSTEM !== 'false';
    this.configClient = new ConfigServiceClient();
  }

  /**
   * Get LLM model name from database configuration (single source of truth)
   * Uses 5-minute TTL cache for performance
   */
  private async getLlmModel(): Promise<string> {
    // Check cache with TTL
    if (cachedLlmModel && Date.now() - cachedLlmModel.fetchedAt < MODEL_CACHE_TTL_MS) {
      return cachedLlmModel.model;
    }

    const model = await this.configClient.getLlmModel();
    cachedLlmModel = { model, fetchedAt: Date.now() };
    return model;
  }

  async execute(request: AnalyzeEntryRequest): Promise<AnalyzeEntryResponse> {
    const startTime = Date.now();

    try {
      // Get LLM model from database config (single source of truth)
      const llmModel = await this.getLlmModel();

      const entry = await this.intelligenceRepository.findEntryById(request.entryId);
      if (!entry) {
        throw LibraryError.entryNotFound(request.entryId);
      }

      if (entry.userId !== request.userId) {
        throw LibraryError.forbidden('User does not own this entry');
      }

      const aiAnalysis = request.aiAnalysisResult || this.simulateAIAnalysis(entry);

      const updatedEntry = await this.intelligenceRepository.updateEntry(request.entryId, {
        metadata: { ...(entry.metadata as Record<string, unknown>), aiAnalysis },
        processingStatus: 'processed',
      });

      let insights: Insight[] = [];
      if (request.generateInsights !== false) {
        insights = await this.generateInsights(updatedEntry, aiAnalysis, llmModel);

        for (const insightData of insights) {
          await this.intelligenceRepository.createInsight({
            userId: updatedEntry.userId,
            entryId: updatedEntry.id,
            type: insightData.type,
            title: insightData.title,
            content: insightData.content,
            confidence: insightData.confidence,
            category: insightData.category,
            themes: (insightData.themes || []) as string[],
            actionable: insightData.actionable || false,
            priority: insightData.priority ?? 5,
            aiProvider: insightData.aiProvider || 'openai',
            aiModel: insightData.aiModel || llmModel,
            metadata: (insightData.metadata || {}) as Record<string, unknown>,
          });
        }
      }

      const analysisMetrics = this.extractAnalysisMetrics(aiAnalysis, Date.now() - startTime);
      const recommendations = this.generateRecommendations(updatedEntry, insights, aiAnalysis);

      return {
        entry: updatedEntry,
        insights,
        analysisMetrics,
        recommendations,
      };
    } catch (error) {
      logger.error('Failed to analyze entry:', { error: serializeError(error) });
      if (error instanceof LibraryError) {
        throw error;
      }
      throw LibraryError.internalError('Entry analysis failed', error instanceof Error ? error : undefined);
    }
  }

  private simulateAIAnalysis(entry: Entry): AIAnalysisResult {
    const emotions = this.extractEmotions(entry.content);
    const wordCount = entry.content.split(/\s+/).length;

    return {
      sentiment: entry.sentiment || (emotions.length > 0 ? 'emotional' : 'neutral'),
      themes: entry.tags || this.extractThemes(entry.content),
      emotions,
      complexity: wordCount > 50 ? 'high' : wordCount > 20 ? 'medium' : 'low',
      confidence: 0.8,
      timestamp: new Date(),
      framework: 'cognitive_behavioral',
    };
  }

  private extractEmotions(content: string): string[] {
    const emotionalKeywords = ['happy', 'sad', 'angry', 'anxious', 'excited', 'worried', 'grateful', 'frustrated'];
    const lowerContent = content.toLowerCase();
    return emotionalKeywords.filter(emotion => lowerContent.includes(emotion));
  }

  private extractThemes(content: string): string[] {
    const themeKeywords = {
      relationships: ['friend', 'family', 'partner', 'love', 'relationship'],
      work: ['work', 'job', 'career', 'boss', 'colleague'],
      health: ['health', 'exercise', 'diet', 'sleep', 'medical'],
      personal_growth: ['learn', 'grow', 'improve', 'develop', 'better'],
      emotions: ['feel', 'emotion', 'happy', 'sad', 'angry', 'anxious'],
    };

    const themes: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        themes.push(theme);
      }
    }

    return themes;
  }

  private async generateInsights(entry: Entry, aiAnalysis: AIAnalysisResult, llmModel: string): Promise<Insight[]> {
    if (this.templateSystemEnabled) {
      return this.generateTemplateBasedInsights(entry, aiAnalysis, llmModel);
    }

    // ❌ NO FALLBACK - If template system is disabled, throw error
    throw LibraryError.aiGenerationFailed('Template system is disabled - cannot generate insights without AI');
  }

  private async generateTemplateBasedInsights(
    entry: Entry,
    aiAnalysis: AIAnalysisResult,
    llmModel: string
  ): Promise<Insight[]> {
    logger.info('🔬 Using template-enhanced insight generation for entry: {}', { data0: entry.id });

    const entryAnalysisRequest = {
      userId: entry.userId,
      content: entry.content,
      type: 'text' as const,
      moodContext: aiAnalysis.sentiment || 'neutral',
      analysisOptions: {
        includeInsights: true,
        includeMusicDecision: false,
        includeRecommendations: true,
      },
    };

    const analysisResult = await this.entryAnalysisService.analyzeEntry(entryAnalysisRequest);

    if (!analysisResult.success || !analysisResult.analysis.insights.length) {
      throw LibraryError.aiGenerationFailed(
        `Template-based insight generation failed: ${analysisResult.error || 'No insights generated'}`
      );
    }

    return analysisResult.analysis.insights.map(serviceInsight => ({
      id: '',
      userId: entry.userId,
      entryId: entry.id,
      type: this.mapInsightType(serviceInsight.type),
      title: serviceInsight.content.substring(0, 255),
      content: JSON.stringify(serviceInsight),
      confidence: String(serviceInsight.confidence || 0.8),
      category: this.mapInsightCategory(serviceInsight.type),
      themes: serviceInsight.themes || [],
      actionable: Boolean(serviceInsight.actionableSuggestions?.length),
      priority: 5,
      aiProvider: 'openai',
      aiModel: llmModel,
      generatedAt: new Date(),
      validatedAt: null,
      validatedBy: null,
      metadata: { framework: serviceInsight.framework },
      createdAt: new Date(),
    })) as Insight[];
  }

  private generateEnhancedFallbackInsights(entry: Entry, aiAnalysis: AIAnalysisResult): Insight[] {
    const insights: Insight[] = [];

    if (aiAnalysis.sentiment) {
      insights.push({
        id: '',
        userId: entry.userId,
        entryId: entry.id,
        type: 'emotional',
        title: `Emotional tone: ${aiAnalysis.sentiment}`,
        content: JSON.stringify({
          sentiment: aiAnalysis.sentiment,
          confidence: aiAnalysis.confidence || 0.8,
          explanation: `Your emotional expression reveals ${aiAnalysis.sentiment} patterns`,
        }),
        confidence: String(aiAnalysis.confidence || 0.8),
        category: 'wellness',
        themes: aiAnalysis.themes || [],
        actionable: false,
        priority: 5,
        aiProvider: 'openai',
        aiModel: 'gpt-4',
        generatedAt: new Date(),
        validatedAt: null,
        validatedBy: null,
        metadata: {},
        createdAt: new Date(),
      } as Insight);
    }

    if (aiAnalysis.themes?.length > 0) {
      insights.push({
        id: '',
        userId: entry.userId,
        entryId: entry.id,
        type: 'pattern',
        title: `Primary theme: ${aiAnalysis.themes[0]}`,
        content: JSON.stringify({
          themes: aiAnalysis.themes,
          primaryTheme: aiAnalysis.themes[0],
        }),
        confidence: '0.75',
        category: 'patterns',
        themes: aiAnalysis.themes,
        actionable: false,
        priority: 5,
        aiProvider: 'openai',
        aiModel: 'gpt-4',
        generatedAt: new Date(),
        validatedAt: null,
        validatedBy: null,
        metadata: {},
        createdAt: new Date(),
      } as Insight);
    }

    return insights;
  }

  private mapInsightType(serviceType: string): string {
    const typeMap: Record<string, string> = {
      sentiment: 'emotional',
      thematic: 'pattern',
      contextual: 'pattern',
      behavioral: 'behavioral',
    };
    return typeMap[serviceType] || 'pattern';
  }

  private mapInsightCategory(serviceType: string): string {
    const categoryMap: Record<string, string> = {
      sentiment: 'wellness',
      thematic: 'patterns',
      contextual: 'patterns',
      behavioral: 'growth',
    };
    return categoryMap[serviceType] || 'patterns';
  }

  private extractAnalysisMetrics(aiAnalysis: AIAnalysisResult, processingTime: number) {
    return {
      confidenceScore: aiAnalysis.confidence || 0.8,
      themes: aiAnalysis.themes || [],
      emotions: aiAnalysis.emotions || [],
      processingTime,
    };
  }

  private generateRecommendations(entry: Entry, insights: Insight[], aiAnalysis: AIAnalysisResult): string[] {
    const recommendations: string[] = [];

    if (aiAnalysis.sentiment === 'positive') {
      recommendations.push('Consider how to sustain this positive energy');
    } else if (aiAnalysis.sentiment === 'negative') {
      recommendations.push('Acknowledge these challenging feelings as valuable information');
    }

    if (aiAnalysis.themes?.includes('relationships')) {
      recommendations.push('Explore how your relationship patterns reflect your values');
    }

    recommendations.push('Continue this practice of entryful self-reflection');

    return recommendations.slice(0, 5);
  }
}
