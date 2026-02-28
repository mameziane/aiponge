/**
 * Template Engine Service Client for AI Content Service
 * Specialized client for content generation templates
 * Updated to use standardized ServiceCallClient for consistent service communication
 */

import { createServiceClient, type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import { TemplateError } from '../../application/errors';
import { withServiceResilience } from '@aiponge/platform-core';

const logger = getLogger('ai-content-service-templateengineserviceclient');

export interface TemplateExecuteRequest {
  templateId: string;
  inputVariables: Record<string, unknown>;
  context?: Record<string, unknown>;
  executionId?: string;
}

export interface FrameworkMetadata {
  id: string;
  name: string;
  shortName: string;
  keyPrinciples: string[];
  therapeuticGoals: string[];
  songStructureHint?: string;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns?: string[];
}

export interface ContentTemplateExecutionRequest {
  templateId?: string;
  contentType: 'article' | 'blog' | 'creative' | 'technical' | 'email' | 'social' | 'summary' | 'educational';
  userInput: string;
  parameters?: {
    maxLength?: number;
    temperature?: number;
    tone?: 'formal' | 'casual' | 'professional' | 'friendly' | 'persuasive';
    targetAudience?: string;
    style?: 'informative' | 'narrative' | 'promotional' | 'educational';
    language?: string;
  };
  context?: {
    userId?: string;
    sessionId?: string;
    culturalContext?: string;
    therapeuticFramework?: string;
    frameworkMetadata?: FrameworkMetadata;
    supportingFrameworks?: FrameworkMetadata[];
    detectedEmotions?: string[];
    detectedThemes?: string[];
    therapeuticApproach?: string;
    emotionalState?: string;
    userProfile?: Record<string, unknown>;
    sessionHistory?: Record<string, unknown>;
  };
  fallbackToDefault?: boolean;
}

export interface ContentTemplateExecutionResult {
  success: boolean;
  systemPrompt?: string;
  userPrompt?: string;
  processedPrompt?: string;
  templateUsed?: string;
  culturalAdaptations: string[];
  therapeuticInterventions: string[];
  processingTimeMs: number;
  qualityScore?: number;
  error?: string;
  warnings: string[];
}

interface TemplateExecuteResponse {
  systemPrompt?: string;
  userPrompt?: string;
  processedPrompt?: string;
  culturalAdaptationsApplied?: string[];
  therapeuticInterventions?: string[];
  processingTimeMs?: number;
  qualityScore?: number;
  warnings?: string[];
}

export class TemplateEngineServiceClient {
  private readonly httpClient: HttpClient;

  constructor() {
    const { httpClient } = createServiceClient('ai-config-service');
    this.httpClient = httpClient;
    logger.debug('Initialized with standardized service communication');
  }

  /**
   * Execute content template with intelligent fallbacks
   */
  async executeContentTemplate(request: ContentTemplateExecutionRequest): Promise<ContentTemplateExecutionResult> {
    try {
      // Determine template ID if not provided
      let templateId = request.templateId;

      if (!templateId) {
        templateId = await this.selectOptimalContentTemplate(request);
      }

      if (!templateId && !request.fallbackToDefault) {
        return {
          success: false,
          error: 'No suitable template found and fallback disabled',
          culturalAdaptations: [],
          therapeuticInterventions: [],
          processingTimeMs: 0,
          warnings: [],
        };
      }

      // If we have a template ID, try to execute it
      if (templateId) {
        const templateResult = await this.executeTemplate(templateId, request);
        if (templateResult.success) {
          return templateResult;
        }

        // If template execution failed, log warning and continue to fallback
        logger.warn('Template execution failed: {}', { data0: templateResult.error });
      }

      // Fallback to default content generation
      if (request.fallbackToDefault !== false) {
        return this.executeDefaultContentGeneration(request);
      }

      return {
        success: false,
        error: 'Template execution failed and fallback disabled',
        culturalAdaptations: [],
        therapeuticInterventions: [],
        processingTimeMs: 0,
        warnings: ['Template execution failed'],
      };
    } catch (error) {
      logger.error('Content template execution failed:', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (request.fallbackToDefault !== false) {
        return this.executeDefaultContentGeneration(request);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Content template execution failed',
        culturalAdaptations: [],
        therapeuticInterventions: [],
        processingTimeMs: 0,
        warnings: [],
      };
    }
  }

  /**
   * Get content templates by type
   */
  async getContentTemplates(contentType?: string): Promise<Record<string, unknown>[]> {
    try {
      const response = await this.makeRequest<Record<string, unknown>[]>('/api/templates/category/content', 'GET');

      if (!response.success) {
        logger.warn('Failed to get content templates:', { data: response.error });
        return [];
      }

      let templates = response.data || [];

      // Filter by content type if specified
      if (contentType) {
        templates = templates.filter((template: Record<string, unknown>) =>
          (template.variables as Array<Record<string, unknown>>)?.some(
            (v: Record<string, unknown>) =>
              v.name === 'content_type' && (!v.options || (v.options as string[]).includes(contentType))
          )
        );
      }

      return templates;
    } catch (error) {
      logger.error('Failed to get content templates:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Validate content template YAML
   */
  async validateContentTemplate(yamlContent: string): Promise<{ isValid: boolean; errors: string[] }> {
    try {
      const response = await this.makeRequest<{ isValid: boolean; errors: string[] }>(
        '/api/templates/validate',
        'POST',
        { yamlContent }
      );

      if (response.success && response.data) {
        return response.data;
      }

      return {
        isValid: false,
        errors: [response.error || 'Validation failed'],
      };
    } catch (error) {
      logger.error('Content template validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Validation error'],
      };
    }
  }

  /**
   * Check if template engine service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await this.makeHealthCheck();
    } catch (error) {
      logger.warn('Template engine service availability check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get content template analytics
   */
  async getContentTemplateAnalytics(templateId: string): Promise<Record<string, unknown> | undefined> {
    try {
      const response = await this.makeRequest<Record<string, unknown>>(`/api/templates/${templateId}/analytics`, 'GET');
      return response.success ? response.data : undefined;
    } catch (error) {
      logger.error('Failed to get template analytics:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  // Private helper methods

  private async selectOptimalContentTemplate(request: ContentTemplateExecutionRequest): Promise<string | undefined> {
    try {
      // Get compatible templates based on content type and context
      const params = new URLSearchParams();
      if (request.context?.culturalContext) {
        params.append('culturalContext', request.context.culturalContext);
      }
      if (request.context?.therapeuticFramework) {
        params.append('therapeuticFramework', request.context.therapeuticFramework);
      }
      const url = `/api/templates/compatible${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.makeRequest<Record<string, unknown>[]>(url, 'GET');

      if (!response.success || !response.data) {
        logger.warn('No compatible templates found');
        return undefined;
      }

      // Filter by content type
      const contentTemplates = response.data.filter((template: Record<string, unknown>) => {
        if (template.category !== 'content') return false;

        // Check if template supports the content type
        const contentTypeVar = (template.variables as Array<Record<string, unknown>>)?.find(
          (v: Record<string, unknown>) => v.name === 'content_type'
        );
        return (
          !contentTypeVar ||
          !contentTypeVar.options ||
          (contentTypeVar.options as string[]).includes(request.contentType)
        );
      });

      if (contentTemplates.length === 0) {
        logger.warn('No content templates found for type:', { data: request.contentType });
        return undefined;
      }

      // Select best template based on usage stats and compatibility
      const bestTemplate = contentTemplates.reduce(
        (best: Record<string, unknown>, current: Record<string, unknown>) => {
          const bestScore = ((best.usageCount as number) || 0) * ((best.successRate as number) || 0.5);
          const currentScore = ((current.usageCount as number) || 0) * ((current.successRate as number) || 0.5);
          return currentScore > bestScore ? current : best;
        }
      );

      logger.info('Selected template: {}', { data0: bestTemplate.templateId });
      return bestTemplate.templateId as string;
    } catch (error) {
      logger.error('Failed to select optimal template:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private async executeTemplate(
    templateId: string,
    request: ContentTemplateExecutionRequest
  ): Promise<ContentTemplateExecutionResult> {
    const startTime = Date.now();

    try {
      const templateRequest: TemplateExecuteRequest = {
        templateId,
        inputVariables: {
          user_input: request.userInput,
          content_type: request.contentType,
          ...request.parameters,
        },
        context: request.context,
        executionId: `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      const response = await this.makeRequest<TemplateExecuteResponse>(
        '/api/templates/execute',
        'POST',
        templateRequest as unknown as Record<string, unknown>
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Template execution failed',
          culturalAdaptations: [],
          therapeuticInterventions: [],
          processingTimeMs: Date.now() - startTime,
          warnings: [],
        };
      }

      const result = response.data;

      return {
        success: true,
        systemPrompt: result.systemPrompt,
        userPrompt: result.userPrompt,
        processedPrompt: result.processedPrompt,
        templateUsed: templateId,
        culturalAdaptations: result.culturalAdaptationsApplied || [],
        therapeuticInterventions: result.therapeuticInterventions || [],
        processingTimeMs: result.processingTimeMs ?? Date.now() - startTime,
        qualityScore: result.qualityScore,
        warnings: result.warnings || [],
      };
    } catch (error) {
      logger.error('Template execution failed', {
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Template execution error',
        culturalAdaptations: [],
        therapeuticInterventions: [],
        processingTimeMs: Date.now() - startTime,
        warnings: [],
      };
    }
  }

  private executeDefaultContentGeneration(request: ContentTemplateExecutionRequest): ContentTemplateExecutionResult {
    const startTime = Date.now();

    // Build a basic enhanced prompt as fallback
    let prompt = `Create ${request.contentType} content: ${request.userInput}`;

    if (request.parameters?.tone) {
      prompt += `\nTone: ${request.parameters.tone}`;
    }

    if (request.parameters?.targetAudience) {
      prompt += `\nTarget Audience: ${request.parameters.targetAudience}`;
    }

    if (request.parameters?.style) {
      prompt += `\nStyle: ${request.parameters.style}`;
    }

    if (request.parameters?.language) {
      prompt += `\nLanguage: ${request.parameters.language}`;
    }

    // Add cultural adaptations if available
    const culturalAdaptations: string[] = [];
    if (request.context?.culturalContext && request.context.culturalContext !== 'universal') {
      prompt += `\nCultural Context: Adapt for ${request.context.culturalContext} cultural context`;
      culturalAdaptations.push(request.context.culturalContext);
    }

    // Add therapeutic considerations with detailed framework metadata
    const therapeuticInterventions: string[] = [];

    if (request.context?.frameworkMetadata) {
      const fm = request.context.frameworkMetadata;
      prompt += `\n\n## Therapeutic Framework: ${fm.name} (${fm.shortName})`;
      prompt += `\nCore Principles: ${fm.keyPrinciples.slice(0, 3).join(', ')}`;
      prompt += `\nTherapeutic Goals: ${fm.therapeuticGoals.map(g => g.replace(/_/g, ' ')).join(', ')}`;
      therapeuticInterventions.push(fm.id);

      if (request.context.supportingFrameworks?.length) {
        const supporting = request.context.supportingFrameworks.slice(0, 2);
        prompt += `\nSupporting Approaches: ${supporting.map(f => `${f.shortName} (${f.keyPrinciples[0]})`).join('; ')}`;
        therapeuticInterventions.push(...supporting.map(f => f.id));
      }
    } else if (request.context?.therapeuticFramework) {
      prompt += `\nTherapeutic Framework: Apply ${request.context.therapeuticFramework} principles`;
      therapeuticInterventions.push(request.context.therapeuticFramework);
    }

    if (request.context?.therapeuticApproach) {
      prompt += `\n\n## Therapeutic Approach\n${request.context.therapeuticApproach}`;
    }

    if (request.context?.detectedEmotions?.length) {
      prompt += `\nDetected Emotions: ${request.context.detectedEmotions.join(', ')}`;
    }

    if (request.context?.detectedThemes?.length) {
      prompt += `\nIdentified Themes: ${request.context.detectedThemes.join(', ')}`;
    }

    logger.info('Using default content generation fallback');

    return {
      success: true,
      processedPrompt: prompt,
      templateUsed: 'default-fallback',
      culturalAdaptations,
      therapeuticInterventions,
      processingTimeMs: Date.now() - startTime,
      qualityScore: 0.7, // Default quality score for fallback
      warnings: ['Using fallback prompt generation - template engine unavailable'],
    };
  }

  /**
   * Make HTTP request to template engine service using HTTP client
   */
  private async makeRequest<T = Record<string, unknown>>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: Record<string, unknown>
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    return withServiceResilience(
      'ai-config-service',
      `template:${method}:${endpoint}`,
      async () => {
        try {
          let response;
          const url = `${getServiceUrl('ai-config-service')}${endpoint}`;
          const options = {
            headers: {
              'X-Service-ID': 'ai-content-service',
            },
          };

          switch (method) {
            case 'GET':
              response = await this.httpClient.get(url, options);
              break;
            case 'POST':
              response = await this.httpClient.post(url, body, options);
              break;
            case 'PUT':
              response = await this.httpClient.put(url, body, options);
              break;
            case 'DELETE':
              response = await this.httpClient.delete(url, options);
              break;
            default:
              throw TemplateError.internalError(`Unsupported HTTP method: ${method}`);
          }

          return {
            success: true,
            data: response.data as T,
          };
        } catch (error) {
          logger.error('Request failed: ${method} ${endpoint}', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Request failed',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Check if template engine service is healthy
   */
  private async makeHealthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/health', 'GET');
      return response.success;
    } catch (error) {
      logger.error('Health check failed:', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  // ===== ARTWORK TEMPLATE EXECUTION =====
  // Migrated from music-service for centralized image generation

  /**
   * Execute artwork template to generate image prompt
   * Supports album-artwork, track-artwork, playlist-artwork, and book-cover-artwork templates
   * Note: track-artwork uses the album-artwork template (they are functionally equivalent)
   */
  async executeArtworkTemplate(request: {
    templateId: 'album-artwork' | 'track-artwork' | 'playlist-artwork' | 'book-cover-artwork';
    variables: Record<string, string | undefined>;
  }): Promise<{
    success: boolean;
    prompt?: string;
    templateUsed: string;
    error?: string;
  }> {
    return withServiceResilience(
      'ai-config-service',
      'executeArtworkTemplate',
      async () => {
        try {
          // Map track-artwork to album-artwork template (they are functionally equivalent)
          const actualTemplateId = request.templateId === 'track-artwork' ? 'album-artwork' : request.templateId;

          const templateData = await this.httpClient.post<{
            success?: boolean;
            data?: { result?: string };
          }>(getServiceUrl('ai-config-service') + '/api/templates/execute', {
            templateId: actualTemplateId,
            variables: request.variables,
            options: {
              timeout: 15000,
              maxRetries: 1,
            },
          });

          if (templateData?.success && templateData?.data?.result) {
            logger.info('Artwork prompt generated from template', {
              templateId: request.templateId,
              actualTemplateId,
              promptLength: templateData.data.result.length,
            });

            return {
              success: true,
              prompt: templateData.data.result,
              templateUsed: request.templateId, // Return original requested type
            };
          }

          logger.warn('Template execution returned no result', {
            templateId: request.templateId,
            actualTemplateId,
          });

          return {
            success: false,
            templateUsed: 'fallback',
            error: 'Template execution returned no result',
          };
        } catch (error) {
          logger.warn('Artwork template execution failed', {
            templateId: request.templateId,
            error: error instanceof Error ? error.message : String(error),
          });

          return {
            success: false,
            templateUsed: 'fallback',
            error: error instanceof Error ? error.message : 'Template execution failed',
          };
        }
      },
      'ai-provider'
    );
  }

  /**
   * Execute album artwork template (convenience method)
   */
  async executeAlbumArtworkTemplate(request: {
    title: string;
    lyricsKeywords: string;
    style?: string;
    genre?: string;
    mood?: string;
    culturalStyle?: string;
  }): Promise<{
    success: boolean;
    prompt?: string;
    templateUsed: string;
    error?: string;
  }> {
    return this.executeArtworkTemplate({
      templateId: 'album-artwork',
      variables: {
        title: request.title,
        lyrics_keywords: request.lyricsKeywords || 'personal journey, emotion, growth',
        style: request.style || 'digital art',
        genre: request.genre || 'contemporary',
        mood: request.mood || 'peaceful',
        cultural_style: request.culturalStyle || 'universal',
      },
    });
  }

  /**
   * Execute track artwork template (uses album-artwork template - functionally equivalent)
   */
  async executeTrackArtworkTemplate(request: {
    title: string;
    lyricsKeywords: string;
    style?: string;
    genre?: string;
    mood?: string;
    culturalStyle?: string;
  }): Promise<{
    success: boolean;
    prompt?: string;
    templateUsed: string;
    error?: string;
  }> {
    return this.executeArtworkTemplate({
      templateId: 'track-artwork',
      variables: {
        title: request.title,
        lyrics_keywords: request.lyricsKeywords || 'personal journey, emotion, growth',
        style: request.style || 'digital art',
        genre: request.genre || 'contemporary',
        mood: request.mood || 'peaceful',
        cultural_style: request.culturalStyle || 'universal',
      },
    });
  }

  /**
   * Execute book cover artwork template
   */
  async executeBookCoverArtworkTemplate(request: {
    title: string;
    description: string;
    themes?: string;
    bookType?: string;
    style?: string;
  }): Promise<{
    success: boolean;
    prompt?: string;
    templateUsed: string;
    error?: string;
  }> {
    return this.executeArtworkTemplate({
      templateId: 'book-cover-artwork',
      variables: {
        title: request.title,
        description: request.description,
        themes: request.themes || 'inspiration and growth',
        bookType: request.bookType,
        style: request.style || 'elegant, sophisticated',
      },
    });
  }

  /**
   * Execute playlist artwork template
   */
  async executePlaylistArtworkTemplate(request: {
    playlistName: string;
    mood: string;
    genre: string;
    description?: string;
    trackCount?: number;
  }): Promise<{
    success: boolean;
    prompt?: string;
    templateUsed: string;
    error?: string;
  }> {
    return this.executeArtworkTemplate({
      templateId: 'playlist-artwork',
      variables: {
        playlist_name: request.playlistName,
        mood: request.mood,
        genre: request.genre,
        description: request.description,
        track_count: request.trackCount?.toString(),
      },
    });
  }
}
