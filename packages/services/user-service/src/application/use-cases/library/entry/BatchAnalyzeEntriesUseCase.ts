/**
 * Batch Analyze Entries Use Case
 * Analyzes multiple entries in batch for efficiency
 */

import { IIntelligenceRepository } from '@domains/intelligence';
import { Insight, type NewInsight } from '@infrastructure/database/schemas/profile-schema';
import { Entry } from '@infrastructure/database/schemas/library-schema';
import { getLogger } from '@config/service-urls';
import { ContentServiceClient } from '@infrastructure/clients/ContentServiceClient';
import { LibraryError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('user-service-batchanalyzeentriesusecase');

interface EntryAnalysis {
  entryId?: string;
  timestamp?: Date;
  sentiment?: {
    tone: string;
    emotions?: string[];
    intensity?: 'high' | 'medium' | 'low';
    score?: number;
    keywords?: string[];
  };
  themes?: string[];
  confidence?: number;
  cognitive?: {
    complexity?: 'high' | 'medium' | 'low';
    clarityLevel?: 'high' | 'medium' | 'low';
    reasoning?: string[];
  };
  cognitivePatterns?: string[];
  emotionalMarkers?: string[];
}

interface EmotionalPattern {
  name: string;
  description: string;
  frequency: number;
  examples: string[];
}

interface CognitivePattern {
  name: string;
  description: string;
  frequency: number;
  examples: string[];
}

interface AnalyzedEntry {
  entry: Entry;
  analysis: EntryAnalysis;
  insights: Insight[];
}

export interface BatchAnalyzeEntriesRequest {
  userId: string;
  entryIds?: string[];
  analysisTypes: string[];
  timeWindow?: {
    start: Date;
    end: Date;
  };
  maxEntries?: number;
  includeInsights?: boolean;
  language?: string;
}

interface FailedEntry {
  entryId: string;
  error: string;
  retryable: boolean;
}

export interface BatchAnalysisResult {
  userId: string;
  analyzedEntries: AnalyzedEntry[];
  aggregateInsights: {
    overallSentiment: string;
    dominantThemes: string[];
    emotionalPatterns: EmotionalPattern[];
    cognitivePatterns: CognitivePattern[];
    confidenceScore: number;
  };
  recommendations: string[];
  processingStats: {
    totalEntries: number;
    successfullyAnalyzed: number;
    failedEntries: number;
    analysisTime: number;
    confidence: number;
  };
  failures: FailedEntry[];
  partialSuccess: boolean;
  generatedAt: Date;
}

export class BatchAnalyzeEntriesUseCase {
  private contentServiceClient: ContentServiceClient;

  constructor(private intelligenceRepository: IIntelligenceRepository) {
    this.contentServiceClient = ContentServiceClient.getInstance();
  }

  async execute(request: BatchAnalyzeEntriesRequest): Promise<BatchAnalysisResult> {
    const startTime = Date.now();

    try {
      this.validateRequest(request);

      const entries = await this.getEntriesToAnalyze(request);

      if (entries.length === 0) {
        throw LibraryError.notFound('No entries found to analyze');
      }

      logger.info('Analyzing entries for user', {
        count: entries.length,
        userId: request.userId,
        language: request.language,
      });

      const { analyzedEntries, failures } = await this.analyzeIndividualEntries(
        entries,
        request.analysisTypes,
        request.language
      );
      const aggregateInsights = await this.generateAggregateInsights(analyzedEntries, entries);
      const recommendations = await this.generateRecommendations(aggregateInsights, analyzedEntries);

      const processingTime = Date.now() - startTime;
      const processingStats = {
        totalEntries: entries.length,
        successfullyAnalyzed: analyzedEntries.length,
        failedEntries: failures.length,
        analysisTime: processingTime,
        confidence: this.calculateOverallConfidence(analyzedEntries),
      };

      return {
        userId: request.userId,
        analyzedEntries,
        aggregateInsights,
        recommendations,
        processingStats,
        failures,
        partialSuccess: failures.length > 0 && analyzedEntries.length > 0,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to batch analyze entries', {
        userId: request.userId,
        error: serializeError(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (error instanceof LibraryError) {
        throw error;
      }
      throw LibraryError.internalError('Failed to batch analyze entries', error instanceof Error ? error : undefined);
    }
  }

  private validateRequest(request: BatchAnalyzeEntriesRequest): void {
    if (!request.userId?.trim()) {
      throw LibraryError.userIdRequired();
    }

    if (!request.analysisTypes || request.analysisTypes.length === 0) {
      throw LibraryError.validationError('analysisTypes', 'At least one analysis type is required');
    }

    const maxEntries = request.maxEntries;
    if (maxEntries && maxEntries > 1000) {
      throw LibraryError.validationError('maxEntries', 'Maximum entries limit is 1000');
    }

    if (request.timeWindow) {
      const { start, end } = request.timeWindow;
      if (start >= end) {
        throw LibraryError.invalidDateRange(start, end);
      }
    }
  }

  private async getEntriesToAnalyze(request: BatchAnalyzeEntriesRequest): Promise<Entry[]> {
    if (request.entryIds) {
      return this.intelligenceRepository.findEntriesByIds(request.entryIds, request.userId);
    } else {
      let entries = await this.intelligenceRepository.findEntriesByUserId(request.userId, request.maxEntries || 100);

      if (request.maxEntries && entries.length > request.maxEntries) {
        entries = entries.slice(0, request.maxEntries);
      }

      return entries;
    }
  }

  private async analyzeIndividualEntries(
    entries: Entry[],
    analysisTypes: string[],
    language?: string
  ): Promise<{ analyzedEntries: AnalyzedEntry[]; failures: FailedEntry[] }> {
    const analyzedEntries: AnalyzedEntry[] = [];
    const failures: FailedEntry[] = [];
    const allInsightsToCreate: Array<{
      userId: string;
      entryId: string;
      type: string;
      title: string;
      content: string;
      confidence: string | number;
      category: string;
      themes: string[];
      actionable: boolean;
      priority: string | number;
      aiProvider?: string;
      aiModel?: string;
      metadata: Record<string, unknown>;
    }> = [];
    const successfulEntryIds: string[] = [];

    const CHUNK_SIZE = 50;
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);

      for (const entry of chunk) {
        try {
          const analysis = this.performIndividualAnalysis(entry, analysisTypes);
          const insights = await this.generateInsightsWithRetry(entry, analysis, language);

          for (const insightData of insights) {
            allInsightsToCreate.push({
              userId: entry.userId,
              entryId: entry.id,
              type: insightData.type,
              title: insightData.title,
              content: insightData.content,
              confidence: insightData.confidence ?? 0.8,
              category: insightData.category,
              themes: (insightData.themes || []) as string[],
              actionable: insightData.actionable || false,
              priority: insightData.priority ?? 5,
              aiProvider: insightData.aiProvider,
              aiModel: insightData.aiModel,
              metadata: (insightData.metadata || {}) as Record<string, unknown>,
            });
          }

          successfulEntryIds.push(entry.id);
          analyzedEntries.push({ entry, analysis, insights });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isRetryable = errorMessage.includes('timeout') || errorMessage.includes('rate limit');

          logger.warn('Failed to analyze entry', {
            entryId: entry.id,
            error: errorMessage,
            retryable: isRetryable,
          });

          failures.push({
            entryId: entry.id,
            error: errorMessage,
            retryable: isRetryable,
          });
        }
      }

      if (allInsightsToCreate.length > 0) {
        await this.intelligenceRepository.createInsightsBulk(allInsightsToCreate as unknown as NewInsight[]);
        allInsightsToCreate.length = 0;
      }
    }

    if (successfulEntryIds.length > 0) {
      await this.intelligenceRepository.updateEntriesBatch(successfulEntryIds, {
        processingStatus: 'processed',
      });
    }

    return { analyzedEntries, failures };
  }

  private async generateInsightsWithRetry(
    entry: Entry,
    analysis: EntryAnalysis,
    language?: string,
    maxRetries: number = 2
  ): Promise<Insight[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateInsightsFromAnalysis(entry, analysis, language);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          logger.info('Retrying insight generation', { entryId: entry.id, attempt: attempt + 1 });
        }
      }
    }

    throw lastError;
  }

  private performIndividualAnalysis(entry: Entry, analysisTypes: string[]): EntryAnalysis {
    const analysis: EntryAnalysis = {
      entryId: entry.id,
      timestamp: new Date(),
      confidence: 0.8,
    };

    if (analysisTypes.includes('sentiment')) {
      const intensity = entry.emotionalIntensity;
      analysis.sentiment = {
        tone: entry.sentiment || 'neutral',
        emotions: [],
        intensity: intensity ? (intensity > 7 ? 'high' : intensity > 4 ? 'medium' : 'low') : 'low',
      };
    }

    if (analysisTypes.includes('themes')) {
      analysis.themes = entry.tags || [];
    }

    if (analysisTypes.includes('cognitive')) {
      const wordCount = entry.content.split(/\s+/).length;
      analysis.cognitive = {
        complexity: wordCount > 50 ? 'high' : 'medium',
        clarityLevel: 'medium',
        reasoning: [],
      };
    }

    return analysis;
  }

  private async generateInsightsFromAnalysis(
    entry: Entry,
    analysis: EntryAnalysis,
    language?: string
  ): Promise<Insight[]> {
    const insights: Insight[] = [];

    logger.info('Generating template-based insight for entry', {
      entryId: entry.id,
      contentLength: entry.content?.length,
      sentiment: analysis.sentiment?.tone,
      language: language || 'en',
    });

    const aiResult = await this.contentServiceClient.generateInsights(entry.content, {
      userId: entry.userId,
      entryId: entry.id,
      analysisType: 'insight',
      language: language,
    });

    logger.info('AI insight generation result', {
      success: aiResult.insights?.length > 0,
      insightCount: aiResult.insights?.length || 0,
      confidence: aiResult.confidence,
    });

    if (!aiResult.insights || aiResult.insights.length === 0) {
      throw LibraryError.aiGenerationFailed('AI Content Service returned no insights');
    }

    const generatedInsight = aiResult.insights[0];

    insights.push({
      id: '',
      userId: entry.userId,
      entryId: entry.id,
      type: 'emotional',
      title: `Insight: ${analysis.sentiment?.tone || 'Reflection'}`,
      content: generatedInsight,
      confidence: aiResult.confidence || 0.8,
      category: 'wellness',
      themes: analysis.themes || [],
      actionable: true,
      priority: 5,
      aiProvider: 'ai-content-service',
      aiModel: 'template-based',
      generatedAt: new Date(),
      metadata: {
        sentiment: analysis.sentiment,
        originalEntryLength: entry.content?.length || 0,
        templateId: 'entry-analysis',
      },
      createdAt: new Date(),
    } as unknown as Insight);

    return insights;
  }

  private async generateAggregateInsights(analyzedEntries: AnalyzedEntry[], originalEntries: Entry[]) {
    if (analyzedEntries.length === 0) {
      return {
        overallSentiment: 'neutral',
        dominantThemes: [],
        emotionalPatterns: [],
        cognitivePatterns: [],
        confidenceScore: 0,
      };
    }

    const allAnalyses = analyzedEntries.map(at => at.analysis);

    const sentiments = allAnalyses.map(a => a.sentiment?.tone).filter(Boolean);
    const overallSentiment = this.getMostCommon(sentiments) || 'neutral';

    const allThemes = allAnalyses.flatMap(a => a.themes || []);
    const dominantThemes = this.getTopN(allThemes, 5);

    const emotionalPatterns: EmotionalPattern[] = [];
    const cognitivePatterns: CognitivePattern[] = [];

    const confidenceScore = allAnalyses.reduce((sum, a) => sum + (a.confidence || 0.8), 0) / allAnalyses.length;

    return {
      overallSentiment,
      dominantThemes,
      emotionalPatterns,
      cognitivePatterns,
      confidenceScore,
    };
  }

  private getMostCommon<T>(items: T[]): T | undefined {
    if (items.length === 0) return undefined;

    const counts = items.reduce(
      (acc, item) => {
        acc[item as string] = (acc[item as string] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return Object.entries(counts).reduce(
      (max, [item, count]) => (count > (counts[max] || 0) ? item : max),
      items[0] as string
    ) as T;
  }

  private getTopN<T>(items: T[], n: number): T[] {
    const counts = items.reduce(
      (acc, item) => {
        acc[item as string] = (acc[item as string] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([item]) => item as T);
  }

  private calculateOverallConfidence(analyzedEntries: AnalyzedEntry[]): number {
    if (analyzedEntries.length === 0) return 0;

    const confidences = analyzedEntries.map(at => at.analysis.confidence || 0.8);
    return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
  }

  private async generateRecommendations(
    aggregateInsights: BatchAnalysisResult['aggregateInsights'],
    analyzedEntries: AnalyzedEntry[]
  ): Promise<string[]> {
    const recommendations = [];

    if (aggregateInsights.overallSentiment === 'emotional') {
      recommendations.push('Consider developing emotional regulation strategies');
    }

    if (aggregateInsights.dominantThemes.includes('work')) {
      recommendations.push('Reflect on your work-life balance and professional fulfillment');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue this valuable practice of self-reflection');
    }

    return recommendations.slice(0, 5);
  }
}
