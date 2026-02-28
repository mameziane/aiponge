/**
 * Template Service Client for AI Music Service
 * Specialized client for music generation templates using consolidated ai-config-service
 * Updated to use standardized ServiceCallClient for consistent service communication
 */

import { createServiceClient, type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import { serializeError, withServiceResilience } from '@aiponge/platform-core';

const logger = getLogger('music-service-templateengineserviceclient');

const SERVICE_NAME = 'ai-config-service';

export const MUSIC_TEMPLATE_IDS = {
  MUSIC_GENERATION: 'music-generation-v2',
  LYRICS_GENERATION: 'lyrics-generation-v2',
  MUSIC_PERSONALIZATION: 'music-personalization',
  CULTURAL_ADAPTATION: 'music-cultural-adaptation-v1',
  THERAPEUTIC_MUSIC: 'therapeutic-music-generation-v1',
  MUSIC_ENHANCEMENT: 'music-prompt-enhancement-v1',
  ALBUM_ARTWORK: 'album-artwork',
  IMAGE_ANALYSIS: 'image-analysis',
  PLAYLIST_ARTWORK: 'playlist-artwork',
} as const;

export interface MusicFrameworkMetadata {
  id: string;
  name: string;
  shortName: string;
  keyPrinciples: string[];
  therapeuticGoals: string[];
  songStructureHint?: string;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns?: string[];
}

export interface MusicTemplateExecutionRequest {
  templateId?: string;
  musicType: 'song' | 'instrumental' | 'jingle' | 'background' | 'soundtrack' | 'loop';
  userInput: string;
  parameters?: {
    style?: string;
    genre?: string;
    mood?: string;
    tempo?: number;
    key?: string;
    duration?: number;
    culturalStyle?: string;
    instrumentType?: string;
    wellbeingPurpose?: string;
    [key: string]: unknown;
  };
  context?: {
    userId?: string;
    sessionId?: string;
    culturalContext?: string;
    therapeuticFramework?: string;
    frameworkMetadata?: MusicFrameworkMetadata;
    supportingFrameworks?: MusicFrameworkMetadata[];
    detectedEmotions?: string[];
    detectedThemes?: string[];
    therapeuticApproach?: string;
    songStructureGuidance?: string;
    emotionalState?: string;
    userProfile?: Record<string, unknown>;
    sessionHistory?: Record<string, unknown>;
  };
  fallbackToDefault?: boolean;
}

export interface MusicTemplateExecutionResult {
  success: boolean;
  systemPrompt?: string;
  userPrompt?: string;
  enhancedPrompt?: string;
  templateUsed?: string;
  culturalAdaptations: string[];
  therapeuticInterventions: string[];
  processingTimeMs: number;
  qualityScore?: number;
  musicParameters?: Record<string, unknown>;
  error?: string;
  warnings: string[];
}

export class MusicTemplateServiceClient {
  private readonly httpClient: HttpClient;

  constructor() {
    const { httpClient } = createServiceClient('ai-config-service');
    this.httpClient = httpClient;

    logger.debug('Initialized with standardized service communication');
  }

  /**
   * Execute music template with intelligent fallbacks
   */
  async executeMusicTemplate(request: MusicTemplateExecutionRequest): Promise<MusicTemplateExecutionResult> {
    return withServiceResilience('ai-config-service', 'executeMusicTemplate', async () => {
      const startTime = Date.now();

      try {
        // Determine template ID if not provided
        let templateId = request.templateId;

        if (!templateId) {
          templateId = this.selectOptimalTemplateId(request);
        }

        if (!templateId && !request.fallbackToDefault) {
          return {
            success: false,
            error: 'No suitable music template found and fallback disabled',
            culturalAdaptations: [],
            therapeuticInterventions: [],
            processingTimeMs: Date.now() - startTime,
            warnings: [],
          };
        }

        // If we have a template ID, try to execute it
        if (templateId) {
          try {
            // Build context with framework metadata for template engine
            const templateContext: Record<string, unknown> = {};
            if (request.context?.frameworkMetadata) {
              templateContext.frameworkMetadata = request.context.frameworkMetadata;
              templateContext.therapeuticFramework = request.context.therapeuticFramework;
            }
            if (request.context?.supportingFrameworks) {
              templateContext.supportingFrameworks = request.context.supportingFrameworks;
            }
            if (request.context?.songStructureGuidance) {
              templateContext.songStructureGuidance = request.context.songStructureGuidance;
            }
            if (request.context?.detectedEmotions) {
              templateContext.detectedEmotions = request.context.detectedEmotions;
            }
            if (request.context?.detectedThemes) {
              templateContext.detectedThemes = request.context.detectedThemes;
            }
            if (request.context?.therapeuticApproach) {
              templateContext.therapeuticApproach = request.context.therapeuticApproach;
            }

            const templateData = await this.httpClient.post<{ success: boolean; data?: { result?: string } }>(
              getServiceUrl(SERVICE_NAME) + '/api/templates/execute',
              {
                templateId,
                variables: {
                  user_input: request.userInput,
                  music_type: request.musicType,
                  ...request.parameters,
                },
                context: templateContext,
                options: {
                  timeout: 25000,
                  maxRetries: 2,
                },
              }
            );

            if (templateData.success && templateData.data) {
              const result = templateData.data;
              return {
                success: true,
                systemPrompt: '',
                userPrompt: request.userInput,
                enhancedPrompt: result.result,
                templateUsed: templateId,
                culturalAdaptations: this.extractCulturalAdaptations(request),
                therapeuticInterventions: this.extractTherapeuticInterventions(request),
                processingTimeMs: Date.now() - startTime,
                qualityScore: 0.85,
                musicParameters: request.parameters || {},
                warnings: [],
              };
            }
          } catch (templateError) {
            logger.warn('Template execution failed: {}', { data0: templateError });
          }
        }

        // Fallback to default music generation
        if (request.fallbackToDefault !== false) {
          return this.executeDefaultMusicGeneration(request, startTime);
        }

        return {
          success: false,
          error: 'Music template execution failed and fallback disabled',
          culturalAdaptations: [],
          therapeuticInterventions: [],
          processingTimeMs: Date.now() - startTime,
          warnings: ['Template execution failed'],
        };
      } catch (error) {
        logger.error('Music template execution failed:', {
          error: serializeError(error),
        });

        if (request.fallbackToDefault !== false) {
          return this.executeDefaultMusicGeneration(request, startTime);
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Music template execution failed',
          culturalAdaptations: [],
          therapeuticInterventions: [],
          processingTimeMs: Date.now() - startTime,
          warnings: [],
        };
      }
    });
  }

  /**
   * Get music templates by type
   */
  async getMusicTemplates(
    musicType?: string
  ): Promise<Array<{ id?: string; name: string; variables?: Array<{ name: string }>; tags?: string[] }>> {
    return withServiceResilience('ai-config-service', 'getMusicTemplates', async () => {
      try {
        const params = new URLSearchParams();
        params.append('category', 'music');
        if (musicType) {
          params.append('query', musicType);
        }
        params.append('isActive', 'true');
        params.append('limit', '50');

        const data = await this.httpClient.get<{
          success: boolean;
          data?: {
            templates?: Array<{ id?: string; name: string; variables?: Array<{ name: string }>; tags?: string[] }>;
          };
          error?: { message?: string };
        }>(getServiceUrl(SERVICE_NAME) + `/api/templates?${params.toString()}`);

        if (!data.success) {
          logger.warn('Failed to get music templates:', { data: data.error?.message });
          return [];
        }

        const templates = data.data?.templates || [];

        // Filter by music type if specified
        if (musicType) {
          return templates.filter(
            (template: { id?: string; name: string; variables?: Array<{ name: string }>; tags?: string[] }) =>
              template.variables?.some(
                (v: { name: string }) =>
                  v.name === 'music_type' ||
                  template.tags?.includes(musicType) ||
                  template.name.toLowerCase().includes(musicType.toLowerCase())
              )
          );
        }

        return templates;
      } catch (error) {
        logger.error('Failed to get music templates:', { error: serializeError(error) });
        return [];
      }
    });
  }

  /**
   * Get personalized music recommendations
   */
  async getPersonalizedMusicTemplate(request: {
    emotionalState?: string;
    culturalContext?: string;
    userProfile?: Record<string, unknown>;
    musicPreferences?: Record<string, unknown>;
  }): Promise<string | null> {
    return withServiceResilience('ai-config-service', 'getPersonalizedMusicTemplate', async () => {
      try {
        // Use personalization template to get recommendations
        const data = await this.httpClient.post<{ success: boolean; data?: { result?: string } }>(
          getServiceUrl(SERVICE_NAME) + '/api/templates/execute',
          {
            templateId: MUSIC_TEMPLATE_IDS.MUSIC_PERSONALIZATION,
            variables: {
              user_input: 'Generate personalized music recommendations',
              emotional_state: request.emotionalState || 'neutral',
              personality_summary: this.summarizePersonality(request.userProfile || {}),
              cultural_context: request.culturalContext || 'universal',
              user_goals: request.userProfile?.goals || 'general wellness',
              music_experience: request.userProfile?.musicExperience || 'intermediate',
              previous_music_preferences: JSON.stringify(request.musicPreferences || {}),
            },
          }
        );

        if (data.success && data.data?.result) {
          // Extract template recommendation from the response
          return this.extractTemplateRecommendation(data.data.result);
        }

        return null;
      } catch (error) {
        logger.error('Failed to get personalized template:', {
          error: serializeError(error),
        });
        return null;
      }
    });
  }

  /**
   * Validate music template YAML
   */
  async validateMusicTemplate(yamlContent: string): Promise<{ isValid: boolean; errors: string[] }> {
    return withServiceResilience('ai-config-service', 'validateMusicTemplate', async () => {
      try {
        const data = await this.httpClient.post<{
          success: boolean;
          data?: { isValid: boolean; errors?: string[] };
          error?: { message?: string };
        }>(getServiceUrl(SERVICE_NAME) + '/api/templates/validate', {
          content: yamlContent,
          category: 'music',
        });

        if (data.success && data.data) {
          return {
            isValid: data.data.isValid,
            errors: data.data.errors || [],
          };
        }

        return {
          isValid: false,
          errors: [data.error?.message || 'Validation failed'],
        };
      } catch (error) {
        logger.error('Music template validation failed', { error: serializeError(error) });
        return {
          isValid: false,
          errors: [error instanceof Error ? error.message : 'Validation error'],
        };
      }
    });
  }

  /**
   * Check if template service is available
   */
  async isAvailable(): Promise<boolean> {
    return withServiceResilience('ai-config-service', 'isAvailable', async () => {
      try {
        const data = await this.httpClient.get<{ success?: boolean }>(getServiceUrl(SERVICE_NAME) + '/health');
        return data.success === true;
      } catch (error) {
        logger.warn('Template service availability check failed', { error: serializeError(error) });
        return false;
      }
    });
  }

  /**
   * Get music template analytics
   */
  async getMusicTemplateAnalytics(templateId: string): Promise<Record<string, unknown> | null> {
    return withServiceResilience('ai-config-service', 'getMusicTemplateAnalytics', async () => {
      try {
        const data = await this.httpClient.get<{ success: boolean; data?: Record<string, unknown> }>(
          getServiceUrl(SERVICE_NAME) + `/api/templates/${templateId}/analytics`
        );
        return data.success ? (data.data ?? null) : null;
      } catch (error) {
        logger.error('Failed to get template analytics:', {
          error: serializeError(error),
        });
        return null;
      }
    });
  }

  /**
   * Render a template with given variables
   * Simple method for non-music templates (image analysis, playlist artwork, etc.)
   * Uses the /execute endpoint which returns systemPrompt and userPrompt
   */
  async renderTemplate(
    templateId: string,
    variables: Record<string, unknown>
  ): Promise<{ success: boolean; systemPrompt?: string; userPrompt?: string; error?: string }> {
    return withServiceResilience('ai-config-service', 'renderTemplate', async () => {
      try {
        const response = await this.httpClient.post<{
          success: boolean;
          data?: {
            success: boolean;
            systemPrompt?: string;
            userPrompt?: string;
          };
          error?: { message?: string };
        }>(getServiceUrl(SERVICE_NAME) + '/api/templates/execute', {
          templateId,
          variables,
        });

        if (response.success && response.data?.success) {
          return {
            success: true,
            systemPrompt: response.data.systemPrompt,
            userPrompt: response.data.userPrompt,
          };
        }

        return {
          success: false,
          error: response.error?.message || 'Template rendering failed',
        };
      } catch (error) {
        logger.error('Failed to render template:', {
          templateId,
          error: serializeError(error),
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Template rendering error',
        };
      }
    });
  }

  // Private helper methods

  private selectOptimalTemplateId(request: MusicTemplateExecutionRequest): string {
    // Select template based on music type and context
    if (request.context?.therapeuticFramework) {
      return MUSIC_TEMPLATE_IDS.THERAPEUTIC_MUSIC;
    }

    if (request.context?.culturalContext && request.context.culturalContext !== 'universal') {
      return MUSIC_TEMPLATE_IDS.CULTURAL_ADAPTATION;
    }

    if (request.musicType === 'song') {
      return MUSIC_TEMPLATE_IDS.LYRICS_GENERATION;
    }

    // Default to general music generation template
    return MUSIC_TEMPLATE_IDS.MUSIC_GENERATION;
  }

  private extractCulturalAdaptations(request: MusicTemplateExecutionRequest): string[] {
    const adaptations: string[] = [];

    if (request.context?.culturalContext && request.context.culturalContext !== 'universal') {
      adaptations.push(request.context.culturalContext);
    }

    if (request.parameters?.culturalStyle) {
      adaptations.push(request.parameters.culturalStyle);
    }

    return adaptations;
  }

  private extractTherapeuticInterventions(request: MusicTemplateExecutionRequest): string[] {
    const interventions: string[] = [];

    if (request.context?.therapeuticFramework) {
      interventions.push(request.context.therapeuticFramework);
    }

    if (request.parameters?.wellbeingPurpose) {
      interventions.push(request.parameters.wellbeingPurpose);
    }

    return interventions;
  }

  private executeDefaultMusicGeneration(
    request: MusicTemplateExecutionRequest,
    startTime: number
  ): MusicTemplateExecutionResult {
    // Build a basic enhanced prompt as fallback
    let prompt = `Create ${request.musicType} music: ${request.userInput}`;

    if (request.parameters?.style) {
      prompt += `\nStyle: ${request.parameters.style}`;
    }

    if (request.parameters?.genre) {
      prompt += `\nGenre: ${request.parameters.genre}`;
    }

    if (request.parameters?.mood) {
      prompt += `\nMood: ${request.parameters.mood}`;
    }

    if (request.parameters?.tempo) {
      prompt += `\nTempo: ${request.parameters.tempo} BPM`;
    }

    if (request.parameters?.key) {
      prompt += `\nKey: ${request.parameters.key}`;
    }

    if (request.parameters?.duration) {
      prompt += `\nDuration: ${request.parameters.duration} seconds`;
    }

    if (request.parameters?.instrumentType) {
      prompt += `\nInstruments: ${request.parameters.instrumentType}`;
    }

    // Add cultural adaptations if available
    const culturalAdaptations: string[] = [];
    if (request.context?.culturalContext && request.context.culturalContext !== 'universal') {
      prompt += `\nCultural Style: Incorporate ${request.context.culturalContext} musical elements`;
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

      if (fm.songStructureHint) {
        prompt += `\n\n## Song Structure Guidance\n${fm.songStructureHint}`;
      }

      if (request.context.supportingFrameworks?.length) {
        const supporting = request.context.supportingFrameworks.slice(0, 2);
        prompt += `\nSupporting Approaches: ${supporting.map(f => `${f.shortName} (${f.keyPrinciples[0]})`).join('; ')}`;
        therapeuticInterventions.push(...supporting.map(f => f.id));
      }
    } else if (request.context?.therapeuticFramework) {
      prompt += `\nTherapeutic Purpose: Apply ${request.context.therapeuticFramework} principles for wellness`;
      therapeuticInterventions.push(request.context.therapeuticFramework);
    }

    if (request.context?.songStructureGuidance) {
      prompt += `\n\n## Song Structure\n${request.context.songStructureGuidance}`;
    }

    if (request.context?.detectedEmotions?.length) {
      prompt += `\nDetected Emotions to Address: ${request.context.detectedEmotions.join(', ')}`;
    }

    if (request.context?.detectedThemes?.length) {
      prompt += `\nLife Themes to Explore: ${request.context.detectedThemes.join(', ')}`;
    }

    if (request.context?.therapeuticApproach) {
      prompt += `\n\n## Therapeutic Approach\n${request.context.therapeuticApproach}`;
    }

    if (request.parameters?.wellbeingPurpose) {
      prompt += `\nWellbeing Purpose: ${request.parameters.wellbeingPurpose}`;
      therapeuticInterventions.push(request.parameters.wellbeingPurpose);
    }

    // Add quality requirements
    if (request.parameters?.quality) {
      prompt += `\nQuality Level: ${request.parameters.quality}`;
    }

    logger.info('🎵 [MusicTemplateServiceClient] Using default music generation fallback', {
      module: 'music_service_template_engine_service_client',
      operation: 'executeTemplate',
      phase: 'fallback_mode_activated',
    });

    return {
      success: true,
      enhancedPrompt: prompt,
      templateUsed: 'default-fallback',
      culturalAdaptations,
      therapeuticInterventions,
      processingTimeMs: Date.now() - startTime,
      qualityScore: 0.7, // Default quality score for fallback
      musicParameters: request.parameters || {},
      warnings: ['Using fallback prompt generation - template service unavailable'],
    };
  }

  private summarizePersonality(userProfile?: Record<string, unknown>): string {
    if (!userProfile?.personality) {
      return 'balanced personality with moderate preferences';
    }

    if (typeof userProfile.personality === 'string') {
      return userProfile.personality;
    }

    // Extract high traits from personality object
    const traits = Object.entries(userProfile.personality as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'number' && value > 0.7)
      .map(([trait]) => trait);

    return traits.length > 0 ? traits.join(', ') : 'balanced personality';
  }

  private extractTemplateRecommendation(prompt: string): string | null {
    // Try to extract template recommendation from personalization output
    const templateMatch = prompt.match(/recommend.*template[:\s]*([a-zA-Z0-9\-_]+)/i);
    if (templateMatch) {
      return templateMatch[1];
    }

    // Check for specific music type mentions
    if (prompt.toLowerCase().includes('electronic') || prompt.toLowerCase().includes('synthetic')) {
      return 'music-generation'; // Electronic music template
    }

    if (prompt.toLowerCase().includes('acoustic') || prompt.toLowerCase().includes('traditional')) {
      return 'music-generation'; // Acoustic music template
    }

    return null;
  }

  private extractMusicParameters(resolvedVariables: Record<string, unknown>): Record<string, unknown> {
    const musicParams: Record<string, unknown> = {};

    // Map template variables to music parameters
    const paramMapping: Record<string, string> = {
      music_genres: 'genre',
      cultural_music_style: 'culturalStyle',
      lyrics_language: 'language',
      music_duration: 'duration',
      musical_complexity: 'complexity',
      instrumental_preference: 'instrumental',
      emotional_context: 'emotionalContext',
      production_style: 'productionStyle',
    };

    Object.entries(paramMapping).forEach(([templateVar, musicParam]) => {
      if (resolvedVariables[templateVar] !== undefined) {
        musicParams[musicParam] = resolvedVariables[templateVar];
      }
    });

    return musicParams;
  }

  /**
   * Execute artwork generation template
   * Returns a DALL-E prompt for album artwork based on song metadata
   */
  async executeArtworkTemplate(request: {
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
    return withServiceResilience('ai-config-service', 'executeArtworkTemplate', async () => {
      try {
        const templateData = await this.httpClient.post<{ success?: boolean; data?: { result?: string } }>(
          getServiceUrl(SERVICE_NAME) + '/api/templates/execute',
          {
            templateId: MUSIC_TEMPLATE_IDS.ALBUM_ARTWORK,
            variables: {
              title: request.title,
              lyrics_keywords: request.lyricsKeywords || 'personal journey, emotion, growth',
              style: request.style || 'digital art',
              genre: request.genre || 'contemporary',
              mood: request.mood || 'peaceful',
              cultural_style: request.culturalStyle || 'universal',
            },
            options: {
              timeout: 15000,
              maxRetries: 1,
            },
          }
        );

        if (templateData?.success && templateData?.data?.result) {
          logger.info('Artwork prompt generated from template', {
            templateId: MUSIC_TEMPLATE_IDS.ALBUM_ARTWORK,
            promptLength: templateData.data.result.length,
          });

          return {
            success: true,
            prompt: templateData.data.result,
            templateUsed: MUSIC_TEMPLATE_IDS.ALBUM_ARTWORK,
          };
        }

        logger.warn('Template execution returned no result', {
          templateId: MUSIC_TEMPLATE_IDS.ALBUM_ARTWORK,
        });

        return {
          success: false,
          templateUsed: 'fallback',
          error: 'Template execution returned no result',
        };
      } catch (error) {
        logger.warn('Artwork template execution failed', {
          templateId: MUSIC_TEMPLATE_IDS.ALBUM_ARTWORK,
          error: serializeError(error),
        });

        return {
          success: false,
          templateUsed: 'fallback',
          error: error instanceof Error ? error.message : 'Template execution failed',
        };
      }
    });
  }
}
