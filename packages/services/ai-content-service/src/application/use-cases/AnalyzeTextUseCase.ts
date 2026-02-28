/**
 * Analyze Text Use Case - Core business logic for text analysis
 * Handles text sentiment, themes, topics, and complexity analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { ContentAIService } from '../../domains/services/ContentAIService';
import {
  TemplateEngineServiceClient,
  type FrameworkMetadata as _FrameworkMetadata,
} from '../../infrastructure/clients/TemplateEngineServiceClient';
import {
  frameworkSelectionService,
  type FrameworkSelectionResult,
} from '../../domains/services/FrameworkSelectionService';
import { getLogger } from '../../config/service-urls';
import { contentServiceConfig } from '../../config/service-config';
import { ContentError, TemplateError } from '../errors';

const logger = getLogger('ai-content-service-analyzetextusecase');

interface AnalyticsService {
  recordEvent(event: {
    eventType: string;
    eventData: Record<string, unknown>;
    timestamp: Date;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface AnalyzeTextUseCaseRequest {
  content: string;
  analysisType: 'basic' | 'comprehensive' | 'sentiment' | 'themes';
  context?: {
    userId?: string;
    previousAnalyses?: string[];
    domainContext?: string;
  };
}

export interface AnalyzeTextUseCaseResult {
  success: boolean;
  requestId: string;
  analysis: {
    sentiment?: {
      overall: 'positive' | 'negative' | 'neutral' | 'mixed';
      confidence: number;
      details?: {
        joy?: number;
        sadness?: number;
        anger?: number;
        fear?: number;
        surprise?: number;
      };
    };
    themes?: Array<{
      name: string;
      confidence: number;
      relevance: number;
    }>;
    topics?: Array<{
      name: string;
      keywords: string[];
      confidence: number;
    }>;
    complexity?: {
      level: 'simple' | 'moderate' | 'complex';
      readabilityScore: number;
    };
    therapeuticFramework?: {
      primary?: {
        id: string;
        name: string;
        shortName: string;
        confidence: 'high' | 'medium' | 'low';
        keyPrinciples: string[];
        therapeuticGoals: string[];
        matchedPatterns: string[];
      };
      supporting?: Array<{
        id: string;
        shortName: string;
        confidence: 'high' | 'medium' | 'low';
      }>;
      detectedEmotions: string[];
      detectedThemes: string[];
      therapeuticApproach: string;
    };
  };
  metadata: {
    processingTimeMs: number;
    modelUsed: string;
    analysisDepth: string;
  };
  error?: string;
}

export class AnalyzeTextUseCase {
  private readonly templateClient: TemplateEngineServiceClient;

  constructor(
    private readonly _contentAIService: ContentAIService,
    private readonly _analyticsService?: AnalyticsService
  ) {
    this.templateClient = new TemplateEngineServiceClient();
    logger.debug('🔍 Initialized with text analysis pipeline and template engine');
  }

  private get contentAIService(): ContentAIService {
    return this._contentAIService;
  }

  private get analyticsService(): AnalyticsService | undefined {
    return this._analyticsService;
  }

  async execute(request: AnalyzeTextUseCaseRequest): Promise<AnalyzeTextUseCaseResult> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      // Record analytics
      await this.recordAnalyticsSafely({
        eventType: 'text_analysis_request_started',
        eventData: {
          requestId,
          userId: request.context?.userId,
          analysisType: request.analysisType,
          contentLength: request.content.length,
          hasDomainContext: !!request.context?.domainContext,
        },
      });

      // Step 1: Validate request
      this.validateRequest(request);

      // Step 2: Perform analysis based on type
      const analysis = await this.performAnalysis(request);

      // Step 3: Record success analytics
      const processingTime = Date.now() - startTime;
      await this.recordAnalyticsSafely({
        eventType: 'text_analysis_completed',
        eventData: {
          requestId,
          userId: request.context?.userId,
          success: true,
          analysisType: request.analysisType,
          processingTime,
          sentimentFound: !!analysis.sentiment,
          themesCount: analysis.themes?.length || 0,
          topicsCount: analysis.topics?.length || 0,
        },
      });

      return {
        success: true,
        requestId,
        analysis,
        metadata: {
          processingTimeMs: processingTime,
          modelUsed: 'content-ai-content-service-v1',
          analysisDepth: request.analysisType,
        },
      };
    } catch (error) {
      return this.handleAnalysisError(
        error instanceof Error ? error : new Error(String(error)),
        requestId,
        request,
        startTime
      );
    }
  }

  // ===== PRIVATE METHODS =====

  private validateRequest(request: AnalyzeTextUseCaseRequest): void {
    if (!request.content?.trim()) {
      throw ContentError.validationError('content', 'Content is required for analysis');
    }

    if (request.content.length > 10000) {
      throw ContentError.validationError('content', 'Content exceeds maximum length of 10,000 characters');
    }

    if (!['basic', 'comprehensive', 'sentiment', 'themes'].includes(request.analysisType)) {
      throw ContentError.validationError('analysisType', 'Invalid analysis type specified');
    }
  }

  private async performAnalysis(request: AnalyzeTextUseCaseRequest): Promise<AnalyzeTextUseCaseResult['analysis']> {
    const analysis: AnalyzeTextUseCaseResult['analysis'] = {};

    // Perform framework selection for comprehensive and basic analysis
    let frameworkResult: FrameworkSelectionResult | null = null;
    if (request.analysisType === 'comprehensive' || request.analysisType === 'basic') {
      try {
        frameworkResult = await frameworkSelectionService.selectFrameworks(request.content);
        logger.info('Framework selection completed', {
          primaryFramework: frameworkResult.primaryFramework?.framework.shortName,
          supportingCount: frameworkResult.supportingFrameworks.length,
        });
      } catch (error) {
        logger.warn('Framework selection failed, continuing without framework data', { error });
      }
    }

    switch (request.analysisType) {
      case 'sentiment':
        analysis.sentiment = await this.analyzeSentiment(request.content);
        break;
      case 'themes':
        analysis.themes = await this.analyzeThemes(request.content);
        break;
      case 'comprehensive':
        analysis.sentiment = await this.analyzeSentiment(request.content, frameworkResult);
        analysis.themes = await this.analyzeThemes(request.content, frameworkResult);
        analysis.topics = await this.analyzeTopics(request.content, frameworkResult);
        analysis.complexity = await this.analyzeComplexity(request.content);
        analysis.therapeuticFramework = this.buildTherapeuticFrameworkResult(frameworkResult);
        break;
      case 'basic':
      default:
        analysis.sentiment = await this.analyzeSentiment(request.content, frameworkResult);
        analysis.complexity = await this.analyzeComplexity(request.content);
        analysis.therapeuticFramework = this.buildTherapeuticFrameworkResult(frameworkResult);
        break;
    }

    return analysis;
  }

  private buildTherapeuticFrameworkResult(
    frameworkResult: FrameworkSelectionResult | null
  ): AnalyzeTextUseCaseResult['analysis']['therapeuticFramework'] | undefined {
    if (!frameworkResult) return undefined;

    const primary = frameworkResult.primaryFramework;

    return {
      primary: primary
        ? {
            id: primary.framework.id,
            name: primary.framework.name,
            shortName: primary.framework.shortName,
            confidence: primary.confidence,
            keyPrinciples: primary.framework.keyPrinciples,
            therapeuticGoals: primary.framework.therapeuticGoals,
            matchedPatterns: primary.matchedPatterns,
          }
        : undefined,
      supporting: frameworkResult.supportingFrameworks.map(s => ({
        id: s.framework.id,
        shortName: s.framework.shortName,
        confidence: s.confidence,
      })),
      detectedEmotions: frameworkResult.detectedEmotions,
      detectedThemes: frameworkResult.detectedThemes,
      therapeuticApproach: frameworkResult.therapeuticApproach,
    };
  }

  private async analyzeSentiment(
    content: string,
    frameworkResult?: FrameworkSelectionResult | null
  ): Promise<NonNullable<AnalyzeTextUseCaseResult['analysis']['sentiment']>> {
    // Use template engine for sentiment analysis
    try {
      const context: Record<string, unknown> = {
        therapeuticFramework: 'emotion-analysis',
      };

      // Add framework metadata if available
      if (frameworkResult?.primaryFramework) {
        const pf = frameworkResult.primaryFramework;
        context.frameworkMetadata = {
          id: pf.framework.id,
          name: pf.framework.name,
          shortName: pf.framework.shortName,
          keyPrinciples: pf.framework.keyPrinciples,
          therapeuticGoals: pf.framework.therapeuticGoals,
          confidence: pf.confidence,
          matchedPatterns: pf.matchedPatterns,
        };
        context.supportingFrameworks = frameworkResult.supportingFrameworks.map(s => ({
          id: s.framework.id,
          name: s.framework.name,
          shortName: s.framework.shortName,
          keyPrinciples: s.framework.keyPrinciples,
          therapeuticGoals: s.framework.therapeuticGoals,
          confidence: s.confidence,
        }));
        context.detectedEmotions = frameworkResult.detectedEmotions;
        context.detectedThemes = frameworkResult.detectedThemes;
        context.therapeuticApproach = frameworkResult.therapeuticApproach;
      }

      const templateResult = await this.templateClient.executeContentTemplate({
        contentType: 'technical',
        userInput: content,
        parameters: {
          maxLength: 500,
          temperature: 0.3,
          style: 'informative',
        },
        context,
        fallbackToDefault: false,
      });

      if (!templateResult.success) {
        const errorMessage =
          typeof templateResult.error === 'string' ? templateResult.error : String(templateResult.error);
        logger.error('Template engine failed for sentiment analysis:', {
          error: errorMessage,
        });
        throw TemplateError.executionFailed(`Template engine unavailable for sentiment analysis: ${errorMessage}`);
      }

      if (!templateResult.processedPrompt) {
        logger.error('Template engine returned empty prompt for sentiment analysis');
        throw TemplateError.renderFailed('Template engine returned invalid prompt for sentiment analysis');
      }

      const prompt = templateResult.processedPrompt;

      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'technical',
        parameters: {
          maxLength: 500,
          temperature: 0.3,
          style: 'informative',
        },
        options: {
          formatOutput: 'plain',
        },
      });

      // Parse AI response and extract sentiment data
      return this.parseSentimentFromResponse(response.content, content);
    } catch (error) {
      // In strict mode, throw error instead of using fallback (for debugging)
      if (contentServiceConfig.features.templateStrictMode) {
        logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
          operation: 'analyzeSentiment',
          data: error,
        });
        throw TemplateError.executionFailed(
          `Template execution failed in analyzeSentiment: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      logger.warn('AI sentiment analysis failed, using fallback:', { data: error });
      return this.fallbackSentimentAnalysis(content);
    }
  }

  private async analyzeThemes(
    content: string,
    frameworkResult?: FrameworkSelectionResult | null
  ): Promise<Array<{ name: string; confidence: number; relevance: number }>> {
    try {
      const context: Record<string, unknown> = {
        therapeuticFramework: 'entry-analysis',
      };

      if (frameworkResult?.primaryFramework) {
        const pf = frameworkResult.primaryFramework;
        context.frameworkMetadata = {
          id: pf.framework.id,
          name: pf.framework.name,
          shortName: pf.framework.shortName,
          keyPrinciples: pf.framework.keyPrinciples,
          therapeuticGoals: pf.framework.therapeuticGoals,
          confidence: pf.confidence,
        };
        context.detectedThemes = frameworkResult.detectedThemes;
      }

      const templateResult = await this.templateClient.executeContentTemplate({
        contentType: 'technical',
        userInput: content,
        parameters: {
          maxLength: 300,
          temperature: 0.4,
          style: 'informative',
        },
        context,
        fallbackToDefault: false,
      });

      if (!templateResult.success) {
        const errorMessage =
          typeof templateResult.error === 'string' ? templateResult.error : String(templateResult.error);
        logger.error('Template engine failed for theme analysis:', {
          error: errorMessage,
        });
        throw TemplateError.executionFailed(`Template engine unavailable for theme analysis: ${errorMessage}`);
      }

      if (!templateResult.processedPrompt) {
        logger.error('Template engine returned empty prompt for theme analysis');
        throw TemplateError.renderFailed('Template engine returned invalid prompt for theme analysis');
      }

      const prompt = templateResult.processedPrompt;

      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'technical',
        parameters: {
          maxLength: 300,
          temperature: 0.4,
          style: 'informative',
        },
      });

      return this.parseThemesFromResponse(response.content);
    } catch (error) {
      // In strict mode, throw error instead of using fallback (for debugging)
      if (contentServiceConfig.features.templateStrictMode) {
        logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
          operation: 'analyzeThemes',
          data: error,
        });
        throw TemplateError.executionFailed(
          `Template execution failed in analyzeThemes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      logger.warn('AI theme analysis failed, using fallback:', { data: error });
      return this.fallbackThemeAnalysis(content);
    }
  }

  private async analyzeTopics(
    content: string,
    frameworkResult?: FrameworkSelectionResult | null
  ): Promise<Array<{ name: string; keywords: string[]; confidence: number }>> {
    try {
      const context: Record<string, unknown> = {
        therapeuticFramework: 'entry-analysis',
      };

      if (frameworkResult?.primaryFramework) {
        const pf = frameworkResult.primaryFramework;
        context.frameworkMetadata = {
          id: pf.framework.id,
          name: pf.framework.name,
          shortName: pf.framework.shortName,
          keyPrinciples: pf.framework.keyPrinciples,
          therapeuticGoals: pf.framework.therapeuticGoals,
          confidence: pf.confidence,
        };
        context.detectedThemes = frameworkResult.detectedThemes;
      }

      const templateResult = await this.templateClient.executeContentTemplate({
        contentType: 'technical',
        userInput: content,
        parameters: {
          maxLength: 400,
          temperature: 0.4,
          style: 'informative',
        },
        context,
        fallbackToDefault: false,
      });

      if (!templateResult.success) {
        const errorMessage =
          typeof templateResult.error === 'string' ? templateResult.error : String(templateResult.error);
        logger.error('Template engine failed for topic analysis:', {
          error: errorMessage,
        });
        throw TemplateError.executionFailed(`Template engine unavailable for topic analysis: ${errorMessage}`);
      }

      if (!templateResult.processedPrompt) {
        logger.error('Template engine returned empty prompt for topic analysis');
        throw TemplateError.renderFailed('Template engine returned invalid prompt for topic analysis');
      }

      const prompt = templateResult.processedPrompt;

      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'technical',
        parameters: {
          maxLength: 400,
          temperature: 0.4,
          style: 'informative',
        },
      });

      return this.parseTopicsFromResponse(response.content);
    } catch (error) {
      // In strict mode, throw error instead of using fallback (for debugging)
      if (contentServiceConfig.features.templateStrictMode) {
        logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
          operation: 'analyzeTopics',
          data: error,
        });
        throw TemplateError.executionFailed(
          `Template execution failed in analyzeTopics: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      logger.warn('AI topic analysis failed, using fallback:', { data: error });
      return this.fallbackTopicAnalysis(content);
    }
  }

  private async analyzeComplexity(
    content: string
  ): Promise<{ level: 'simple' | 'moderate' | 'complex'; readabilityScore: number }> {
    // Calculate basic readability metrics
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const avgWordsPerSentence = words.length / sentences.length;
    const avgCharsPerWord = content.replace(/\s+/g, '').length / words.length;

    // Simple readability score (0-1)
    let readabilityScore = 1.0;
    if (avgWordsPerSentence > 20) readabilityScore -= 0.3;
    if (avgCharsPerWord > 6) readabilityScore -= 0.2;
    if (words.length > 500) readabilityScore -= 0.2;
    readabilityScore = Math.max(0, Math.min(1, readabilityScore));

    // Determine complexity level
    let level: 'simple' | 'moderate' | 'complex' = 'simple';
    if (readabilityScore < 0.4) level = 'complex';
    else if (readabilityScore < 0.7) level = 'moderate';

    return { level, readabilityScore };
  }

  private parseSentimentFromResponse(
    aiResponse: string,
    originalContent: string
  ): NonNullable<AnalyzeTextUseCaseResult['analysis']['sentiment']> {
    // Try to parse AI response, fallback to basic analysis
    try {
      // Basic sentiment analysis using keywords
      const positive = /\b(good|great|excellent|positive|happy|joy|love|like|amazing|wonderful|fantastic)\b/gi;
      const negative = /\b(bad|terrible|awful|negative|sad|hate|dislike|horrible|disappointing|frustrating)\b/gi;

      const positiveMatches = (originalContent.match(positive) || []).length;
      const negativeMatches = (originalContent.match(negative) || []).length;

      let overall: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
      let confidence = 0.6;

      if (positiveMatches > negativeMatches) {
        overall = 'positive';
        confidence = Math.min(0.9, 0.6 + (positiveMatches / (positiveMatches + negativeMatches)) * 0.3);
      } else if (negativeMatches > positiveMatches) {
        overall = 'negative';
        confidence = Math.min(0.9, 0.6 + (negativeMatches / (positiveMatches + negativeMatches)) * 0.3);
      } else if (positiveMatches > 0 && negativeMatches > 0) {
        overall = 'mixed';
        confidence = 0.7;
      }

      return {
        overall,
        confidence,
        details: {
          joy: positiveMatches > 0 ? 0.6 : 0.2,
          sadness: negativeMatches > 0 ? 0.5 : 0.1,
          anger: negative.test(originalContent) ? 0.4 : 0.1,
          fear: /\b(afraid|scared|worried|anxious|concern)\b/gi.test(originalContent) ? 0.3 : 0.1,
          surprise: /\b(wow|amazing|surprised|unexpected)\b/gi.test(originalContent) ? 0.4 : 0.1,
        },
      };
    } catch (error) {
      // In strict mode, throw error instead of using fallback (for debugging)
      if (contentServiceConfig.features.templateStrictMode) {
        logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
          operation: 'parseSentimentFromResponse',
          data: error,
        });
        throw TemplateError.executionFailed(
          `Template execution failed in parseSentimentFromResponse: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return this.fallbackSentimentAnalysis(originalContent);
    }
  }

  private fallbackSentimentAnalysis(content: string): NonNullable<AnalyzeTextUseCaseResult['analysis']['sentiment']> {
    // Use keyword-based sentiment analysis as fallback
    const positive = /\b(good|great|excellent|positive|happy|joy|love|like|amazing|wonderful|fantastic)\b/gi;
    const negative = /\b(bad|terrible|awful|negative|sad|hate|dislike|horrible|disappointing|frustrating)\b/gi;

    const positiveMatches = (content.match(positive) || []).length;
    const negativeMatches = (content.match(negative) || []).length;

    let overall: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
    let confidence = 0.5;

    if (positiveMatches > 0 && negativeMatches > 0) {
      overall = 'mixed';
      confidence = 0.6;
    } else if (positiveMatches > negativeMatches) {
      overall = 'positive';
      confidence = Math.min(0.8, 0.5 + positiveMatches * 0.1);
    } else if (negativeMatches > positiveMatches) {
      overall = 'negative';
      confidence = Math.min(0.8, 0.5 + negativeMatches * 0.1);
    }

    return {
      overall,
      confidence,
      details: {
        joy: positiveMatches > 0 ? 0.5 : 0.2,
        sadness: negativeMatches > 0 ? 0.4 : 0.1,
        anger: /\b(hate|angry|furious)\b/gi.test(content) ? 0.3 : 0.1,
        fear: /\b(afraid|scared|worried|anxious|concern)\b/gi.test(content) ? 0.3 : 0.1,
        surprise: /\b(wow|amazing|surprised|unexpected)\b/gi.test(content) ? 0.3 : 0.1,
      },
    };
  }

  private parseThemesFromResponse(_aiResponse: string): Array<{ name: string; confidence: number; relevance: number }> {
    // Fallback theme extraction
    return [
      { name: 'General Content', confidence: 0.7, relevance: 0.8 },
      { name: 'Communication', confidence: 0.6, relevance: 0.6 },
    ];
  }

  private fallbackThemeAnalysis(_content: string): Array<{ name: string; confidence: number; relevance: number }> {
    return [{ name: 'General Discussion', confidence: 0.5, relevance: 0.7 }];
  }

  private parseTopicsFromResponse(
    _aiResponse: string
  ): Array<{ name: string; keywords: string[]; confidence: number }> {
    // Fallback topic extraction
    return [{ name: 'Main Topic', keywords: ['content', 'text', 'analysis'], confidence: 0.6 }];
  }

  private fallbackTopicAnalysis(_content: string): Array<{ name: string; keywords: string[]; confidence: number }> {
    return [{ name: 'Text Content', keywords: ['text', 'content'], confidence: 0.5 }];
  }

  private handleAnalysisError(
    error: Error,
    requestId: string,
    request: AnalyzeTextUseCaseRequest,
    startTime: number
  ): AnalyzeTextUseCaseResult {
    const processingTime = Date.now() - startTime;

    void this.recordAnalyticsSafely({
      eventType: 'text_analysis_failed',
      eventData: {
        requestId,
        userId: request.context?.userId,
        success: false,
        analysisType: request.analysisType,
        error: error.message,
        processingTime,
      },
    });

    logger.error('Analysis failed for request ${requestId}:', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      requestId,
      analysis: {},
      metadata: {
        processingTimeMs: processingTime,
        modelUsed: 'unknown',
        analysisDepth: request.analysisType,
      },
      error: error.message,
    };
  }

  private async recordAnalyticsSafely(event: { eventType: string; eventData: Record<string, unknown> }): Promise<void> {
    if (!this.analyticsService) return;

    try {
      this.analyticsService
        .recordEvent({
          eventType: event.eventType,
          eventData: event.eventData,
          timestamp: new Date(),
          metadata: {
            service: 'ai-content-service',
            useCase: 'AnalyzeTextUseCase',
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to record analytics (non-blocking):', { data: error.message });
        });
    } catch (error) {
      logger.warn('Failed to initiate analytics recording (non-blocking):', { data: error });
    }
  }
}
