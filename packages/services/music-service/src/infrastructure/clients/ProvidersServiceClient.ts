/**
 * ProvidersServiceClient - HTTP client for ai-config-service integration
 * Handles music generation requests to AI providers through the configuration service
 */

import { type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import { withServiceResilience, HttpClient as PlatformHttpClient, parseServiceResponse, tryParseServiceResponse } from '@aiponge/platform-core';
import {
  MusicGenerationResponseSchema,
  MusicGenerationSuccessDataSchema,
  ProviderConfigurationResponseSchema,
  type MusicGenerationResponse,
  type MusicGenerationSuccessData,
  type ProviderConfigurationResponse,
} from '@aiponge/shared-contracts';

export interface MusicGenerationRequest {
  prompt: string;
  parameters: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export type { MusicGenerationResponse };

export interface MusicProviderStatus {
  providerId: string;
  status: string;
}

export interface MusicProviderHealthStatus {
  healthy: boolean;
  providers: Array<{ providerId: string; name: string; status: string }>;
}

interface ProvidersListResponse {
  providers: MusicProviderStatus[];
}

interface RecommendProviderResponse {
  recommendedProvider: string;
  reasoning?: string;
  alternatives?: string[];
}

interface MusicAnalysisResponse {
  success: boolean;
  analysis?: {
    genre: string;
    style: string;
    mood: string;
    tempo: number;
    key: string;
    instruments: string[];
    culturalStyle: string;
    confidenceScore: number;
  };
  error?: string;
}

interface ProviderPricingResponse {
  pricing: {
    providerId: string;
    costPerMinute: number;
    costByQuality: Record<string, number>;
    costByMusicType: Record<string, number>;
    minimumCost: number;
    currency: string;
  }[];
}

interface CostEstimateResponse {
  success: boolean;
  estimate?: {
    providerId: string;
    estimatedCost: number;
    currency: string;
    breakdown: {
      baseCost: number;
      qualityMultiplier: number;
      durationCost: number;
      totalCost: number;
    };
  };
  error?: string;
}

interface ImageGenerationApiResponse {
  success: boolean;
  artworkUrl?: string;
  data?: { url?: string; revised_prompt?: string };
  revisedPrompt?: string;
  metadata?: Record<string, unknown>;
  error?: string | { message?: string };
}


interface ModelConfiguration {
  model: string;
  fallbackModels?: string[];
  size?: string;
  providerType: 'llm' | 'image' | 'music' | 'audio';
}

interface HealthResponse {
  status: string;
}

const logger = getLogger('music-service:providers-client');

const SERVICE_NAME = 'ai-config-service';

export class ProvidersServiceClient {
  private httpClient: HttpClient;

  constructor() {
    this.httpClient = new PlatformHttpClient({
      timeout: 120000,
      retries: 2,
      useServiceAuth: true,
      serviceName: 'music-service',
    });

    logger.debug('Providers service client initialized with service auth + 120s timeout');
  }

  /**
   * Generate music using AI providers
   */
  async generateMusic(request: MusicGenerationRequest): Promise<MusicGenerationResponse> {
    return withServiceResilience(
      SERVICE_NAME,
      'generateMusic',
      async () => {
        try {
          logger.info('ProvidersServiceClient - Music generation request initiated', {
            serviceUrl: getServiceUrl(SERVICE_NAME),
            endpoint: '/api/music/generate',
            promptLength: request.prompt?.length,
            musicType: request.parameters.musicType,
            style: request.parameters.style,
            genre: request.parameters.genre,
            duration: request.parameters.duration,
            title: request.parameters.title,
            preferredProvider: request.options?.preferredProvider,
          });

          // CRITICAL: timeout should be at least 5 minutes (300 seconds) for music generation
          // MusicAPI.ai typically takes 60-120 seconds to generate a song
          const musicGenerationTimeout = (request.options?.timeout as number) || 300000; // 5 minutes default

          const data = await this.httpClient.post<MusicGenerationResponse>(
            getServiceUrl(SERVICE_NAME) + '/api/music/generate',
            {
              prompt: request.prompt,
              parameters: request.parameters,
              options: {
                timeout: musicGenerationTimeout,
                retries: request.options?.retries || 2,
                fallbackProviders: request.options?.fallbackProviders || ['musicapi', 'elevenlabs'],
                preferredProvider: request.options?.preferredProvider,
              },
            },
            {
              timeout: musicGenerationTimeout + 10000,
            }
          );

          logger.debug('ProvidersServiceClient - Received response from ai-config-service', {
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            success: data?.success,
          });

          if (data && data.success) {
            const rawInner = data.data || data;
            const parseResult = tryParseServiceResponse(
              MusicGenerationSuccessDataSchema,
              rawInner,
              SERVICE_NAME,
              'generateMusic'
            );

            const inner: MusicGenerationSuccessData = parseResult.success
              ? parseResult.data
              : (rawInner as MusicGenerationSuccessData);

            logger.debug('ProvidersServiceClient - Music generation completed - checking variations', {
              hasVariations: !!inner.variations,
              variationsCount: inner.variations?.length || 0,
              expectedCount: 2,
              contractValid: parseResult.success,
              warning:
                (inner.variations?.length || 0) !== 2
                  ? `Expected 2 but got ${inner.variations?.length || 0}`
                  : undefined,
              variationDetails: inner.variations?.map((v, idx) => ({
                number: idx + 1,
                variationNumber: v.variationNumber,
                hasAudioUrl: !!v.audioUrl,
                audioUrlPreview: v.audioUrl?.substring(0, 60),
                clipId: v.clipId,
              })),
              metadata: inner.metadata,
              providerId: inner.providerId,
            });

            return {
              success: true,
              audioUrl: inner.audioUrl,
              variations: inner.variations,
              lyrics: inner.lyrics,
              metadata: inner.metadata,
              providerId: inner.providerId,
              model: inner.model,
              cost: inner.cost,
              processingTimeMs: (inner.processingTimeMs || (inner.metadata as Record<string, unknown>)?.processingTimeMs) as number | undefined,
              enhancedPrompt: inner.enhancedPrompt,
            };
          } else {
            const errorSource = data?.data || data;
            const errorMessage =
              typeof errorSource?.error === 'string'
                ? errorSource.error
                : (errorSource?.error as { type?: string; message?: string })?.message ||
                  (errorSource?.error as { type?: string; message?: string })?.type ||
                  'Music generation failed - no success flag in response';

            logger.error('ProvidersServiceClient - Music generation failed', {
              hasData: !!data,
              dataSuccess: data?.success,
              error: errorSource?.error,
              extractedMessage: errorMessage,
            });
            return {
              success: false,
              error: errorMessage,
            };
          }
        } catch (error) {
          logger.error('ProvidersServiceClient - Music generation request threw error', {
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            musicType: request.parameters.musicType,
            style: request.parameters.style,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Music generation request failed',
          };
        }
      },
      'ai-provider'
    );
  }

  /**
   * Get available music providers and their status
   * Uses /api/providers/catalog endpoint and filters for music providers
   */
  async getMusicProviders(): Promise<{
    success: boolean;
    providers?: MusicProviderStatus[];
    error?: string;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'getMusicProviders',
      async () => {
        try {
          const data = await this.httpClient.get<{
            success: boolean;
            data?: { music?: Array<{ id: string; name: string; description: string }> };
          }>(getServiceUrl(SERVICE_NAME) + '/api/providers/catalog');

          if (data.success && data.data?.music) {
            const providers: MusicProviderStatus[] = data.data.music.map(p => ({
              providerId: p.id,
              name: p.name,
              status: 'available' as const,
              capabilities: ['music_generation'],
              performance: { averageLatencyMs: 0, successRate: 1, requestsPerMinute: 0 },
            }));
            return { success: true, providers };
          }

          return { success: true, providers: [] };
        } catch (error) {
          logger.error('Failed to get music providers', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get providers',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Get provider health status
   * Uses /api/providers/health endpoint
   */
  async getProviderHealth(): Promise<{
    success: boolean;
    health?: MusicProviderHealthStatus;
    error?: string;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderHealth',
      async () => {
        try {
          const data = await this.httpClient.get<{
            success: boolean;
            data?: { providers?: Array<{ providerId: string; name: string; status: string }> };
          }>(getServiceUrl(SERVICE_NAME) + '/api/providers/health');

          if (data.success && data.data?.providers) {
            const musicProviders = data.data.providers.filter(
              p => p.providerId === 'musicapi' || p.name.toLowerCase().includes('music')
            );
            return {
              success: true,
              health: {
                healthy: musicProviders.every(p => p.status === 'healthy'),
                providers: musicProviders.map(p => ({
                  providerId: p.providerId,
                  name: p.name,
                  status: p.status,
                })),
              },
            };
          }

          return { success: true, health: { healthy: true, providers: [] } };
        } catch (error) {
          logger.error('Failed to get provider health status', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get provider health',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Get recommended provider for specific music generation requirements
   * Note: Returns default 'musicapi' provider as recommendation endpoint is not implemented
   */
  async getRecommendedProvider(requirements: {
    musicType: string;
    style: string;
    genre?: string;
    duration?: number;
    quality?: string;
    budget?: number;
  }): Promise<{
    success: boolean;
    providerId?: string;
    reasoning?: string;
    alternatives?: string[];
    error?: string;
  }> {
    logger.debug('getRecommendedProvider called - returning default musicapi provider', {
      musicType: requirements.musicType,
      style: requirements.style,
    });
    return {
      success: true,
      providerId: 'musicapi',
      reasoning: 'MusicAPI.ai is the default provider for all music generation',
      alternatives: [],
    };
  }

  /**
   * Analyze music for style, genre, and characteristics
   * Note: Music analysis endpoint is not implemented - returns stub response
   */
  async analyzeMusicStyle(audioUrl: string): Promise<{
    success: boolean;
    analysis?: {
      genre: string;
      style: string;
      mood: string;
      tempo: number;
      key: string;
      instruments: string[];
      culturalStyle: string;
      confidenceScore: number;
    };
    error?: string;
  }> {
    logger.warn('analyzeMusicStyle called but endpoint not implemented', { audioUrl });
    return {
      success: false,
      error: 'Music analysis feature is not yet implemented',
    };
  }

  /**
   * Get provider pricing and cost estimates
   * Note: Returns default pricing as endpoint is not implemented
   */
  async getProviderPricing(providerId?: string): Promise<{
    success: boolean;
    pricing?: {
      providerId: string;
      costPerMinute: number;
      costByQuality: Record<string, number>;
      costByMusicType: Record<string, number>;
      minimumCost: number;
      currency: string;
    }[];
    error?: string;
  }> {
    logger.debug('getProviderPricing called - returning default pricing', { providerId });
    return {
      success: true,
      pricing: [
        {
          providerId: providerId || 'musicapi',
          costPerMinute: 1,
          costByQuality: { standard: 1, high: 2 },
          costByMusicType: { song: 1, instrumental: 1 },
          minimumCost: 1,
          currency: 'credits',
        },
      ],
    };
  }

  /**
   * Estimate cost for music generation request
   * Note: Returns default estimate as endpoint is not implemented
   */
  async estimateCost(request: { musicType: string; duration: number; quality: string; providerId?: string }): Promise<{
    success: boolean;
    estimate?: {
      providerId: string;
      estimatedCost: number;
      currency: string;
      breakdown: {
        baseCost: number;
        qualityMultiplier: number;
        durationCost: number;
        totalCost: number;
      };
    };
    error?: string;
  }> {
    logger.debug('estimateCost called - returning default estimate', {
      musicType: request.musicType,
      duration: request.duration,
    });
    const qualityMultiplier = request.quality === 'high' ? 2 : 1;
    const baseCost = 1;
    const durationCost = Math.ceil(request.duration / 60);
    const totalCost = baseCost * qualityMultiplier + durationCost;

    return {
      success: true,
      estimate: {
        providerId: request.providerId || 'musicapi',
        estimatedCost: totalCost,
        currency: 'credits',
        breakdown: {
          baseCost,
          qualityMultiplier,
          durationCost,
          totalCost,
        },
      },
    };
  }

  /**
   * Generate image using AI providers via centralized ProviderProxy
   * Routes through ai-config-service for consistent auth, circuit breaking, and monitoring
   */
  async generateImage(request: {
    prompt: string;
    providerId?: string;
    parameters?: {
      size?: string;
      quality?: string;
      style?: string;
      n?: number;
    };
  }): Promise<{
    success: boolean;
    artworkUrl?: string;
    revisedPrompt?: string;
    metadata?: Record<string, unknown>;
    error?: string;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'generateImage',
      async () => {
        try {
          logger.info('Generating image via centralized ProviderProxy', {
            promptLength: request.prompt.length,
            providerId: request.providerId,
            size: request.parameters?.size,
          });

          // Response structure: { success, data: { providerId, result, metadata, ... }, timestamp }
          const response = await this.httpClient.post<{
            success: boolean;
            data?: {
              providerId?: string;
              providerName?: string;
              success?: boolean;
              result?: string;
              metadata?: {
                artworkUrl?: string;
                revisedPrompt?: string;
                processingTimeMs?: number;
                isBase64?: boolean;
                responseFormat?: string;
              };
            };
            error?: { message?: string };
          }>(getServiceUrl(SERVICE_NAME) + '/api/providers/invoke', {
            providerId: request.providerId,
            operation: 'image_generation',
            payload: {
              prompt: request.prompt,
              size: request.parameters?.size || '1024x1024',
              quality: request.parameters?.quality || 'standard',
              style: request.parameters?.style || 'vivid',
              n: request.parameters?.n || 1,
            },
            options: {
              timeout: 90000,
            },
          });

          // Extract nested data from response
          const data = response.data;

          if (response.success && data?.result) {
            // Check if response is base64 encoded (from providers like Stable Diffusion)
            const isBase64 = data.metadata?.isBase64 || data.metadata?.responseFormat === 'base64';

            if (isBase64 && data.result) {
              // Convert base64 to data URL for now - caller can upload to storage if needed
              const dataUrl = `data:image/png;base64,${data.result}`;
              logger.info('Image generated with base64 response, converted to data URL', {
                providerId: data.providerId,
                base64Length: data.result.length,
              });
              return {
                success: true,
                artworkUrl: dataUrl,
                metadata: {
                  ...data.metadata,
                  isBase64: true,
                  originalProviderId: data.providerId,
                },
              };
            }

            // Standard URL response (DALL-E style)
            const artworkUrl = data.metadata?.artworkUrl || data.result;
            return {
              success: true,
              artworkUrl,
              revisedPrompt: data.metadata?.revisedPrompt,
              metadata: {
                ...data.metadata,
                originalProviderId: data.providerId,
              },
            };
          }

          return {
            success: false,
            error: response.error?.message || 'Image generation failed',
          };
        } catch (error) {
          logger.error('Image generation failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image generation failed',
          };
        }
      },
      'ai-provider'
    );
  }

  /**
   * Get credit cost for a specific provider from ai-config-service
   *
   * KNOWN LIMITATION: Hardcoded provider ID mapping
   * The ai-config-service uses numeric primary keys for providers, but this client
   * receives string provider IDs. Until ai-config-service supports string-based lookup,
   * we maintain a static mapping here.
   *
   * To fix: Add GET /api/providers/by-name/:name endpoint to ai-config-service
   */
  async getProviderCreditCost(providerId: string): Promise<{
    success: boolean;
    creditCost?: number;
    error?: string;
  }> {
    // KNOWN LIMITATION: Static mapping from string IDs to numeric database IDs
    // This should be replaced with dynamic lookup once ai-config-service supports it
    const providerIdMap: Record<string, number> = {
      'musicapi-ai': 1,
      elevenlabs: 2,
    };

    return withServiceResilience(
      SERVICE_NAME,
      'getProviderCreditCost',
      async () => {
        try {
          const numericId = providerIdMap[providerId];

          if (!numericId) {
            logger.warn('Unknown provider ID - not in static mapping, using default credit cost', {
              providerId,
              knownProviders: Object.keys(providerIdMap),
              limitation: 'Static provider ID mapping needs ai-config-service string lookup support',
            });
            return {
              success: true,
              creditCost: 15,
            };
          }

          const envelope = await this.httpClient.get<{ success: boolean; data?: ProviderConfigurationResponse }>(
            getServiceUrl('ai-config-service') + `/api/providers/configurations/${numericId}`
          );

          const rawInner = envelope?.data || envelope;
          const configResult = tryParseServiceResponse(
            ProviderConfigurationResponseSchema,
            rawInner,
            'ai-config-service',
            'getProviderCreditCost'
          );

          const parsed = configResult.success ? configResult.data : (rawInner as ProviderConfigurationResponse);
          if (parsed?.configuration?.creditCost !== undefined) {
            return {
              success: true,
              creditCost: parsed.configuration.creditCost,
            };
          } else {
            logger.warn('Provider configuration not found, using default credit cost', { providerId, numericId });
            return {
              success: true,
              creditCost: 15,
            };
          }
        } catch (error) {
          logger.warn('Failed to fetch provider credit cost, using default (15)', {
            error: error instanceof Error ? error.message : String(error),
            providerId,
          });
          return {
            success: true,
            creditCost: 15,
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Get model configuration for a specific provider type from cfg_provider_configs database
   * Single source of truth for AI model names - eliminates hardcoding
   *
   * @param providerType - Type of provider: 'llm', 'image', 'music', 'audio'
   * @param providerId - Optional specific provider ID (e.g., 'openai-dalle', 'openai')
   * @returns Model configuration with model name and fallbacks
   */
  async getModelConfiguration(
    providerType: 'llm' | 'image' | 'music' | 'audio',
    providerId?: string
  ): Promise<{
    success: boolean;
    config?: ModelConfiguration;
    error?: string;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'getModelConfiguration',
      async () => {
        try {
          // Fetch all configurations and filter by type
          const envelope = await this.httpClient.get<{
            success: boolean;
            data?: {
              providers: Array<{
                id: number;
                providerId: string;
                providerName: string;
                providerType: string;
                configuration: Record<string, unknown>;
                isActive: boolean;
                isPrimary: boolean;
              }>;
              total: number;
            };
          }>(getServiceUrl('ai-config-service') + '/api/providers/configurations');

          const inner = envelope?.data;
          if (!envelope.success || !inner?.providers) {
            logger.warn('Failed to fetch provider configurations from config service');
            return this.getDefaultModelConfig(providerType);
          }

          const providers = inner.providers.filter(
            p => p.providerType === providerType && p.isActive && (!providerId || p.providerId === providerId)
          );

          // Prefer primary provider, then first active one
          const provider = providers.find(p => p.isPrimary) || providers[0];

          if (!provider) {
            logger.warn('No active provider found for type', { providerType, providerId });
            return this.getDefaultModelConfig(providerType);
          }

          const config = provider.configuration as Record<string, unknown>;
          const requestTemplate = (config?.requestTemplate || {}) as Record<string, unknown>;
          const models = (config?.models || []) as string[];

          logger.debug('Retrieved model configuration from database', {
            providerType,
            providerId: provider.providerId,
            model: requestTemplate.model,
            fallbackModels: models,
          });

          return {
            success: true,
            config: {
              model: (requestTemplate.model as string) || models[0] || this.getDefaultModel(providerType),
              fallbackModels: models.length > 1 ? models.slice(1) : undefined,
              size: requestTemplate.size as string | undefined,
              providerType,
            },
          };
        } catch (error) {
          logger.warn('Error fetching model configuration, using defaults', {
            error: error instanceof Error ? error.message : String(error),
            providerType,
            providerId,
          });
          return this.getDefaultModelConfig(providerType);
        }
      },
      'internal-service'
    );
  }

  /**
   * Get default model configuration when database is unavailable
   * These should match the database defaults in cfg_provider_configs
   */
  private getDefaultModelConfig(providerType: 'llm' | 'image' | 'music' | 'audio'): {
    success: boolean;
    config: ModelConfiguration;
  } {
    return {
      success: true,
      config: {
        model: this.getDefaultModel(providerType),
        providerType,
      },
    };
  }

  private getDefaultModel(providerType: 'llm' | 'image' | 'music' | 'audio'): string {
    // Default models - MUST match cfg_provider_configs database values exactly
    const defaults: Record<string, string> = {
      llm: 'gpt-4o-mini',
      image: 'dall-e-3', // DALL-E 3 required for proper text exclusion in artwork
      music: 'sonic-v5',
      audio: 'whisper-1',
    };
    return defaults[providerType] || 'unknown';
  }

  /**
   * Get provider configuration including auth status (but NOT credentials)
   * Use this to check if a provider is properly configured
   */
  async getProviderStatus(providerId: string): Promise<{
    success: boolean;
    isConfigured: boolean;
    isActive: boolean;
    providerType?: string;
    error?: string;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'getProviderStatus',
      async () => {
        try {
          const data = await this.httpClient.get<{
            success: boolean;
            data?: {
              providerId: string;
              providerType: string;
              isActive: boolean;
              status: string;
            };
          }>(getServiceUrl(SERVICE_NAME) + `/api/providers/health?providerId=${providerId}`);

          if (data.success && data.data) {
            return {
              success: true,
              isConfigured: data.data.status !== 'unavailable',
              isActive: data.data.isActive,
              providerType: data.data.providerType,
            };
          }

          return {
            success: false,
            isConfigured: false,
            isActive: false,
            error: 'Provider not found',
          };
        } catch (error) {
          logger.error('Failed to get provider status', {
            providerId,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            isConfigured: false,
            isActive: false,
            error: error instanceof Error ? error.message : 'Failed to get provider status',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Analyze image using Vision API via centralized ProviderProxy
   * Routes through ai-config-service for consistent auth, monitoring, and circuit breaking
   */
  async analyzeImage(request: {
    artworkUrl: string;
    prompt: string;
    systemPrompt?: string;
    providerId?: string;
    options?: {
      model?: string;
      maxTokens?: number;
      imageDetail?: 'low' | 'high' | 'auto';
      responseFormat?: 'json' | 'text';
    };
  }): Promise<{
    success: boolean;
    result?: string;
    metadata?: Record<string, unknown>;
    error?: string;
  }> {
    return withServiceResilience(
      SERVICE_NAME,
      'analyzeImage',
      async () => {
        try {
          logger.info('Analyzing image via centralized ProviderProxy', {
            artworkUrlLength: request.artworkUrl.length,
            promptLength: request.prompt.length,
            providerId: request.providerId || 'openai-llm',
          });

          const envelope = await this.httpClient.post<{
            success: boolean;
            data?: {
              result?: string;
              metadata?: Record<string, unknown>;
              providerId?: string;
            };
            error?: { message?: string } | string;
          }>(getServiceUrl(SERVICE_NAME) + '/api/providers/invoke', {
            providerId: request.providerId || 'openai-llm',
            operation: 'image_analysis',
            payload: {
              prompt: request.prompt,
              artworkUrl: request.artworkUrl,
              systemPrompt: request.systemPrompt,
              model: request.options?.model || 'gpt-4o',
              max_tokens: request.options?.maxTokens || 1000,
              imageDetail: request.options?.imageDetail || 'low',
              response_format: request.options?.responseFormat === 'json' ? { type: 'json_object' } : undefined,
            },
            options: {
              timeout: 60000,
            },
          });

          const inner = envelope.data || envelope;
          if (envelope.success) {
            const innerData = inner as { result?: string; metadata?: Record<string, unknown> };
            return {
              success: true,
              result: innerData.result,
              metadata: innerData.metadata,
            };
          }

          const errSource = envelope.error || (inner as { error?: { message?: string } | string }).error;
          const errorMessage =
            typeof errSource === 'string' ? errSource : errSource?.message || 'Image analysis failed';
          return {
            success: false,
            error: errorMessage,
          };
        } catch (error) {
          logger.error('Image analysis failed via ProviderProxy', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image analysis failed',
          };
        }
      },
      'ai-provider'
    );
  }

  /**
   * Check if providers service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.getWithResponse<HealthResponse>(getServiceUrl(SERVICE_NAME) + '/health');
      return response.ok && response.data.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Update base URL for the service (useful for service discovery)
   */
  updateBaseUrl(newBaseUrl: string): void {
    // BaseURL configuration now handled by ServiceCallClient
    logger.info('Providers service base URL updated', {
      newBaseUrl,
    });
  }

  // Private helper methods
  private handleError(error: unknown): Error {
    if (error instanceof Object && 'response' in error) {
      // Server responded with error status
      const response = (error as Record<string, unknown>).response as Record<string, unknown>;
      const status = response.status as number;
      const data = response.data as Record<string, unknown>;
      const message = (data?.error as string) || (response.statusText as string) || 'Request failed';

      if (status === 400) {
        return new Error(`Bad Request: ${message}`);
      } else if (status === 401) {
        return new Error(`Authentication failed: ${message}`);
      } else if (status === 403) {
        return new Error(`Access denied: ${message}`);
      } else if (status === 404) {
        return new Error(`Service not found: ${message}`);
      } else if (status === 429) {
        return new Error(`Rate limit exceeded: ${message}`);
      } else if (status >= 500) {
        return new Error(`Server error: ${message}`);
      } else {
        return new Error(`Request failed (${status}): ${message}`);
      }
    } else if (error instanceof Object && 'request' in error) {
      // Request was made but no response received
      return new Error('No response from providers service - service may be unavailable');
    } else if (error instanceof Error) {
      // Request setup error
      return new Error(`Request setup error: ${error.message}`);
    } else {
      return new Error('Unknown error occurred in providers service');
    }
  }
}
