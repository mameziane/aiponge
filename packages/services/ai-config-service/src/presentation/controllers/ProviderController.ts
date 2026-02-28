/**
 * Provider Controller - HTTP endpoints for provider operations
 * Handles all provider-related API requests and routes them to ProviderProxy
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { withResilience, serializeError, errorMessage, createControllerHelpers } from '@aiponge/platform-core';
import { getProviderProxy } from '../../infrastructure/providers/services/ProviderProxyFactory';
import { ProviderRequest, ProviderSelection } from '../../domains/providers/application/interfaces/IProviderProxy';
import { ConfigEventPublisher } from '../../infrastructure/events/ConfigEventPublisher';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { IProviderConfigRepository } from '../../domains/providers/domain/repositories/IProviderConfigRepository';
import { getDatabase, createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { providerConfigurations, InsertProviderConfiguration } from '@schema/schema';
import { getLogger } from '../../config/service-urls';
import { ConfigError } from '../../application/errors';
import {
  InvokeProviderRequestSchema,
  SelectProviderRequestSchema,
  TestProviderRequestSchema,
  ProviderHealthQuerySchema,
  UsageStatisticsQuerySchema,
  ProviderCatalogQuerySchema,
  LoadBalancingConfigSchema,
  GenerateMusicProviderSchema,
} from '@aiponge/shared-contracts';

const logger = getLogger('ai-config-service-providercontroller');

type ProviderCategory = 'llm-text' | 'llm-image' | 'music';

interface ProviderCatalogItem {
  id: string;
  name: string;
  description: string;
  models: string[];
  strengths: string[];
}

interface MusicApiClip {
  audio_url: string;
  clip_id: string;
  state: string;
  image_url?: string;
  video_url?: string;
  duration?: number;
  error?: string;
}

interface MusicApiResponse {
  task_id: string;
  code?: number;
  message?: string;
  data?: MusicApiClip[];
}

interface ProviderConfigurationData {
  endpoint?: string;
  requestTemplate?: Record<string, unknown>;
  responseMapping?: Record<string, unknown>;
  models?: string[];
  strengths?: string[];
  [key: string]: unknown;
}

const MUSICAPI_BASE_URL = process.env.MUSICAPI_BASE_URL || 'https://api.musicapi.ai';

const { handleRequest } = createControllerHelpers('ai-config-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class ProviderController {
  /**
   * POST /api/providers/invoke
   * Invoke a provider with automatic selection and failover
   */
  static async invokeProvider(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Invoke provider failed',
      handler: async () => {
        const validatedRequest = InvokeProviderRequestSchema.parse(req.body);
        const providerRequest: ProviderRequest = {
          providerId: validatedRequest.providerId,
          operation: validatedRequest.operation,
          payload: validatedRequest.payload,
          options: validatedRequest.options,
        };
        const providerProxy = getProviderProxy();
        const result = await providerProxy.invoke(providerRequest);
        logger.info('Successfully invoked {} for {}', { data0: result.providerId, data1: validatedRequest.operation });
        return result;
      },
    });
  }

  /**
   * POST /api/providers/select
   * Select the best provider for a given operation
   */
  static async selectProvider(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Select provider failed',
      handler: async () => {
        const validatedRequest = SelectProviderRequestSchema.parse(req.body);
        const selection: ProviderSelection = {
          operation: validatedRequest.operation,
          requirements: validatedRequest.requirements,
        };
        const providerProxy = getProviderProxy();
        const result = await providerProxy.selectProvider(selection);
        logger.info('Selected provider {} for {}', { data0: result.primaryProvider.id, data1: selection.operation });
        return result;
      },
    });
  }

  /**
   * GET /api/providers/health
   * Get health status of providers
   */
  static async getProviderHealth(req: Request, res: Response): Promise<void> {
    try {
      const validatedQuery = ProviderHealthQuerySchema.parse(req.query);
      const providerProxy = getProviderProxy();

      if (validatedQuery.providerId) {
        // Get health for specific provider
        const health = await providerProxy.getProviderHealthById(validatedQuery.providerId);

        if (!health) {
          ServiceErrors.notFound(res, `Provider ${validatedQuery.providerId}`, req);
          return;
        }

        sendSuccess(res, health);
      } else {
        // Get health for all providers
        const healthChecks = await providerProxy.getProviderHealth();

        sendSuccess(res, {
          providers: healthChecks,
          summary: {
            total: healthChecks.length,
            healthy: healthChecks.filter(h => h.status === 'healthy').length,
            degraded: healthChecks.filter(h => h.status === 'degraded').length,
            unhealthy: healthChecks.filter(h => h.status === 'unhealthy').length,
            unavailable: healthChecks.filter(h => h.status === 'unavailable').length,
          },
        });
      }

      logger.info('❤️ Retrieved health status for {}', { data0: validatedQuery.providerId || 'all providers' });
    } catch (error) {
      logger.error('Get provider health failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Get provider health failed', req);
      return;
    }
  }

  /**
   * POST /api/providers/test
   * Test a provider with a sample request
   */
  static async testProvider(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Test provider failed',
      handler: async () => {
        const validatedRequest = TestProviderRequestSchema.parse(req.body);
        const providerProxy = getProviderProxy();
        const result = await providerProxy.testProvider(validatedRequest.providerId, validatedRequest.testPayload);
        logger.info('🧪 Tested provider {}: {}', {
          data0: validatedRequest.providerId,
          data1: result.success ? 'SUCCESS' : 'FAILED',
        });
        return { providerId: validatedRequest.providerId, testResult: result };
      },
    });
  }

  /**
   * GET /api/providers/statistics
   * Get usage statistics and performance metrics
   */
  static async getStatistics(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Get statistics failed',
      handler: async () => {
        const validatedQuery = UsageStatisticsQuerySchema.parse(req.query);
        const providerProxy = getProviderProxy();
        const statistics = await providerProxy.getUsageStatistics(validatedQuery.timeRangeMinutes);
        logger.info('Retrieved statistics for last {} minutes', { data0: validatedQuery.timeRangeMinutes });
        return {
          ...statistics,
          metadata: {
            timeRangeMinutes: validatedQuery.timeRangeMinutes,
            groupBy: validatedQuery.groupBy,
            generatedAt: new Date().toISOString(),
          },
        };
      },
    });
  }

  /**
   * GET /api/providers/capabilities
   * Get providers by capability
   */
  static async getProvidersByCapability(req: Request, res: Response): Promise<void> {
    const capability = req.query.capability as string;
    if (!capability) {
      ServiceErrors.badRequest(res, 'Capability parameter is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Get providers by capability failed',
      handler: async () => {
        const providerProxy = getProviderProxy();
        const providers = await providerProxy.getProvidersByCapability(capability);
        logger.info('🔍 Found {} providers with capability: {}', { data0: providers.length, data1: capability });
        return { capability, providers, count: providers.length };
      },
    });
  }

  /**
   * GET /api/providers/config/load-balancing
   * Get current load balancing configuration
   */
  static async getLoadBalancingConfig(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Get load balancing config failed',
      handler: async () => {
        const providerProxy = getProviderProxy();
        const config = await providerProxy.getLoadBalancingConfig();
        logger.info('⚖️ Retrieved load balancing config: {}', { data0: config.type });
        return config;
      },
    });
  }

  /**
   * POST /api/providers/config/load-balancing
   * Configure load balancing strategy
   */
  static async configureLoadBalancing(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Configure load balancing failed',
      handler: async () => {
        const validatedRequest = LoadBalancingConfigSchema.parse(req.body);
        const providerProxy = getProviderProxy();
        await providerProxy.configureLoadBalancing(validatedRequest);
        logger.info('⚖️ Updated load balancing config to: {}', { data0: validatedRequest.type });
        return { message: 'Load balancing configuration updated successfully', config: validatedRequest };
      },
    });
  }

  /**
   * GET /api/providers/catalog
   * Get available provider catalog from database with optional filtering
   */
  static async getCatalog(req: Request, res: Response): Promise<void> {
    try {
      const validatedQuery = ProviderCatalogQuerySchema.parse(req.query);

      // Query database for provider configurations
      const db = getDatabase();
      let providers;

      if (validatedQuery.type) {
        // Get providers for specific type
        const providerType = ProviderController.mapCategoryToType(validatedQuery.type);
        providers = await db
          .select()
          .from(providerConfigurations)
          .where(eq(providerConfigurations.providerType, providerType as 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text'));
      } else {
        // Get all providers
        providers = await db.select().from(providerConfigurations);
      }

      // Transform database results to catalog format
      const catalogData = ProviderController.transformToCatalogFormat(providers, validatedQuery.type);

      // Set caching headers for efficiency
      res.set({
        'Cache-Control': 'public, max-age=300', // 5 minutes
        ETag: `"catalog-${validatedQuery.type || 'all'}-v2"`, // Updated version
      });

      sendSuccess(res, catalogData);

      logger.info('📚 Retrieved provider catalog from database: {}', { data0: validatedQuery.type || 'all types' });
    } catch (error) {
      logger.error('Get catalog failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Get catalog failed', req);
      return;
    }
  }

  /**
   * Map provider category to database provider type
   */
  private static mapCategoryToType(category: ProviderCategory): string {
    const mapping: Record<ProviderCategory, string> = {
      'llm-text': 'llm',
      'llm-image': 'image',
      music: 'music',
    };
    return mapping[category];
  }

  /**
   * Transform database provider configurations to catalog format
   */
  private static transformToCatalogFormat(providers: Array<Record<string, unknown>>, filterType?: ProviderCategory): Record<string, ProviderCatalogItem[]> | ProviderCatalogItem[] | undefined {
    const catalogItems: Record<string, ProviderCatalogItem[]> = {};

    for (const provider of providers) {
      const category = ProviderController.mapTypeToCategory(provider.providerType as string);
      const configData = provider.configuration as ProviderConfigurationData;

      if (!catalogItems[category]) {
        catalogItems[category] = [];
      }

      catalogItems[category].push({
        id: provider.providerId as string,
        name: provider.providerName as string,
        description: (provider.description as string) || '',
        models: configData.models || [],
        strengths: configData.strengths || [],
      });
    }

    return filterType ? catalogItems[filterType] : catalogItems;
  }

  /**
   * Map database provider type back to category
   */
  private static mapTypeToCategory(type: string): ProviderCategory {
    const mapping: Record<string, ProviderCategory> = {
      llm: 'llm-text',
      image: 'llm-image',
      music: 'music',
    };
    return mapping[type] || 'llm-text';
  }

  /**
   * POST /api/music/generate
   * Generate music using MusicAPI.ai provider
   * This endpoint handles music generation requests and returns a task ID for polling
   */
  static async generateMusic(req: Request, res: Response): Promise<void> {
    logger.info('🚀 ProviderController.generateMusic called', {
      requestBody: req.body,
    });

    try {
      const validatedRequest = GenerateMusicProviderSchema.parse(req.body);
      const { prompt, parameters, options } = validatedRequest;

      logger.info('🎵 Music generation request received', {
        promptLength: prompt.length,
        title: parameters.title,
        style: parameters.style,
      });

      // Get musicapi provider configuration from database
      const db = getDatabase();
      const providerConfigs = await db
        .select()
        .from(providerConfigurations)
        .where(eq(providerConfigurations.providerId, 'musicapi'));

      if (providerConfigs.length === 0) {
        ServiceErrors.notFound(res, 'MusicAPI.ai provider', req);
        return;
      }

      const providerConfig = providerConfigs[0];
      const config = providerConfig.configuration as ProviderConfigurationData;

      // ✅ CRITICAL FIX: Build tags from genre/style/mood BEFORE template rendering
      // MusicAPI.ai uses 'tags' parameter for genre/style (comma-separated)
      // Priority: genre (user-selected) > style (AI-analyzed) > mood > culturalStyle
      const builtTags = ProviderController.buildMusicTags(parameters);

      // Render request template with parameters
      // Spread parameters first, then override with our computed values so they aren't overwritten
      const renderedTemplate = ProviderController.renderTemplate(config.requestTemplate as Record<string, unknown>, {
        ...parameters,
        prompt,
        title: parameters.title || 'Untitled Song',
        style: parameters.genre || parameters.style || 'pop',
        tags: builtTags,
      });

      // Log tags for debugging
      logger.info('🎵 Tags set for MusicAPI.ai', {
        inputGenre: parameters.genre,
        inputStyle: parameters.style,
        inputMood: parameters.mood,
        inputCulturalStyle: parameters.culturalStyle,
        builtTags,
        renderedTags: renderedTemplate.tags,
      });

      ProviderController.enrichRenderedTemplate(renderedTemplate, parameters);

      await ProviderController.callMusicApi(renderedTemplate, config, options, parameters, res, req);
    } catch (error) {
      logger.error('Music generation failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Music generation failed', req);
      return;
    }
  }

  /**
   * Render template by replacing placeholders with actual values
   */
  private static renderTemplate(template: Record<string, unknown>, values: Record<string, unknown>): Record<string, unknown> {
    const rendered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string') {
        // Replace {{placeholder}} with actual values
        rendered[key] = value.replace(/\{\{(\w+)\}\}/g, (_, placeholder) => {
          return values[placeholder] !== undefined ? String(values[placeholder]) : `{{${placeholder}}}`;
        });
      } else {
        rendered[key] = value;
      }
    }

    return rendered;
  }

  private static buildMusicTags(parameters: Record<string, unknown>): string {
    const tagParts: string[] = [];
    if (parameters.genre && typeof parameters.genre === 'string' && parameters.genre.trim()) {
      tagParts.push(parameters.genre.trim());
    }
    if (parameters.style && typeof parameters.style === 'string' && parameters.style.trim()) {
      tagParts.push(parameters.style.trim());
    }
    if (parameters.mood && typeof parameters.mood === 'string' && parameters.mood.trim()) {
      tagParts.push(parameters.mood.trim());
    }
    if (parameters.culturalStyle && typeof parameters.culturalStyle === 'string' && parameters.culturalStyle.trim()) {
      tagParts.push(parameters.culturalStyle.trim());
    }

    // Use built tags or default to 'pop'
    const builtTags = tagParts.length > 0 ? tagParts.join(', ') : 'pop';

    logger.info('🎸 Building tags from parameters', {
      genre: parameters.genre,
      style: parameters.style,
      mood: parameters.mood,
      culturalStyle: parameters.culturalStyle,
      finalTags: builtTags,
    });

    return builtTags;
  }

  private static enrichRenderedTemplate(renderedTemplate: Record<string, unknown>, parameters: Record<string, unknown>): void {
    // Map vocalGender to vocal_gender for MusicAPI.ai (snake_case required)
    if (parameters.vocalGender && (parameters.vocalGender === 'f' || parameters.vocalGender === 'm')) {
      renderedTemplate.vocal_gender = parameters.vocalGender;
      logger.info('🎤 Setting vocal gender for music generation', {
        vocalGender: parameters.vocalGender,
        label: parameters.vocalGender === 'f' ? 'Female' : 'Male',
      });
    }

    // ✅ Append instrumentType to tags for instrument preference
    if (
      parameters.instrumentType &&
      typeof parameters.instrumentType === 'string' &&
      parameters.instrumentType.trim()
    ) {
      const currentTags = renderedTemplate.tags || parameters.style || '';
      renderedTemplate.tags = currentTags
        ? `${currentTags}, ${parameters.instrumentType.trim()}`
        : parameters.instrumentType.trim();
      logger.info('🎸 Adding instrument type to tags', {
        instrumentType: parameters.instrumentType,
        combinedTags: renderedTemplate.tags,
      });
    }

    // ✅ Set num_clips for song generation (default: 1 for single song)
    const requestedNumClips = parameters.num_clips || 1;
    if (!renderedTemplate.num_clips || renderedTemplate.num_clips < requestedNumClips) {
      renderedTemplate.num_clips = requestedNumClips;
      logger.info('🎵 Setting num_clips for song variations', {
        num_clips: renderedTemplate.num_clips,
        explicitlyRequested: !!parameters.num_clips,
        overrodeTemplate: !!renderedTemplate.num_clips,
      });
    }

    // ✅ Set style_weight for style intensity control (0-1 range)
    if (parameters.styleWeight !== undefined && typeof parameters.styleWeight === 'number') {
      renderedTemplate.style_weight = Math.max(0, Math.min(1, parameters.styleWeight));
      logger.info('🎨 Setting style weight for style intensity', {
        styleWeight: renderedTemplate.style_weight,
      });
    }

    // ✅ Set negative_tags to exclude unwanted elements
    if (parameters.negativeTags && typeof parameters.negativeTags === 'string' && parameters.negativeTags.trim()) {
      renderedTemplate.negative_tags = parameters.negativeTags.trim();
      logger.info('🚫 Setting negative tags to exclude elements', {
        negativeTags: renderedTemplate.negative_tags,
      });
    }
  }

  private static async callMusicApi(
    renderedTemplate: Record<string, unknown>,
    config: ProviderConfigurationData,
    options: { timeout?: number; retries?: number } | undefined,
    parameters: Record<string, unknown>,
    res: Response,
    req: Request
  ): Promise<void> {
    // Make HTTP POST to MusicAPI.ai
    const apiKey = process.env.MUSICAPI_API_KEY;
    if (!apiKey) {
      throw ConfigError.apiKeyMissing('musicapi');
    }

    const musicApiUrl = config.endpoint || `${MUSICAPI_BASE_URL}/api/v1/sonic/create`;

    logger.info('🎵 MusicAPI request - full parameters', {
      title: renderedTemplate.title,
      tags: renderedTemplate.tags,
      vocalGender: renderedTemplate.vocal_gender || 'not set',
      isInstrumental: renderedTemplate.is_instrumental || 'not set',
      numClips: renderedTemplate.num_clips,
      fullRequestBody: renderedTemplate,
    });

    logger.info('🎵 Sending request to MusicAPI.ai', {
      endpoint: musicApiUrl,
      num_clips: renderedTemplate.num_clips,
      title: renderedTemplate.title,
      prompt: (renderedTemplate.prompt as string | undefined)?.substring(0, 100),
      requestBody: JSON.stringify(renderedTemplate, null, 2),
    });

    const response = await withResilience(
      'musicapi-ai',
      async () =>
        fetch(musicApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(renderedTemplate),
        }),
      {
        circuitBreaker: {
          timeout: 60000,
          errorThresholdPercentage: 50,
          resetTimeout: 60000,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('ProviderController - MusicAPI.ai request failed', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        requestedEndpoint: musicApiUrl,
      });

      ServiceErrors.fromException(
        res,
        new Error(`MusicAPI.ai request failed: ${response.status} ${response.statusText}`),
        'MusicAPI.ai request failed',
        req
      );
      return;
    }

    const result = (await response.json()) as MusicApiResponse;
    const taskId = result.task_id;

    if (!taskId) {
      logger.error('No task_id in MusicAPI.ai response', { result });
      throw ConfigError.providerInvocationFailed('musicapi', 'generate music - no task_id returned');
    }

    logger.info('🎵 Music generation initiated, polling for completion', {
      taskId,
      title: parameters.title,
    });

    const timeout = options?.timeout || 300000; // 5 minutes default
    const pollResult = await ProviderController.pollForMusicCompletion(taskId, apiKey, timeout);

    if (!pollResult) {
      logger.error('Music generation timed out', {
        taskId,
        timeout,
      });

      ServiceErrors.timeout(res, `Music generation timed out after ${timeout}ms`, req, { taskId });
      return;
    }

    const { clips, isEarlyPlayback, attempts } = pollResult;
    const pollInterval = 3000;

    logger.info('🎵 Music generation audio available', {
      taskId,
      isEarlyPlayback,
      clipsWithAudio: clips.length,
      attempts,
      totalTimeMs: attempts * pollInterval,
    });

    sendSuccess(res, {
      audioUrl: clips[0].audio_url,
      audioUrls: clips.map((clip: MusicApiClip) => clip.audio_url),
      variations: clips.map((clip: MusicApiClip, index: number) => ({
        variationNumber: index + 1,
        audioUrl: clip.audio_url,
        clipId: clip.clip_id,
        isEarlyPlayback: clip.state !== 'succeeded',
      })),
      isEarlyPlayback,
      providerId: 'musicapi',
      model: renderedTemplate.mv || 'sonic-v5',
      metadata: {
        taskId,
        title: parameters.title,
        style: parameters.style,
        attempts,
        processingTimeMs: attempts * pollInterval,
        clipId: clips[0].clip_id,
        variationsCount: clips.length,
        isEarlyPlayback,
      },
    });
  }

  private static async pollForMusicCompletion(
    taskId: string,
    apiKey: string,
    timeout: number
  ): Promise<{ clips: MusicApiClip[]; isEarlyPlayback: boolean; attempts: number } | null> {
    // CORRECT ENDPOINT: /api/v1/sonic/task/{task_id} (path parameter, not query parameter)
    const pollingUrl = `${MUSICAPI_BASE_URL}/api/v1/sonic/task/${taskId}`;
    const pollInterval = 20000; // 20 seconds - MusicAPI.ai recommends 15-25s
    const maxAttempts = Math.floor(timeout / pollInterval);
    let attempts = 0;
    let consecutiveFailures = 0;

    while (attempts < maxAttempts) {
      attempts++;

      // MusicAPI.ai recommended polling: 15-25 seconds
      // First poll at 15s (earliest reasonable check), then 20s intervals
      const waitTime = attempts === 1 ? 15000 : 20000;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      logger.debug('🎵 Polling MusicAPI.ai for task status', {
        taskId,
        attempt: attempts,
        maxAttempts,
      });

      const pollResponse = await withResilience(
        'musicapi-ai',
        async () =>
          fetch(pollingUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }),
        {
          circuitBreaker: { timeout: 120000, errorThresholdPercentage: 40, resetTimeout: 60000 },
          retry: { maxRetries: 1, retryDelay: 2000, exponentialBackoff: false },
        }
      );

      if (!pollResponse.ok) {
        const pollErrorText = await pollResponse.text();
        logger.warn('Polling request failed', {
          status: pollResponse.status,
          statusText: pollResponse.statusText,
          taskId,
          pollingUrl,
          errorBody: pollErrorText,
          attempt: attempts,
        });

        let isTerminalError = false;
        try {
          const errorJson = JSON.parse(pollErrorText);
          if (errorJson.already_refunded === true || errorJson.type === 'api_error') {
            isTerminalError = true;
            logger.error('MusicAPI.ai returned terminal error, aborting poll', {
              taskId,
              errorType: errorJson.type,
              message: errorJson.message,
              alreadyRefunded: errorJson.already_refunded,
              attempt: attempts,
            });
            throw ConfigError.providerInvocationFailed(
              'musicapi',
              `generate music - terminal API error: ${errorJson.message || 'Unknown error'}`
            );
          }
        } catch (terminalErr) {
          if (isTerminalError) throw terminalErr;
        }

        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          logger.error('Too many consecutive polling failures, aborting', {
            taskId,
            consecutiveFailures,
            lastStatus: pollResponse.status,
            attempt: attempts,
          });
          throw ConfigError.providerInvocationFailed(
            'musicapi',
            `generate music - polling failed ${consecutiveFailures} consecutive times (last status: ${pollResponse.status})`
          );
        }
        continue;
      }

      consecutiveFailures = 0;

      const pollResult = (await pollResponse.json()) as MusicApiResponse;

      // MusicAPI.ai response structure: { code: 200, data: [{ state: "succeeded", audio_url: "..." }], message: "success" }
      // ✅ QUICK WIN #1: Extract ALL clips (typically 2 songs per generation)
      const clips = pollResult.data || [];
      const firstClip = clips[0];
      const status = firstClip?.state; // Use "state" not "status"

      // 🔍 DEBUG: Log FULL response to understand when audio_url becomes available
      const debugLog = {
        timestamp: new Date().toISOString(),
        taskId,
        attempt: attempts,
        elapsedSeconds: attempts * (pollInterval / 1000),
        responseCode: pollResult.code,
        message: pollResult.message,
        clipsCount: clips.length,
        clipsDetailed: clips.map((clip: MusicApiClip, idx: number) => ({
          clipNumber: idx + 1,
          state: clip.state,
          clip_id: clip.clip_id,
          hasAudioUrl: !!clip.audio_url,
          audioUrl: clip.audio_url ? clip.audio_url.substring(0, 80) + '...' : null,
          hasImageUrl: !!clip.image_url,
          hasVideoUrl: !!clip.video_url,
          duration: clip.duration,
        })),
      };
      logger.info('🎵 FULL POLL RESPONSE', debugLog);

      // 🚀 EARLY PLAYBACK: Check if ANY clip has audio_url available
      // Audio URLs can become available while task is still 'running' (~20s vs ~60-120s full completion)
      const clipsWithAudio = clips.filter((clip: MusicApiClip) => clip.audio_url);

      if (clipsWithAudio.length > 0) {
        const isEarlyPlayback = status === 'running' || status === 'pending';
        return { clips: clipsWithAudio, isEarlyPlayback, attempts };
      }

      // Handle failed status
      if (status === 'failed') {
        logger.error('Music generation task failed', {
          taskId,
          error: firstClip?.error || pollResult.message,
        });
        throw ConfigError.providerInvocationFailed(
          'musicapi',
          `generate music - task failed: ${firstClip?.error || pollResult.message || 'Unknown error'}`
        );
      }

      // Status is 'pending' or 'running', continue polling
    }

    return null;
  }

  /**
   * GET /api/providers/proxy/health
   * Get proxy health and performance status
   */
  static async getProxyHealth(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Get proxy health failed',
      handler: async () => {
        const providerProxy = getProviderProxy();
        const health = await providerProxy.getProxyHealth();
        logger.info('🏥 Retrieved proxy health status: {}', { data0: health.status });
        return health;
      },
    });
  }

  /**
   * GET /api/providers/configurations
   * Get all provider configurations with optional filtering and analytics
   */
  static async getAllProviderConfigurations(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Get all provider configurations failed',
      handler: async () => {
        const { type } = req.query;
        const db = getDatabase();

        let providers;
        if (type) {
          const providerType = ProviderController.mapCategoryToType(type as ProviderCategory);
          providers = await db
            .select()
            .from(providerConfigurations)
            .where(eq(providerConfigurations.providerType, providerType as 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text'));
        } else {
          providers = await db.select().from(providerConfigurations);
        }

        logger.info('Retrieved {} provider configurations', { data0: providers.length });
        return { providers, total: providers.length };
      },
    });
  }

  /**
   * GET /api/providers/configurations/:id
   * Get specific provider configuration by ID
   */
  static async getProviderConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        ServiceErrors.badRequest(res, 'Invalid provider ID', req);
        return;
      }

      const db = getDatabase();

      const providers = await db.select().from(providerConfigurations).where(eq(providerConfigurations.id, providerId));

      if (providers.length === 0) {
        ServiceErrors.notFound(res, `Provider configuration with ID ${id}`, req);
        return;
      }

      sendSuccess(res, providers[0]);

      logger.info('Retrieved provider configuration: {}', { data0: id });
    } catch (error) {
      logger.error('Get provider configuration failed', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Get provider configuration failed', req);
      return;
    }
  }

  /**
   * POST /api/providers/configurations
   * Create new provider configuration
   */
  static async createProviderConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const CreateProviderSchema = z.object({
        providerType: z.enum(['llm-text', 'llm-image', 'music'] as const),
        providerId: z.string().min(1),
        providerName: z.string().min(1),
        priority: z.number().min(0).max(1000),
        configuration: z.record(z.unknown()),
        capabilities: z.record(z.unknown()).optional(),
        limitations: z.record(z.unknown()).optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional().default(true),
        isPrimary: z.boolean().optional().default(false),
      });

      const validatedRequest = CreateProviderSchema.parse(req.body);

      const { CreateProviderConfigurationUseCase } =
        await import('../../domains/providers/application/use-cases/CreateProviderConfigurationUseCase');
      const { DrizzleProviderConfigRepository } =
        await import('../../infrastructure/providers/repositories/DrizzleProviderConfigRepository');
      const { TemplateServiceClient } = await import('../../infrastructure/providers/clients/TemplateServiceClient');

      const repository = createDrizzleRepository(DrizzleProviderConfigRepository);
      const providerProxy = getProviderProxy();
      const templateClient = new TemplateServiceClient();
      const useCase = new CreateProviderConfigurationUseCase(repository, providerProxy, templateClient);

      const providerType = ProviderController.mapCategoryToType(validatedRequest.providerType);

      const result = await useCase.execute({
        config: {
          ...validatedRequest,
          providerType: providerType as 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text',
        } as InsertProviderConfiguration,
        performHealthCheck: true,
      });

      sendCreated(res, {
        ...result.configuration,
        healthCheck: result.healthCheck,
      });

      logger.info('Created provider configuration: {} ({})', {
        data0: result.configuration.providerId,
        data1: result.configuration.providerType,
      });

      ConfigEventPublisher.providerUpdated(
        String(result.configuration.id),
        result.configuration.providerName || '',
        result.configuration.isActive ?? true,
        undefined,
        result.configuration.priority
      );
    } catch (error) {
      logger.error('Create provider configuration failed:', {
        error: serializeError(error),
      });

      ServiceErrors.fromException(res, error, 'Create provider configuration failed', req);
    }
  }

  /**
   * PUT /api/providers/configurations/:id
   * Update provider configuration
   */
  static async updateProviderConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        ServiceErrors.badRequest(res, 'Invalid provider ID', req);
        return;
      }

      const UpdateProviderSchema = z.object({
        providerName: z.string().optional(),
        isActive: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
        priority: z.number().min(0).max(1000).optional(),
        configuration: z.record(z.unknown()).optional(),
        capabilities: z.record(z.unknown()).optional(),
        limitations: z.record(z.unknown()).optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
      });

      const validatedRequest = UpdateProviderSchema.parse(req.body);

      const { EditProviderConfigurationUseCase } =
        await import('../../domains/providers/application/use-cases/EditProviderConfigurationUseCase');
      const { DrizzleProviderConfigRepository } =
        await import('../../infrastructure/providers/repositories/DrizzleProviderConfigRepository');
      const { TemplateServiceClient } = await import('../../infrastructure/providers/clients/TemplateServiceClient');

      const repository = createDrizzleRepository(DrizzleProviderConfigRepository);
      const providerProxy = getProviderProxy();
      const templateClient = new TemplateServiceClient();
      const useCase = new EditProviderConfigurationUseCase(repository, providerProxy, templateClient);

      const edits = Object.entries(validatedRequest).map(([field, value]) => ({
        field: field as keyof InsertProviderConfiguration,
        value,
        validate: true,
      }));

      const result = await useCase.execute({
        id: providerId,
        edits,
      });

      if (!result.success) {
        ServiceErrors.badRequest(res, 'Configuration validation failed', req, { validation: result.validation });
        return;
      }

      sendSuccess(res, result.configuration);

      logger.info('Updated provider configuration: {}', { data0: id });

      ConfigEventPublisher.providerUpdated(
        String(result.configuration?.id || providerId),
        result.configuration?.providerName || '',
        result.configuration?.isActive ?? true,
        undefined,
        result.configuration?.priority
      );
    } catch (error) {
      logger.error('Update provider configuration failed:', {
        error: serializeError(error),
      });

      ServiceErrors.fromException(res, error, 'Update provider configuration failed', req);
    }
  }

  /**
   * DELETE /api/providers/configurations/:id
   * Delete provider configuration
   */
  static async deleteProviderConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        ServiceErrors.badRequest(res, 'Invalid provider ID', req);
        return;
      }

      const db = getDatabase();

      const existingProviders = await db
        .select()
        .from(providerConfigurations)
        .where(eq(providerConfigurations.id, providerId));
      const providerToDelete = existingProviders[0];

      const result = await db.delete(providerConfigurations).where(eq(providerConfigurations.id, providerId));

      sendSuccess(res, { message: `Provider configuration ${id} deleted successfully` });

      logger.info('Deleted provider configuration: {}', { data0: id });

      if (providerToDelete) {
        ConfigEventPublisher.providerUpdated(
          String(providerId),
          providerToDelete.providerName || '',
          false,
          undefined,
          providerToDelete.priority || undefined
        );
      }
    } catch (error) {
      logger.error('Delete provider configuration failed', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Delete provider configuration failed', req);
      return;
    }
  }

  /**
   * POST /api/providers/configurations/:id/set-primary
   * Set provider as primary for its type
   */
  static async setProviderAsPrimary(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        ServiceErrors.badRequest(res, 'Invalid provider ID', req);
        return;
      }

      const SetPrimarySchema = z.object({
        providerType: z.enum(['llm', 'llm-text', 'llm-image', 'image', 'music'] as const),
      });

      const validatedRequest = SetPrimarySchema.parse(req.body);

      const { SetPrimaryProviderUseCase } =
        await import('../../domains/providers/application/use-cases/SetPrimaryProviderUseCase');
      const { DrizzleProviderConfigRepository } =
        await import('../../infrastructure/providers/repositories/DrizzleProviderConfigRepository');

      const repository = createDrizzleRepository(DrizzleProviderConfigRepository);
      const providerProxy = getProviderProxy();
      const useCase = new SetPrimaryProviderUseCase(repository, providerProxy);

      const result = await useCase.execute({
        providerId,
        performHealthCheck: false,
        force: true,
      });

      sendSuccess(res, result.newPrimaryProvider);

      logger.info('Set provider {} as primary', { data0: id });
    } catch (error) {
      logger.error('Set provider as primary failed:', {
        error: serializeError(error),
      });

      ServiceErrors.fromException(res, error, 'Set provider as primary failed', req);
    }
  }

  /**
   * POST /api/providers/configurations/:id/health-check
   * Run health check on provider
   */
  static async healthCheckProvider(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        ServiceErrors.badRequest(res, 'Invalid provider ID', req);
        return;
      }

      const db = getDatabase();

      const providers = await db.select().from(providerConfigurations).where(eq(providerConfigurations.id, providerId));

      if (providers.length === 0) {
        ServiceErrors.notFound(res, `Provider configuration with ID ${id}`, req);
        return;
      }

      const provider = providers[0];
      const providerProxy = getProviderProxy();

      const startTime = Date.now();
      const healthResult = await providerProxy.testProvider(provider.providerId, { test: true });
      const responseTime = Date.now() - startTime;

      const healthStatus = healthResult.success ? 'healthy' : 'error';

      await db
        .update(providerConfigurations)
        .set({
          healthStatus,
          updatedAt: new Date(),
        })
        .where(eq(providerConfigurations.id, providerId));

      sendSuccess(res, {
        success: healthResult.success,
        healthStatus,
        responseTime,
        message: healthResult.success ? 'Provider is healthy' : 'Provider health check failed',
        details: healthResult,
      });

      logger.info('Health check for provider {}: {}', { data0: id, data1: healthStatus });
    } catch (error) {
      logger.error('Health check failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Health check failed', req);
      return;
    }
  }

  /**
   * POST /api/providers/configurations/:id/test
   * Test provider with sample request
   */
  static async testProviderConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        ServiceErrors.badRequest(res, 'Invalid provider ID', req);
        return;
      }

      const db = getDatabase();

      const providers = await db.select().from(providerConfigurations).where(eq(providerConfigurations.id, providerId));

      if (providers.length === 0) {
        ServiceErrors.notFound(res, `Provider configuration with ID ${id}`, req);
        return;
      }

      const provider = providers[0];
      const providerProxy = getProviderProxy();

      const startTime = Date.now();
      const testResult = await providerProxy.testProvider(provider.providerId, req.body.testPayload || { test: true });
      const responseTime = Date.now() - startTime;

      sendSuccess(res, {
        ...testResult,
        responseTime,
      });

      logger.info('Test for provider {}: {}', { data0: id, data1: testResult.success ? 'success' : 'failed' });
    } catch (error) {
      logger.error('Test provider failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Test provider failed', req);
      return;
    }
  }
}
