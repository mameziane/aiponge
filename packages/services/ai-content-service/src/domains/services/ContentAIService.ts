/**
 * Content AI Service - Adapted from UniversalAIService for content-focused operations
 * Handles content generation through provider integrations with content-specific workflows
 */

import { v4 as uuidv4 } from 'uuid';
import type { ITemplateClient } from '../interfaces/ITemplateClient';
import { TEMPLATE_IDS } from '../constants/template-ids';
import { getLogger } from '../../config/service-urls';
import { ContentError, ProviderError } from '../../application/errors';

// Domain-specific interfaces for content operations

const logger = getLogger('ai-content-service-contentaiservice');

// Language code to full name mapping for AI prompts
const LANGUAGE_CODE_MAP: Record<string, string> = {
  en: 'English',
  'en-US': 'English',
  'en-GB': 'English',
  fr: 'French',
  'fr-FR': 'French',
  es: 'Spanish',
  'es-ES': 'Spanish',
  de: 'German',
  'de-DE': 'German',
  pt: 'Portuguese',
  'pt-BR': 'Portuguese',
  it: 'Italian',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  he: 'Hebrew',
  hi: 'Hindi',
};

/**
 * Convert language code (e.g., 'fr', 'en-US') to full language name for AI prompts
 */
function getLanguageName(code: string | undefined): string | undefined {
  if (!code || code === 'auto-detect') return undefined;
  return LANGUAGE_CODE_MAP[code] || code; // Return mapped name or original if not found
}

// Provider and analytics client interfaces
interface IProvidersServiceClient {
  generateText(request: ProviderTextRequest): Promise<ProviderTextResponse>;
}

interface IAnalyticsServiceClient {
  recordEvent?(event: AnalyticsEvent): void;
}

interface ProviderTextRequest {
  operation: 'text_generation';
  payload: Record<string, unknown>;
  options: {
    timeout?: number;
    retries?: number;
    priority?: string;
    requestId?: string;
  };
}

interface ProviderTextResponse {
  success: boolean;
  result: string;
  providerId?: string;
  providerName?: string;
  model?: string;
  metadata?: {
    tokensUsed?: number;
    cost?: number;
    [key: string]: unknown;
  };
}

interface AnalyticsEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface ProviderRequest {
  id: string;
  operation: string;
  payload: {
    prompt: string;
    systemPrompt?: string;
    userPrompt?: string;
    maxTokens: number;
    temperature: number;
    contentType: string;
    [key: string]: unknown;
  };
  options: {
    timeout: number;
    retries?: number;
    [key: string]: unknown;
  };
}

interface ProviderResponse {
  id: string;
  success: boolean;
  result: string;
  providerId?: string;
  providerName?: string;
  model?: string;
  metadata?: {
    tokensUsed?: number;
    cost?: number;
    [key: string]: unknown;
  };
}

interface ContentAnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  topics: string[];
  keyPhrases: string[];
  entities: Array<{ text: string; type: string; confidence: number }>;
}

interface OptimizationSuggestion {
  type: string;
  description: string;
  priority: number;
}

interface ContentScores {
  seoScore: number;
  readabilityScore: number;
  engagementScore: number;
  wordCount?: number;
  sentenceCount?: number;
  paragraphCount?: number;
}

// Extended parameters for music/content generation
interface ExtendedContentParameters {
  maxLength?: number;
  temperature?: number;
  tone?: 'formal' | 'casual' | 'professional' | 'friendly' | 'persuasive';
  targetAudience?: string;
  style?: 'informative' | 'narrative' | 'promotional' | 'educational';
  language?: string;
  targetLanguages?: string[];
  isBilingual?: boolean;
  emotional_context?: string;
  primary_goal?: string;
  complexity_preference?: string;
  support_type?: string;
  motivation_type?: string;
  communication_style?: string;
  mood?: string;
  cultural_sensitivity?: string;
  cultural_context?: string;
  verbosity?: string;
  emotional_intensity?: string;
  currentMood?: string;
  displayName?: string;
  narrativeSeeds?: string[];
  narrativeEmotionalContext?: string;
  book_type?: string;
  book_title?: string;
  book_description?: string;
  chapter_title?: string;
  book_category?: string;
  book_tags?: string[];
  book_themes?: string[];
}

