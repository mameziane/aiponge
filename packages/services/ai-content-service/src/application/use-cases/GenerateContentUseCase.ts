/**
 * Generate Content Use Case - Core business logic for content generation
 * Adapted from ai-content-service GenerateContentUseCase for content service architecture
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ContentAIService,
  ContentGenerationRequest,
  ContentGenerationResponse,
} from '../../domains/services/ContentAIService';
import { ContentTemplateService } from '../../domains/services/ContentTemplateService';
import { GenerationRequest, GenerationParameters, GenerationOptions } from '../../domains/entities/GenerationRequest';
import { Content, ContentType } from '../../domains/entities/Content';
import { ContentQuality } from '../../domains/value-objects/ContentQuality';
import { getLogger } from '../../config/service-urls';
import { ContentError } from '../errors';

const logger = getLogger('ai-content-service-generatecontentusecase');

interface AnalyticsService {
  recordEvent(event: {
    eventType: string;
    eventData: Record<string, unknown>;
    timestamp: Date;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

interface ExtendedGenerationParameters extends GenerationParameters {
  mood?: string;
  framework?: string;
  analysis_focus?: string;
  analysis_depth?: string;
  therapeutic_goal?: string;
  cultural_context?: string;
  output_format?: string;
  emotional_context?: string;
  primary_goal?: string;
  complexity_preference?: string;
  support_type?: string;
  motivation_type?: string;
  communication_style?: string;
  cultural_sensitivity?: string;
  verbosity?: string;
  emotional_intensity?: string;
  targetLanguages?: string[];
  isBilingual?: boolean;
  currentMood?: string;
  narrativeSeeds?: string[];
  narrativeEmotionalContext?: string;
  displayName?: string;
  // Persona-based personalization parameters (snake_case to match template variables)
  personality_type?: string;
  cognitive_style?: string;
  dominant_emotions?: string[];
  emotional_stability?: number;
  resilience?: number;
  motivators?: string[];
  stressors?: string[];
  thinking_patterns?: string[];
  problem_solving_style?: string;
  creativity_level?: number;
  strengths?: string[];
  development_areas?: string[];
  persona_confidence?: number;
}

export interface GenerateContentUseCaseRequest {
  userId: string;
  prompt: string;
  contentType: ContentType;
  parameters?: GenerationParameters;
  options?: GenerationOptions;
}

export interface GenerateContentUseCaseResult {
  success: boolean;
  requestId: string;
  content?: Content;
  alternatives?: Content[];
  quality?: ContentQuality;
  processingMetadata: {
    generationTime: number;
    tokensUsed: number;
    wordCount: number;
    estimatedReadingTime: number;
    provider: string;
    model: string;
    cost: number;
  };
  workflow?: {
    stagesCompleted: string[];
    totalStages: number;
    currentStage?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class GenerateContentUseCase {
  constructor(
    private readonly _contentAIService: ContentAIService,
    private readonly _templateService: ContentTemplateService,
    private readonly _contentRepository?: Record<string, unknown>,
    private readonly _analyticsService?: AnalyticsService
  ) {
    logger.debug('📝 Initialized with content generation pipeline and template service integration');
  }

  private get contentAIService(): ContentAIService {
    return this._contentAIService;
  }

  private get templateService(): ContentTemplateService {
    return this._templateService;
  }

  private get contentRepository(): Record<string, unknown> | undefined {
    return this._contentRepository;
  }

  private get analyticsService(): AnalyticsService | undefined {
    return this._analyticsService;
  }

  async execute(request: GenerateContentUseCaseRequest): Promise<GenerateContentUseCaseResult> {
    const startTime = Date.now();
    const requestId = uuidv4();

    logger.info('🎯 CONTENT GENERATION REQUEST', {
      requestId,
      contentType: request.contentType,
      templateId: request.options?.templateId || 'none',
      promptLength: request.prompt?.length,
      promptPreview: request.prompt?.substring(0, 100),
      parameters: request.parameters,
      userId: request.userId,
    });

    try {
      // Record analytics
      await this.recordAnalyticsSafely({
        eventType: 'content_generation_request_started',
        eventData: {
          requestId,
          userId: request.userId,
          contentType: request.contentType,
          promptLength: request.prompt.length,
          hasParameters: !!request.parameters,
          hasOptions: !!request.options,
        },
      });

      // Step 1: Validate request
      this.validateRequest(request);

      // Step 2: Create generation request entity
      const generationRequest = this.createGenerationRequest(request, requestId);

      // Step 3: Enhance prompt with templates if specified
      const enhancedPrompt = await this.enhancePromptWithTemplate(request, generationRequest);

      // Step 4: Prepare AI service request
      const aiRequest = this.buildAIServiceRequest(request, enhancedPrompt);

      // Step 4.5: Start processing (required for status transition)
      generationRequest.startProcessing();

      // Step 5: Generate content
      const aiResponse = await this.contentAIService.generateContent(aiRequest);

      // Step 6: Process response and create content entity
      const content = await this.processContentResponse(aiResponse, generationRequest, request);

      // Step 7: Generate alternatives if requested
      const alternatives = request.options?.includeAlternatives
        ? await this.generateAlternatives(request, aiRequest)
        : undefined;

      // Step 8: Assess content quality
      const quality = this.assessContentQuality(content, request.contentType);

      // Step 9: Store content if repository is available
      if (this.contentRepository) {
        await this.storeContent(content, generationRequest);
      }

      // Step 10: Record success analytics
      const processingTime = Date.now() - startTime;
      await this.recordAnalyticsSafely({
        eventType: 'content_generation_completed',
        eventData: {
          requestId,
          userId: request.userId,
          success: true,
          contentType: request.contentType,
          wordCount: content.metadata.wordCount,
          qualityScore: quality.metrics.overall,
          processingTime,
          provider: aiResponse.metadata.provider,
          cost: aiResponse.metadata.cost,
        },
      });

      return {
        success: true,
        requestId,
        content,
        alternatives,
        quality,
        processingMetadata: {
          generationTime: processingTime,
          tokensUsed: aiResponse.metadata.tokensUsed,
          wordCount: aiResponse.metadata.wordCount,
          estimatedReadingTime: aiResponse.metadata.readingTimeMinutes,
          provider: aiResponse.metadata.provider,
          model: aiResponse.metadata.model,
          cost: aiResponse.metadata.cost,
        },
        workflow: {
          stagesCompleted: ['validation', 'enhancement', 'generation', 'processing', 'quality_assessment'],
          totalStages: 5,
        },
      };
    } catch (error) {
      return this.handleGenerationError(
        error instanceof Error ? error : new Error(String(error)),
        requestId,
        request,
        startTime
      );
    }
  }

  /**
   * Generate multiple content variations
   */
  async generateBatch(requests: GenerateContentUseCaseRequest[]): Promise<GenerateContentUseCaseResult[]> {
    const results = await Promise.allSettled(requests.map(request => this.execute(request)));

    return results.map(result =>
      result.status === 'fulfilled'
        ? result.value
        : {
            success: false,
            requestId: uuidv4(),
            processingMetadata: {
              generationTime: 0,
              tokensUsed: 0,
              wordCount: 0,
              estimatedReadingTime: 0,
              provider: 'unknown',
              model: 'unknown',
              cost: 0,
            },
            error: {
              code: 'BATCH_GENERATION_FAILED',
              message: result.reason?.message || 'Unknown error',
            },
          }
    );
  }

  // ===== PRIVATE METHODS =====

  private validateRequest(request: GenerateContentUseCaseRequest): void {
    if (!request.userId?.trim()) {
      throw ContentError.userIdRequired();
    }

    if (!request.prompt?.trim()) {
      throw ContentError.validationError('prompt', 'Prompt is required');
    }

    if (request.prompt.length > 5000) {
      throw ContentError.validationError('prompt', 'Prompt exceeds maximum length of 5000 characters');
    }

    if (!request.contentType) {
      throw ContentError.validationError('contentType', 'Content type is required');
    }

    if (request.parameters?.maxLength && request.parameters.maxLength < 50) {
      throw ContentError.validationError('maxLength', 'Max length must be at least 50 characters');
    }

    if (request.parameters?.temperature && (request.parameters.temperature < 0 || request.parameters.temperature > 1)) {
      throw ContentError.validationError('temperature', 'Temperature must be between 0 and 1');
    }
  }

  private createGenerationRequest(request: GenerateContentUseCaseRequest, requestId: string): GenerationRequest {
    return new GenerationRequest(
      requestId,
      request.userId,
      request.contentType,
      request.prompt,
      request.parameters || {},
      request.options || {},
      'pending',
      undefined, // workflowId
      undefined, // providerId
      undefined, // model
      {
        sourceService: 'ai-content-service',
        apiVersion: '1.0',
      }
    );
  }

  private async enhancePromptWithTemplate(
    request: GenerateContentUseCaseRequest,
    _generationRequest: GenerationRequest
  ): Promise<string> {
    if (!request.options?.templateId) {
      logger.debug('No templateId specified, using default enhancement');
      return await this.buildDefaultEnhancedPrompt(request);
    }

    try {
      const extParams = request.parameters as ExtendedGenerationParameters | undefined;
      const templateVariables = {
        prompt: request.prompt,
        user_input: request.prompt,
        content_type: request.contentType,
        tone: request.parameters?.tone || 'professional',
        target_audience: request.parameters?.targetAudience || 'general audience',
        style: request.parameters?.style || 'informative',
        mood: extParams?.mood,
        max_length: request.parameters?.maxLength?.toString() || 'standard',
        framework: extParams?.framework || 'general',
        analysis_focus: extParams?.analysis_focus || 'general analysis',
        analysis_depth: extParams?.analysis_depth || 'standard',
        therapeutic_goal: extParams?.therapeutic_goal || 'general wellbeing',
        cultural_context: extParams?.cultural_context || 'general',
        output_format: extParams?.output_format || 'text',
        emotional_tone: request.parameters?.tone || 'supportive and encouraging',
        emotional_context: extParams?.emotional_context || 'general wellbeing',
        primary_goal: extParams?.primary_goal || 'personal growth',
        musical_style: request.parameters?.style || 'contemporary',
        complexity_preference: extParams?.complexity_preference || 'moderate',
        support_type: extParams?.support_type || 'encouragement',
        motivation_type: extParams?.motivation_type || 'self-improvement',
        communication_style: extParams?.communication_style || 'gentle',
        mood_descriptor: extParams?.mood || 'hopeful',
        cultural_sensitivity: extParams?.cultural_sensitivity || 'high',
        verbosity: extParams?.verbosity || 'moderate',
        emotional_intensity: extParams?.emotional_intensity || '0.5',
        language: request.parameters?.language || 'English',
        language_preference: request.parameters?.language || 'English',
        // Maps 'targetLanguages' to template variable '{{languages}}' (template DB contract)
        languages: extParams?.targetLanguages || [],
        is_bilingual: extParams?.isBilingual || false,
        current_mood: extParams?.currentMood,
        narrative_seeds: extParams?.narrativeSeeds || [],
        narrative_emotional_context: extParams?.narrativeEmotionalContext || null,
        user_name: extParams?.displayName,
        // Persona-based personalization parameters for enhanced lyrics
        personality_type: extParams?.personality_type,
        cognitive_style: extParams?.cognitive_style,
        dominant_emotions: extParams?.dominant_emotions || [],
        emotional_stability: extParams?.emotional_stability,
        resilience: extParams?.resilience,
        motivators: extParams?.motivators || [],
        stressors: extParams?.stressors || [],
        thinking_patterns: extParams?.thinking_patterns || [],
        problem_solving_style: extParams?.problem_solving_style,
        creativity_level: extParams?.creativity_level,
        strengths: extParams?.strengths || [],
        development_areas: extParams?.development_areas || [],
        persona_confidence: extParams?.persona_confidence,
      };

      logger.info('📝 PROCESSING TEMPLATE', {
        templateId: request.options.templateId,
        variables: Object.keys(templateVariables),
        variableValues: templateVariables,
      });

      const templateResult = await this.templateService.processTemplate(request.options.templateId, templateVariables, {
        validateVariables: true,
        fallbackToDefaults: false,
      });

      logger.info('✅ TEMPLATE PROCESSED SUCCESSFULLY', {
        templateId: request.options.templateId,
        systemPromptLength: templateResult.systemPrompt.length,
        userPromptLength: templateResult.userPrompt.length,
        userPromptPreview: templateResult.userPrompt.substring(0, 200),
        warnings: templateResult.warnings,
      });

      return templateResult.userPrompt;
    } catch (error) {
      logger.error('❌ TEMPLATE PROCESSING FAILED', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : '',
        templateId: request.options?.templateId,
        prompt: request.prompt,
        parameters: request.parameters,
      });
      throw error; // Fail fast instead of silent fallback
    }
  }

  private async buildDefaultEnhancedPrompt(request: GenerateContentUseCaseRequest): Promise<string> {
    // For analysis requests, use the prompt directly without template overhead
    if (request.contentType === 'analysis') {
      logger.debug('Using direct prompt for analysis request (no template required)');
      return request.prompt;
    }

    // For other content types, use enhanced prompt with parameters
    let enhanced = `Create ${request.contentType} content: ${request.prompt}`;

    if (request.parameters?.tone) {
      enhanced += `\nTone: ${request.parameters.tone}`;
    }

    if (request.parameters?.targetAudience) {
      enhanced += `\nTarget Audience: ${request.parameters.targetAudience}`;
    }

    if (request.parameters?.style) {
      enhanced += `\nStyle: ${request.parameters.style}`;
    }

    if (request.options?.formatOutput && request.options.formatOutput !== 'plain') {
      enhanced += `\nFormat as: ${request.options.formatOutput}`;
    }

    if (request.options?.optimizeForSEO) {
      enhanced += '\nOptimize for SEO with relevant keywords and structure.';
    }

    if (request.options?.addCitations) {
      enhanced += '\nInclude relevant citations and sources where appropriate.';
    }

    return enhanced;
  }

  private buildAIServiceRequest(
    request: GenerateContentUseCaseRequest,
    enhancedPrompt: string
  ): ContentGenerationRequest {
    return {
      prompt: enhancedPrompt,
      contentType: request.contentType,
      parameters: request.parameters,
      options: request.options,
    };
  }

  private async processContentResponse(
    aiResponse: ContentGenerationResponse,
    generationRequest: GenerationRequest,
    originalRequest: GenerateContentUseCaseRequest
  ): Promise<Content> {
    // Mark generation request as completed
    generationRequest.complete();

    // Create content entity
    const content = new Content(
      aiResponse.id,
      generationRequest.id,
      aiResponse.content,
      originalRequest.contentType,
      {
        wordCount: aiResponse.metadata.wordCount,
        characterCount: aiResponse.metadata.characterCount,
        readingTimeMinutes: aiResponse.metadata.readingTimeMinutes,
        language: originalRequest.parameters?.language || 'en',
        tokensUsed: aiResponse.metadata.tokensUsed,
        generationTimeMs: aiResponse.metadata.processingTimeMs,
        qualityScore: aiResponse.metadata.qualityScore,
        coherenceScore: 0.8, // Would be calculated by AI service
        relevanceScore: 0.8, // Would be calculated by AI service
        creativityScore: 0.7, // Would be calculated by AI service
        seoScore: aiResponse.metadata.seoScore,
        readabilityScore: aiResponse.metadata.readabilityScore,
        providerId: aiResponse.metadata.provider,
        model: aiResponse.metadata.model,
        temperature: originalRequest.parameters?.temperature || 0.7,
        processingSteps: ['validation', 'enhancement', 'generation', 'processing'],
        errorCount: 0,
        warnings: [],
      },
      aiResponse.analysis
        ? {
            ...aiResponse.analysis,
            languageConfidence: 0.95,
            contentStructure: {
              headings: 2,
              paragraphs: 5,
              bulletPoints: 0,
              links: 0,
            },
          }
        : undefined,
      aiResponse.formattedContent,
      1, // version
      undefined, // parentId
      'generated', // status
      false, // isApproved
      undefined, // approvedBy
      undefined, // approvedAt
      false, // isPublished
      undefined, // publishedAt
      undefined, // publishUrl
      aiResponse.metadata.cost
    );

    return content;
  }

  private async generateAlternatives(
    request: GenerateContentUseCaseRequest,
    baseAIRequest: ContentGenerationRequest
  ): Promise<Content[]> {
    const alternatives: Content[] = [];
    const maxAlternatives = 2;

    for (let i = 0; i < maxAlternatives; i++) {
      try {
        // Create variation with different temperature
        const alternativeRequest: ContentGenerationRequest = {
          ...baseAIRequest,
          parameters: {
            ...baseAIRequest.parameters,
            temperature: Math.min(1.0, (baseAIRequest.parameters?.temperature || 0.7) + 0.1 + i * 0.1),
          },
        };

        const alternativeResponse = await this.contentAIService.generateContent(alternativeRequest);

        const alternativeContent = new Content(
          alternativeResponse.id,
          `alt_${i + 1}_${request.userId}`,
          alternativeResponse.content,
          request.contentType,
          {
            wordCount: alternativeResponse.metadata.wordCount,
            characterCount: alternativeResponse.metadata.characterCount,
            readingTimeMinutes: alternativeResponse.metadata.readingTimeMinutes,
            language: request.parameters?.language || 'en',
            tokensUsed: alternativeResponse.metadata.tokensUsed,
            generationTimeMs: alternativeResponse.metadata.processingTimeMs,
            qualityScore: alternativeResponse.metadata.qualityScore,
            coherenceScore: 0.8,
            relevanceScore: 0.8,
            creativityScore: 0.7,
            providerId: alternativeResponse.metadata.provider,
            model: alternativeResponse.metadata.model,
            temperature: alternativeRequest.parameters?.temperature || 0.7,
            processingSteps: ['generation'],
            errorCount: 0,
            warnings: [],
          },
          alternativeResponse.analysis
            ? {
                ...alternativeResponse.analysis,
                languageConfidence: 0.95,
                contentStructure: {
                  headings: 2,
                  paragraphs: 5,
                  bulletPoints: 0,
                  links: 0,
                },
              }
            : undefined,
          alternativeResponse.formattedContent,
          1,
          undefined,
          'generated',
          false,
          undefined,
          undefined,
          false,
          undefined,
          undefined,
          alternativeResponse.metadata.cost
        );

        alternatives.push(alternativeContent);
      } catch (error) {
        logger.warn('Failed to generate alternative ${i + 1}:', { data: error });
      }
    }

    return alternatives;
  }

  private assessContentQuality(content: Content, contentType: ContentType): ContentQuality {
    // Use metadata scores if available, otherwise calculate basic scores
    const metrics = {
      overall: content.metadata.qualityScore,
      coherence: content.metadata.coherenceScore,
      relevance: content.metadata.relevanceScore,
      creativity: content.metadata.creativityScore,
      readability: content.metadata.readabilityScore || 0.8,
      seo: content.metadata.seoScore,
      engagement: this.calculateEngagementScore(content.content, contentType),
    };

    return ContentQuality.fromMetrics(metrics);
  }

  private calculateEngagementScore(content: string, contentType: ContentType): number {
    let score = 0.5;

    // Check for engaging elements
    if (content.includes('?')) score += 0.1; // Questions
    if (content.includes('!')) score += 0.05; // Exclamations
    if (content.includes('you') || content.includes('your')) score += 0.1; // Personal connection

    // Content type specific checks
    if (contentType === 'social' && content.length <= 280) score += 0.2;
    if (contentType === 'email' && content.toLowerCase().includes('call')) score += 0.15;

    return Math.min(score, 1.0);
  }

  private async storeContent(content: Content, generationRequest: GenerationRequest): Promise<void> {
    try {
      // Store content in repository (placeholder)
      logger.info('💾 Storing content {} for request {}', { data0: content.id, data1: generationRequest.id });
      // await this.contentRepository.save(content);
    } catch (error) {
      logger.warn('Failed to store content (non-blocking):', { data: error });
    }
  }

  private handleGenerationError(
    error: Error,
    requestId: string,
    request: GenerateContentUseCaseRequest,
    startTime: number
  ): GenerateContentUseCaseResult {
    const processingTime = Date.now() - startTime;

    void this.recordAnalyticsSafely({
      eventType: 'content_generation_failed',
      eventData: {
        requestId,
        userId: request.userId,
        success: false,
        contentType: request.contentType,
        error: error.message,
        processingTime,
      },
    });

    logger.error('Generation failed for request ${requestId}:', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      requestId,
      processingMetadata: {
        generationTime: processingTime,
        tokensUsed: 0,
        wordCount: 0,
        estimatedReadingTime: 0,
        provider: 'unknown',
        model: 'unknown',
        cost: 0,
      },
      error: {
        code: 'CONTENT_GENERATION_FAILED',
        message: error.message,
        details: {
          requestId,
          contentType: request.contentType,
          promptLength: request.prompt.length,
        },
      },
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
            useCase: 'GenerateContentUseCase',
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