export interface ContentGenerationRequest {
  prompt: string;
  contentType:
    | 'article'
    | 'blog'
    | 'creative'
    | 'technical'
    | 'email'
    | 'social'
    | 'summary'
    | 'educational'
    | 'analysis';
  parameters?: {
    maxLength?: number;
    temperature?: number;
    tone?: 'formal' | 'casual' | 'professional' | 'friendly' | 'persuasive';
    targetAudience?: string;
    style?: 'informative' | 'narrative' | 'promotional' | 'educational';
    language?: string;
  };
  options?: {
    includeAlternatives?: boolean;
    optimizeForSEO?: boolean;
    addCitations?: boolean;
    formatOutput?: 'plain' | 'markdown' | 'html';
    templateId?: string;
  };
  context?: Record<string, unknown>;
}

export interface ContentGenerationResponse {
  id: string;
  content: string;
  formattedContent?: string;
  alternatives?: string[];
  metadata: {
    wordCount: number;
    characterCount: number;
    readingTimeMinutes: number;
    processingTimeMs: number;
    tokensUsed: number;
    provider: string;
    model: string;
    cost: number;
    qualityScore: number;
    seoScore?: number;
    readabilityScore?: number;
  };
  analysis?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    topics: string[];
    keyPhrases: string[];
    entities: Array<{ text: string; type: string; confidence: number }>;
  };
}

export interface ContentOptimizationRequest {
  content: string;
  contentType: string;
  targetKeywords?: string[];
  targetAudience?: string;
  optimizationGoals?: ('seo' | 'readability' | 'engagement')[];
}

export interface ContentOptimizationResponse {
  optimizedContent: string;
  improvements: string[];
  scores: {
    seoScore: number;
    readabilityScore: number;
    engagementScore: number;
  };
  suggestions: string[];
}

/**
 * Content-focused AI service with provider integration
 */
export class ContentAIService {
  private cache: Map<string, unknown> = new Map();
  private readonly defaultTimeout = 60000; // 60s for longer prompts (lyrics with 2000 char entries)
  private readonly templateClient: ITemplateClient;

  constructor(
    private readonly providersServiceClient?: IProvidersServiceClient,
    private readonly analyticsServiceClient?: IAnalyticsServiceClient,
    templateClient?: ITemplateClient
  ) {
    if (!templateClient) {
      throw ContentError.validationError('templateClient', 'ContentAIService requires a templateClient instance');
    }
    this.templateClient = templateClient;
    logger.debug('📝 Initialized for content generation and optimization with template service integration');
  }

  /**
   * Generate content using AI providers
   */
  async generateContent(request: ContentGenerationRequest): Promise<ContentGenerationResponse> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      // Record analytics event
      await this.recordEventSafely({
        eventType: 'content_generation_started',
        eventData: {
          requestId,
          contentType: request.contentType,
          promptLength: request.prompt.length,
          hasParameters: !!request.parameters,
          hasOptions: !!request.options,
        },
        metadata: {
          service: 'ContentAIService',
          operation: 'generateContent',
        },
      });

      // Validate request
      this.validateContentRequest(request);

      // Prepare provider request
      const providerRequest = await this.buildProviderRequest(request, requestId);

      // Call AI provider through ProvidersServiceClient
      const providerResponse = await this.callAIProvider(providerRequest);

      // Process and enhance the response
      const contentResponse = await this.processContentResponse(providerResponse, request, requestId, startTime);

      // Record success analytics
      await this.recordContentMetrics(contentResponse, request, startTime);

      return contentResponse;
    } catch (error) {
      // Record failure analytics
      await this.recordErrorSafely(requestId, error instanceof Error ? error : new Error(String(error)), request);
      if (error instanceof ContentError || error instanceof ProviderError) {
        throw error;
      }
      throw ContentError.generationFailed(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Optimize existing content
   */
  async optimizeContent(request: ContentOptimizationRequest): Promise<ContentOptimizationResponse> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      await this.recordEventSafely({
        eventType: 'content_optimization_started',
        eventData: {
          requestId,
          contentType: request.contentType,
          contentLength: request.content.length,
          goals: request.optimizationGoals,
        },
      });

      // Analyze current content
      const currentScores = await this.analyzeContent(request.content, request.contentType);

      // Generate optimization suggestions
      const suggestions = this.generateOptimizationSuggestions(request.content, currentScores, request);

      // Apply optimizations
      const optimizedContent = await this.applyOptimizations(request.content, suggestions, request);

      // Calculate new scores
      const newScores = await this.analyzeContent(optimizedContent, request.contentType);

      const response: ContentOptimizationResponse = {
        optimizedContent,
        improvements: this.calculateImprovements(currentScores, newScores),
        scores: newScores,
        suggestions: suggestions.map(s => s.description),
      };

      await this.recordEventSafely({
        eventType: 'content_optimization_completed',
        eventData: {
          requestId,
          improvementCount: response.improvements.length,
          scoreImprovement: {
            seo: newScores.seoScore - currentScores.seoScore,
            readability: newScores.readabilityScore - currentScores.readabilityScore,
            engagement: newScores.engagementScore - currentScores.engagementScore,
          },
          processingTime: Date.now() - startTime,
        },
      });

      return response;
    } catch (error) {
      await this.recordErrorSafely(requestId, error instanceof Error ? error : new Error(String(error)), request);
      if (error instanceof ContentError || error instanceof ProviderError) {
        throw error;
      }
      throw ContentError.generationFailed(
        `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Analyze content and generate insights
   */
  async analyzeContent(content: string, contentType: string) {
    const wordCount = content.trim().split(/\s+/).length;
    const sentenceCount = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const paragraphCount = content.split(/\n\s*\n/).length;

    // Calculate scores
    const seoScore = this.calculateSEOScore(content, contentType);
    const readabilityScore = this.calculateReadabilityScore(content, sentenceCount, wordCount);
    const engagementScore = this.calculateEngagementScore(content, contentType);

    return {
      seoScore,
      readabilityScore,
      engagementScore,
      wordCount,
      sentenceCount,
      paragraphCount,
    };
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    cacheSize: number;
    lastRequestTime?: Date;
    providersAvailable: boolean;
  }> {
    try {
      // Check provider availability through ProvidersServiceClient
      const providersAvailable = await this.checkProvidersHealth();

      return {
        status: providersAvailable ? 'healthy' : 'degraded',
        cacheSize: this.cache.size,
        lastRequestTime: this.cache.get('lastRequestTime') as Date | undefined,
        providersAvailable,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        cacheSize: this.cache.size,
        providersAvailable: false,
      };
    }
  }

  // ===== PRIVATE METHODS =====

  private validateContentRequest(request: ContentGenerationRequest): void {
    if (!request.prompt?.trim()) {
      throw ContentError.validationError('prompt', 'Prompt is required');
    }

    // Allow larger prompts (20000 chars) since templates can add 3000-5000 chars of instructions
    // User input is validated at 5000 chars in GenerateContentUseCase before template expansion
    if (request.prompt.length > 20000) {
      throw ContentError.validationError('prompt', 'Prompt exceeds maximum length of 20000 characters');
    }

    if (request.parameters?.maxLength && request.parameters.maxLength < 50) {
      throw ContentError.validationError('maxLength', 'Max length must be at least 50 characters');
    }

    if (request.parameters?.temperature && (request.parameters.temperature < 0 || request.parameters.temperature > 1)) {
      throw ContentError.validationError('temperature', 'Temperature must be between 0 and 1');
    }
  }

  private async buildProviderRequest(request: ContentGenerationRequest, requestId: string): Promise<ProviderRequest> {
    const enhancedPrompt = await this.enhancePrompt(request);

    return {
      id: requestId,
      operation: 'text_generation',
      payload: {
        prompt: enhancedPrompt.prompt,
        systemPrompt: enhancedPrompt.systemPrompt, // Separate system prompt for LLM message structure
        userPrompt: enhancedPrompt.userPrompt, // Separate user prompt for LLM message structure
        maxTokens: request.parameters?.maxLength || this.getDefaultLength(request.contentType),
        temperature: request.parameters?.temperature || this.getDefaultTemperature(request.contentType),
        contentType: request.contentType,
        ...request.parameters,
      },
      options: {
        timeout: this.defaultTimeout,
        retries: 2,
        ...request.options,
      },
    };
  }

  private async enhancePrompt(request: ContentGenerationRequest): Promise<{
    prompt: string;
    systemPrompt?: string;
    userPrompt?: string;
  }> {
    const templateId = this.selectTemplateId(request);

    const variables = {
      ...this.buildBasicVariables(request),
      ...this.buildEmotionalAndMusicVariables(request),
      ...this.buildContextVariables(request),
    };

    // Execute template and get response with separated system/user prompts
    const templateResponse = await this.templateClient.executeTemplate({
      templateId,
      variables,
    });

    if (!templateResponse.success || !templateResponse.result) {
      const errorMessage = `Template execution failed for ${templateId}: ${templateResponse.error || 'no result'}`;
      logger.error('Template execution failed - no fallback', {
        templateId,
        templateSuccess: templateResponse.success,
        hasResult: !!templateResponse.result,
        error: templateResponse.error,
      });
      throw ContentError.generationFailed(errorMessage);
    }

    return {
      prompt: templateResponse.result,
      systemPrompt: templateResponse.systemPrompt,
      userPrompt: templateResponse.userPrompt || templateResponse.result,
    };
  }

  /**
   * Select the appropriate template ID based on content type and custom options
   */
  private selectTemplateId(request: ContentGenerationRequest): string {
    let templateId: string =
      request.contentType === 'analysis' ? TEMPLATE_IDS.ENTRY_ANALYSIS : TEMPLATE_IDS.SYSTEM_PROMPT;

    if (request.options && 'templateId' in request.options) {
      const customTemplateId = request.options.templateId?.trim() || '';
      if (customTemplateId) {
        // Valid custom template ID provided
        templateId = customTemplateId;
        logger.debug('Using custom template', { templateId, contentType: request.contentType });
      } else {
        // Empty/whitespace templateId provided - log warning and use default
        logger.warn('Empty templateId provided, using default', {
          providedValue: request.options.templateId,
          defaultTemplate: templateId,
        });
      }
    }

    return templateId;
  }

  /**
   * Build basic template variables: content type, prompt, tone, audience, style, format, language
   */
  private buildBasicVariables(request: ContentGenerationRequest): Record<string, unknown> {
    return {
      content_type: request.contentType,
      user_input: request.prompt,
      prompt: request.prompt, // Add for templates that use ${prompt}
      tone: request.parameters?.tone,
      target_audience: request.parameters?.targetAudience,
      style: request.parameters?.style,
      format_output:
        request.options?.formatOutput && request.options.formatOutput !== 'plain' ? request.options.formatOutput : null,
      optimize_seo: request.options?.optimizeForSEO || false,
      add_citations: request.options?.addCitations || false,
      // CRITICAL: Language parameter for multilingual templates - use user's preference
      // Convert language codes (e.g., 'fr') to full names (e.g., 'French') for AI prompts
      // 'auto-detect' or undefined means the AI should detect from input text
      language: getLanguageName(request.parameters?.language),
      language_preference: getLanguageName(request.parameters?.language),
    };
  }

  /**
   * Build emotional, music, and personalization template variables
   */
  private buildEmotionalAndMusicVariables(request: ContentGenerationRequest): Record<string, unknown> {
    const params = request.parameters as ExtendedContentParameters | undefined;

    return {
      // Music lyrics template variables (pass through all parameters for flexibility)
      emotional_tone: request.parameters?.tone || 'supportive and encouraging',
      emotional_context: params?.emotional_context || 'general wellbeing',
      primary_goal: params?.primary_goal || 'personal growth',
      musical_style: request.parameters?.style || 'contemporary',
      complexity_preference: params?.complexity_preference || 'moderate',
      support_type: params?.support_type || 'encouragement',
      motivation_type: params?.motivation_type || 'self-improvement',
      communication_style: params?.communication_style || 'gentle',
      mood_descriptor: params?.mood || 'hopeful',
      cultural_sensitivity: params?.cultural_sensitivity || 'high',
      cultural_style: params?.cultural_context || 'universal',
      verbosity: params?.verbosity || 'moderate',
      emotional_intensity: params?.emotional_intensity || '0.5',
      current_mood: params?.currentMood,
      user_name: params?.displayName,
      // Bilingual/multi-language support
      is_bilingual: params?.isBilingual || false,
      // Maps 'targetLanguages' to template variable '{{languages}}' (template DB contract)
      languages: params?.targetLanguages?.join(', '),
      // Narrative personalization from book themes
      narrative_seeds: params?.narrativeSeeds?.join(', '),
      narrative_emotional_context: params?.narrativeEmotionalContext,
    };
  }

  /**
   * Build book context and entry analysis template variables
   */
  private buildContextVariables(request: ContentGenerationRequest): Record<string, unknown> {
    const params = request.parameters as ExtendedContentParameters | undefined;
    const context = request.context as Record<string, unknown> | undefined;

    return {
      // Book context for source-aware lyrics generation
      book_type: params?.book_type,
      book_title: params?.book_title,
      book_description: params?.book_description,
      chapter_title: params?.chapter_title,
      book_category: params?.book_category,
      book_tags: params?.book_tags?.join(', '),
      book_themes: params?.book_themes?.join(', '),
      has_book_context: !!params?.book_type,
      // Entry analysis template variables (used by entry-analysis template)
      framework: context?.framework || 'cognitive-behavioral',
      analysis_focus: context?.analysis_focus || 'patterns and insights',
      analysis_depth: context?.analysis_depth || 'comprehensive',
      therapeutic_goal: context?.therapeutic_goal || 'self-awareness',
      cultural_context: context?.cultural_context || params?.cultural_context || 'universal',
      output_format: context?.output_format || 'structured',
    };
  }

  private async callAIProvider(request: ProviderRequest): Promise<ProviderResponse> {
    // Call real AI provider through ProvidersServiceClient
    if (!this.providersServiceClient) {
      throw ProviderError.configurationError('ProvidersServiceClient not initialized - cannot call AI provider');
    }

    try {
      // Forward the request with proper filtering - only include provider-relevant options
      // Include requestId in options for tracing/correlation through the provider chain
      const providerRequest = {
        operation: request.operation as 'text_generation',
        payload: request.payload,
        options: {
          timeout: request.options?.timeout,
          retries: request.options?.retries,
          priority: (request.options?.priority || 'normal') as 'low' | 'normal' | 'high',
        },
      };

      logger.info('🤖 [AI_PROVIDER] Calling provider', {
        requestId: request.id,
        operation: request.operation,
        contentType: request.payload.contentType,
        promptLength: request.payload.prompt?.length || 0,
        timeout: request.options?.timeout,
      });

      const response = await this.providersServiceClient.generateText(providerRequest);

      // Log successful response
      logger.info('🤖 [AI_PROVIDER] Response received', {
        requestId: request.id,
        success: response.success,
        hasResult: !!response.result,
        resultLength: response.result?.length || 0,
        provider: response.providerName,
        model: response.model,
      });

      return {
        id: request.id,
        success: response.success,
        result: response.result,
        providerId: response.providerId,
        providerName: response.providerName,
        model: response.model,
        metadata: response.metadata,
      };
    } catch (error) {
      // Enhanced error logging with full details
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              stack: error.stack?.split('\n').slice(0, 5).join('\n'),
            }
          : { raw: String(error) };

      logger.error('🤖 [AI_PROVIDER] Call FAILED', {
        requestId: request.id,
        operation: request.operation,
        contentType: request.payload.contentType,
        promptLength: request.payload.prompt?.length || 0,
        ...errorDetails,
      });
      throw error;
    }
  }

  private async processContentResponse(
    providerResponse: ProviderResponse,
    request: ContentGenerationRequest,
    requestId: string,
    startTime: number
  ): Promise<ContentGenerationResponse> {
    let content = providerResponse.result;

    // Clean lyrics content if this is a lyrics/creative generation request
    if (request.contentType === 'creative' && request.options?.templateId === 'music-lyrics') {
      content = this.cleanLyricsContent(content);
    }

    // Clean song title content if this is a title generation request
    if (request.contentType === 'creative' && request.options?.templateId === 'music-song-title') {
      content = this.cleanSongTitle(content);
    }

    const wordCount = content.trim().split(/\s+/).length;
    const processingTime = Date.now() - startTime;

    // Generate alternatives if requested
    const alternatives = request.options?.includeAlternatives
      ? await this.generateAlternatives(content, request)
      : undefined;

    // Calculate quality scores
    const qualityScore = this.calculateQualityScore(content, request.contentType);
    const seoScore = request.options?.optimizeForSEO ? this.calculateSEOScore(content, request.contentType) : undefined;
    const readabilityScore = this.calculateReadabilityScore(content);

    // Perform content analysis
    const analysis = this.performContentAnalysis(content);

    return {
      id: requestId,
      content,
      formattedContent: request.options?.formatOutput === 'markdown' ? content : undefined,
      alternatives,
      metadata: {
        wordCount,
        characterCount: content.length,
        readingTimeMinutes: Math.ceil(wordCount / 200),
        processingTimeMs: processingTime,
        tokensUsed: providerResponse.metadata?.tokensUsed ?? 0,
        provider: providerResponse.providerId ?? 'unknown',
        model: providerResponse.model ?? 'unknown',
        cost: providerResponse.metadata?.cost ?? 0,
        qualityScore,
        seoScore,
        readabilityScore,
      },
      analysis,
    };
  }

  private async generateAlternatives(content: string, request: ContentGenerationRequest): Promise<string[]> {
    // Placeholder for alternative generation
    return [
      `Alternative version 1: ${content.substring(0, 100)}...`,
      `Alternative version 2: ${content.substring(0, 100)}...`,
    ];
  }

  private calculateQualityScore(content: string, contentType: string): number {
    let score = 0.5; // Base score

    // Check content length appropriateness
    const wordCount = content.trim().split(/\s+/).length;
    const expectedLength = this.getDefaultLength(contentType);
    const lengthRatio = wordCount / expectedLength;

    if (lengthRatio >= 0.8 && lengthRatio <= 1.2) score += 0.2;

    // Check for structure (headings, paragraphs)
    if (content.includes('#') || content.includes('\n\n')) score += 0.1;

    // Check for completeness (ending punctuation)
    if (content.trim().match(/[.!?]$/)) score += 0.1;

    // Check for content relevance (basic keyword matching)
    // This is a simplified check - real implementation would be more sophisticated
    score += 0.1;

    return Math.min(score, 1.0);
  }

  private calculateSEOScore(content: string, contentType: string): number {
    let score = 0.5;

    const wordCount = content.trim().split(/\s+/).length;

    // Check optimal length for content type
    if (contentType === 'article' && wordCount >= 300 && wordCount <= 2000) score += 0.2;
    if (contentType === 'blog' && wordCount >= 500 && wordCount <= 1500) score += 0.2;

    // Check for headings
    if (content.includes('#')) score += 0.1;

    // Check for keyword density (simplified)
    const words = content.toLowerCase().split(/\s+/);
    const wordFreq = words.reduce((freq: Record<string, number>, word) => {
      if (word.length > 4) freq[word] = (freq[word] || 0) + 1;
      return freq;
    }, {});

    const hasGoodKeywordDensity = Object.values(wordFreq).some(count => count >= 3 && count <= 8);
    if (hasGoodKeywordDensity) score += 0.2;

    return Math.min(score, 1.0);
  }

  private calculateReadabilityScore(content: string, sentences?: number, words?: number): number {
    const sentenceCount = sentences || content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const wordCount = words || content.trim().split(/\s+/).length;

    if (sentenceCount === 0 || wordCount === 0) return 0;

    const avgSentenceLength = wordCount / sentenceCount;

    // Simplified Flesch Reading Ease scoring
    if (avgSentenceLength <= 15) return 0.9;
    if (avgSentenceLength <= 20) return 0.7;
    if (avgSentenceLength <= 25) return 0.5;
    return 0.3;
  }

  private calculateEngagementScore(content: string, contentType: string): number {
    let score = 0.5;

    // Check for engaging elements
    if (content.includes('?')) score += 0.1; // Questions
    if (content.includes('!')) score += 0.05; // Exclamations
    if (content.includes('you') || content.includes('your')) score += 0.1; // Personal connection

    // Content type specific checks
    if (contentType === 'social' && content.length <= 280) score += 0.2;
    if (contentType === 'email' && content.includes('call-to-action')) score += 0.15;

    return Math.min(score, 1.0);
  }

  private performContentAnalysis(content: string): ContentAnalysisResult {
    // Simplified content analysis - real implementation would use NLP
    const positiveWords = ['great', 'excellent', 'amazing', 'wonderful', 'good'];
    const negativeWords = ['bad', 'terrible', 'awful', 'problem', 'issue'];

    const lowerContent = content.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerContent.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerContent.includes(word)).length;

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    if (negativeCount > positiveCount) sentiment = 'negative';

    return {
      sentiment,
      topics: ['general'], // Placeholder
      keyPhrases: ['content', 'generation'], // Placeholder
      entities: [], // Placeholder
    };
  }

  private generateOptimizationSuggestions(
    content: string,
    scores: ContentScores,
    request: ContentOptimizationRequest
  ): OptimizationSuggestion[] {
    const suggestions = [];

    if (scores.seoScore < 0.7) {
      suggestions.push({
        type: 'seo',
        description: 'Add more relevant keywords naturally throughout the content',
        priority: 3,
      });
    }

    if (scores.readabilityScore < 0.6) {
      suggestions.push({
        type: 'readability',
        description: 'Break up long sentences for better readability',
        priority: 2,
      });
    }

    if (scores.engagementScore < 0.6) {
      suggestions.push({
        type: 'engagement',
        description: 'Add questions to engage readers more effectively',
        priority: 2,
      });
    }

    return suggestions;
  }

  private async applyOptimizations(
    content: string,
    suggestions: OptimizationSuggestion[],
    request: ContentOptimizationRequest
  ): Promise<string> {
    // Placeholder for content optimization
    // Real implementation would apply specific improvements
    return content + '\n\n[Content optimized based on suggestions]';
  }

  private calculateImprovements(oldScores: ContentScores, newScores: ContentScores): string[] {
    const improvements = [];

    if (newScores.seoScore > oldScores.seoScore) {
      improvements.push(`SEO score improved by ${((newScores.seoScore - oldScores.seoScore) * 100).toFixed(1)}%`);
    }

    if (newScores.readabilityScore > oldScores.readabilityScore) {
      improvements.push(
        `Readability improved by ${((newScores.readabilityScore - oldScores.readabilityScore) * 100).toFixed(1)}%`
      );
    }

    if (newScores.engagementScore > oldScores.engagementScore) {
      improvements.push(
        `Engagement potential increased by ${((newScores.engagementScore - oldScores.engagementScore) * 100).toFixed(1)}%`
      );
    }

    return improvements;
  }

  private getDefaultLength(contentType: string): number {
    const lengths: Record<string, number> = {
      article: 1000,
      blog: 800,
      creative: 600,
      technical: 1200,
      email: 300,
      social: 280,
      summary: 200,
      educational: 1000,
    };

    return lengths[contentType] || 500;
  }

  private getDefaultTemperature(contentType: string): number {
    const temperatures: Record<string, number> = {
      article: 0.7,
      blog: 0.8,
      creative: 0.9,
      technical: 0.3,
      email: 0.5,
      social: 0.8,
      summary: 0.3,
      educational: 0.6,
    };

    return temperatures[contentType] || 0.7;
  }

  private async checkProvidersHealth(): Promise<boolean> {
    if (!this.providersServiceClient) {
      logger.warn('ProvidersServiceClient not initialized - assuming providers unavailable');
      return false;
    }

    // Assume providers are available if the client is initialized
    // Actual health checks would require implementing checkHealth on the client
    return true;
  }

  /**
   * Clean song title by removing instruction text, quotes, and extra formatting
   */
  private cleanSongTitle(rawTitle: string): string {
    let cleaned = rawTitle.trim();

    // Remove common instruction/explanation patterns
    const patternsToRemove = [
      /^(Sure[,!]?\s+)?(?:Here(?:'s| is))?\s+(?:a|the)?\s+(?:song\s+)?title[:\s]*["']?/i,
      /^(Of course[,!]?\s+)?(?:I(?:'d| would))?\s+suggest[:\s]*["']?/i,
      /^(?:How about|What about)[:\s]*["']?/i,
      /^Title[:\s]*["']?/i,
      /^Song[:\s]*["']?/i,
      /^\*\*.*?\*\*[:\s]*/, // Remove markdown bold
      /^#+\s+/, // Remove markdown headers
    ];

    for (const pattern of patternsToRemove) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Remove wrapping quotes
    cleaned = cleaned.replace(/^["']|["']$/g, '').trim();

    // Remove trailing punctuation (unless it's part of the title like "What If?")
    cleaned = cleaned.replace(/[.,;:]$/g, '').trim();

    // Remove any parenthetical explanations at the end
    cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim();

    // If title is longer than 60 characters (likely includes explanation), take first sentence
    if (cleaned.length > 60 && cleaned.includes('.')) {
      const firstSentence = cleaned.split('.')[0].trim();
      if (firstSentence.length >= 5 && firstSentence.length <= 60) {
        cleaned = firstSentence;
      }
    }

    // Apply title case formatting if it's all lowercase or all uppercase
    if (cleaned === cleaned.toLowerCase() || cleaned === cleaned.toUpperCase()) {
      cleaned = this.toTitleCase(cleaned);
    }

    logger.debug('🧹 Cleaned song title', {
      originalLength: rawTitle.length,
      cleanedLength: cleaned.length,
      original: rawTitle.substring(0, 100),
      cleaned: cleaned,
    });

    return cleaned;
  }

  /**
   * Convert string to title case (e.g., "dancing in the rain" → "Dancing in the Rain")
   */
  private toTitleCase(str: string): string {
    const lowerWords = [
      'a',
      'an',
      'the',
      'and',
      'but',
      'or',
      'for',
      'nor',
      'on',
      'at',
      'to',
      'from',
      'by',
      'in',
      'of',
      'with',
    ];

    return str
      .toLowerCase()
      .split(' ')
      .map((word, index) => {
        // Always capitalize first and last word, or if not in lowerWords list
        if (index === 0 || index === str.split(' ').length - 1 || !lowerWords.includes(word)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
      })
      .join(' ');
  }

  /**
   * Clean lyrics content by removing instruction text, error messages, and meta-commentary
   */
  private cleanLyricsContent(rawContent: string): string {
    let cleaned = rawContent.trim();

    // Remove common instruction/error patterns that LLMs sometimes add
    const patternsToRemove = [
      /^(Sure[,!]?\s+)?(?:Here(?:'s| are| is))?\s+(?:the|some)?\s+lyrics.*?[:\n]/i,
      /^(Of course[,!]?\s+)?(?:I(?:'ll| will| can))?\s+(?:create|generate|write).*?[:\n]/i,
      /^(?:Based on|Using).*?[:\n]/i,
      /^(?:I understand|Got it).*?[:\n]/i,
      /^\*\*.*?\*\*\s*[\n:]/, // Remove markdown headers like **Lyrics:**
      /^#+\s+.*?[\n:]/, // Remove markdown headers like # Lyrics
      /^Lyrics:?\s*\n/i,
      /^Song:?\s*\n/i,
      /\n\n---+\s*$/, // Remove trailing separators
      /\n\nNote:.*$/is, // Remove trailing notes
      /\n\n\*.*?\*\s*$/is, // Remove trailing italicized notes
      /^I(?:'ve| have)? created.*?[:\n]/i,
      /^Let me (?:know|create).*?[:\n]/i,
      /^Would you like.*?\?/im,
      /^Is there anything.*?\?/im,
      /^(?:Please )?(?:let me know|feel free).*$/im,
    ];

    for (const pattern of patternsToRemove) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Remove leading/trailing whitespace and normalize line breaks
    cleaned = cleaned.trim();

    // If content looks like it's wrapped in quotes, unwrap it
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    // Remove any remaining instruction-like text before the first verse/section
    const firstSectionMatch = cleaned.match(/\[(?:Verse|Chorus|Intro|Bridge)/i);
    if (firstSectionMatch && firstSectionMatch.index && firstSectionMatch.index > 100) {
      // If there's a lot of text before the first section marker, it's likely instructions
      const beforeSection = cleaned.substring(0, firstSectionMatch.index);
      if (!beforeSection.includes('\n\n') || beforeSection.split('\n\n').length === 1) {
        // Remove single-paragraph preamble
        cleaned = cleaned.substring(firstSectionMatch.index);
      }
    }

    logger.debug('🧹 Cleaned lyrics content', {
      originalLength: rawContent.length,
      cleanedLength: cleaned.length,
      removedCharacters: rawContent.length - cleaned.length,
    });

    return cleaned;
  }

  // ===== ANALYTICS HELPERS =====

  private async recordEventSafely(event: {
    eventType: string;
    eventData: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.analyticsServiceClient?.recordEvent) return;

    try {
      this.analyticsServiceClient.recordEvent({
        eventType: event.eventType,
        eventData: event.eventData,
      });
    } catch (error) {
      logger.warn('Failed to initiate event recording (non-blocking):', { data: error });
    }
  }

  private async recordContentMetrics(
    response: ContentGenerationResponse,
    request: ContentGenerationRequest,
    startTime: number
  ): Promise<void> {
    await this.recordEventSafely({
      eventType: 'content_generation_completed',
      eventData: {
        requestId: response.id,
        contentType: request.contentType,
        success: true,
        wordCount: response.metadata.wordCount,
        processingTime: response.metadata.processingTimeMs,
        provider: response.metadata.provider,
        model: response.metadata.model,
        cost: response.metadata.cost,
        qualityScore: response.metadata.qualityScore,
      },
    });
  }

  private async recordErrorSafely(
    requestId: string,
    error: Error,
    request: ContentGenerationRequest | ContentOptimizationRequest
  ): Promise<void> {
    const isGenerationRequest = 'prompt' in request;
    await this.recordEventSafely({
      eventType: 'content_generation_failed',
      eventData: {
        requestId,
        error: error.message,
        contentType: request.contentType || 'unknown',
        contentLength: isGenerationRequest
          ? request.prompt?.length || 0
          : (request as ContentOptimizationRequest).content?.length || 0,
      },
    });
  }
}
