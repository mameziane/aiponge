/**
 * Admin Providers Controller
 * Handles provider management CRUD operations and configuration
 * Extracted from AdminAggregationController for better domain separation
 */

import { Request, Response } from 'express';
import { BaseAggregationController } from './BaseAggregationController';
import { ProvidersServiceClient } from '../../clients/ProvidersServiceClient';
import { withResilience, errorMessage } from '@aiponge/platform-core';
import { musicApiCreditsService } from '../../services/MusicApiCreditsService';
import { GatewayError } from '../../errors';
import { ServiceErrors } from '../utils/response-helpers';

const MUSICAPI_BASE_URL = process.env.MUSICAPI_BASE_URL || 'https://api.musicapi.ai';

export class AdminProvidersController extends BaseAggregationController {
  private providersServiceClient: ProvidersServiceClient | null = null;

  constructor() {
    super('api-gateway-admin-providers-controller');
    this.logger.debug('AdminProvidersController initialized');
  }

  /**
   * Lazy-load ProvidersServiceClient
   */
  private getProvidersServiceClient(): ProvidersServiceClient {
    if (!this.providersServiceClient) {
      this.providersServiceClient = new ProvidersServiceClient();
    }
    return this.providersServiceClient;
  }

  /**
   * GET /api/admin/providers
   * Get all provider configurations
   */
  async getProviders(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const response = await this.getProvidersServiceClient().getProviderCatalog();
        this.sendSuccessResponse(res, response.data);
      } catch (error) {
        this.logger.error('Failed to fetch providers', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch providers', req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/ai/providers/config
   * Get AI provider configurations
   */
  async getAIProvidersConfig(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const response = await this.getProvidersServiceClient().getProviderCatalog('llm');
        this.sendSuccessResponse(res, response.data);
      } catch (error) {
        this.logger.error('Failed to fetch AI providers config', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch AI providers config', req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/provider-configurations
   * Get all provider configurations with optional filters
   */
  async getProviderConfigurations(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const { type, includeAnalytics } = req.query;
        const client = this.getProvidersServiceClient();
        const response = (await client.getProviderConfigurations(type as string, includeAnalytics === 'true')) as {
          data: unknown;
        };

        this.sendSuccessResponse(res, response.data);
      } catch (error) {
        this.logger.error('Failed to fetch provider configurations', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch provider configurations', req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/provider-configurations/:id
   * Get a specific provider configuration by ID
   */
  async getProviderConfigurationById(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id || typeof id !== 'string') {
          ServiceErrors.badRequest(res, 'Provider configuration ID is required', req);
          return;
        }
        const client = this.getProvidersServiceClient();
        const response = await client.getProviderConfiguration(id);

        this.sendSuccessResponse(res, response);
      } catch (error) {
        this.logger.error('Failed to fetch provider configuration', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch provider configuration', req);
      }
    })(req, res);
  }

  /**
   * POST /api/admin/provider-configurations
   * Create a new provider configuration
   */
  async createProviderConfiguration(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const client = this.getProvidersServiceClient();
        const response = (await client.createProviderConfiguration(req.body)) as { data: unknown };

        this.sendSuccessResponse(res, response.data);
      } catch (error) {
        this.logger.error('Failed to create provider configuration', { error });
        ServiceErrors.internal(res, 'Failed to create provider configuration', error, req);
      }
    })(req, res);
  }

  /**
   * PATCH /api/admin/provider-configurations/:id
   * Update an existing provider configuration
   */
  async updateProviderConfiguration(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id || typeof id !== 'string') {
          ServiceErrors.badRequest(res, 'Provider configuration ID is required', req);
          return;
        }
        const client = this.getProvidersServiceClient();
        const response = (await client.updateProviderConfiguration(id, req.body)) as { data: unknown };

        this.sendSuccessResponse(res, response.data);
      } catch (error) {
        this.logger.error('Failed to update provider configuration', { error });
        ServiceErrors.internal(res, 'Failed to update provider configuration', error, req);
      }
    })(req, res);
  }

  /**
   * DELETE /api/admin/provider-configurations/:id
   * Delete a provider configuration
   */
  async deleteProviderConfiguration(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id || typeof id !== 'string') {
          ServiceErrors.badRequest(res, 'Provider configuration ID is required', req);
          return;
        }
        const client = this.getProvidersServiceClient();
        await client.deleteProviderConfiguration(id);

        this.sendSuccessResponse(res, { message: 'Provider configuration deleted successfully' });
      } catch (error) {
        this.logger.error('Failed to delete provider configuration', { error });
        ServiceErrors.internal(res, 'Failed to delete provider configuration', error, req);
      }
    })(req, res);
  }

  /**
   * POST /api/admin/provider-configurations/:id/test
   * Test a provider configuration
   * For MusicAPI.ai, uses the free get-credits endpoint to verify API key
   */
  async testProviderConfiguration(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id || typeof id !== 'string') {
          ServiceErrors.badRequest(res, 'Provider configuration ID is required', req);
          return;
        }
        const client = this.getProvidersServiceClient();
        const startTime = Date.now();

        this.logger.info('Testing provider configuration via ai-config-service', { id });

        const testResponse = (await client.testProviderConfiguration(id, req.body)) as
          | {
              data?: {
                success?: boolean;
                latencyMs?: number;
                response?: string;
                responseTime?: number;
                error?: string;
              };
            }
          | { success?: boolean; latencyMs?: number; response?: string; responseTime?: number; error?: string };

        const result = (testResponse as { data?: Record<string, unknown> })?.data || testResponse;
        const testResult = result as {
          success?: boolean;
          latencyMs?: number;
          response?: string;
          responseTime?: number;
          error?: string;
        };

        const latencyMs = testResult.latencyMs || testResult.responseTime || Date.now() - startTime;

        this.logger.info('Provider test result', {
          id,
          success: testResult.success,
          latencyMs,
        });

        this.sendSuccessResponse(res, {
          success: !!testResult.success,
          latencyMs,
          error: testResult.error,
        });
      } catch (error) {
        this.logger.error('Failed to test provider configuration', { error });
        ServiceErrors.internal(res, 'Failed to test provider configuration', error, req);
      }
    })(req, res);
  }

  /**
   * POST /api/admin/provider-configurations/:id/health-check
   * Health check a provider configuration
   */
  async healthCheckProviderConfiguration(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id || typeof id !== 'string') {
          ServiceErrors.badRequest(res, 'Provider configuration ID is required', req);
          return;
        }
        const client = this.getProvidersServiceClient();
        const response = await client.healthCheckProvider(id);

        this.sendSuccessResponse(res, response);
      } catch (error) {
        this.logger.error('Failed to health check provider configuration', { error });
        ServiceErrors.internal(res, 'Failed to health check provider configuration', error, req);
      }
    })(req, res);
  }

  /**
   * POST /api/admin/provider-configurations/:id/set-primary
   * Set a provider configuration as primary
   */
  async setProviderAsPrimary(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id || typeof id !== 'string') {
          ServiceErrors.badRequest(res, 'Provider configuration ID is required', req);
          return;
        }
        const client = this.getProvidersServiceClient();
        const response = await client.setProviderAsPrimary(id, req.body);

        this.sendSuccessResponse(res, response);
      } catch (error) {
        this.logger.error('Failed to set provider as primary', { error });
        ServiceErrors.internal(res, 'Failed to set provider as primary', error, req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/musicapi-credits
   * Get MusicAPI.ai account credits balance (from cache with fallback to live)
   */
  async getMusicApiCredits(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        // Try to get from cache first
        const cachedCredits = musicApiCreditsService.getCachedCredits();

        if (cachedCredits && !cachedCredits.error) {
          this.sendSuccessResponse(res, {
            credits: cachedCredits.credits,
            extraCredits: cachedCredits.extraCredits,
            totalCredits: cachedCredits.totalCredits,
            lastSyncedAt: cachedCredits.lastSyncedAt.toISOString(),
            nextSyncAt: cachedCredits.nextSyncAt.toISOString(),
            cached: true,
          });
          return;
        }

        // Fallback to live fetch if cache is unavailable or has error
        const apiKey = process.env.MUSICAPI_API_KEY;
        if (!apiKey) {
          ServiceErrors.serviceUnavailable(res, 'MUSICAPI_API_KEY not configured', req);
          return;
        }

        const response = await withResilience(
          'musicapi-ai',
          () =>
            fetch(`${MUSICAPI_BASE_URL}/api/v1/get-credits`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
            }),
          { circuitBreaker: { timeout: 10000 } }
        );

        if (!response.ok) {
          throw GatewayError.upstreamError('MusicAPI.ai', response.status, response.statusText);
        }

        const data = (await response.json()) as { credits?: number; extra_credits?: number };

        this.sendSuccessResponse(res, {
          credits: data.credits ?? 0,
          extraCredits: data.extra_credits ?? 0,
          totalCredits: (data.credits ?? 0) + (data.extra_credits ?? 0),
          lastSyncedAt: new Date().toISOString(),
          cached: false,
        });
      } catch (error) {
        this.logger.error('Failed to fetch MusicAPI credits', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch MusicAPI credits', req);
      }
    })(req, res);
  }

  /**
   * POST /api/admin/musicapi-credits/refresh
   * Force refresh MusicAPI.ai credits cache
   */
  async refreshMusicApiCredits(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        this.logger.info('Manual MusicAPI credits refresh requested');
        const credits = await musicApiCreditsService.refreshCredits();

        this.sendSuccessResponse(res, {
          credits: credits.credits,
          extraCredits: credits.extraCredits,
          totalCredits: credits.totalCredits,
          lastSyncedAt: credits.lastSyncedAt.toISOString(),
          nextSyncAt: credits.nextSyncAt.toISOString(),
          refreshed: true,
        });
      } catch (error) {
        this.logger.error('Failed to refresh MusicAPI credits', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to refresh MusicAPI credits', req);
      }
    })(req, res);
  }

  /**
   * POST /api/admin/provider-configurations/discover
   * Use LLM to dynamically suggest new AI providers
   */
  async discoverProviders(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const client = this.getProvidersServiceClient();

        const configsResponse = (await client.getProviderConfigurations()) as { data?: unknown };
        const configs = configsResponse?.data;
        const existingProviders = Array.isArray(configs) ? configs : [];

        const existingList = existingProviders.map((p: Record<string, unknown>) => {
          const config = (p.configuration || {}) as Record<string, unknown>;
          const requestTemplate = (config.requestTemplate || {}) as Record<string, unknown>;
          return {
            providerId: p.providerId,
            providerName: p.providerName,
            providerType: p.providerType,
            model: requestTemplate.model || 'unknown',
          };
        });

        const existingIds = existingList.map((p: Record<string, unknown>) => p.providerId).join(', ');

        const userPrompt = `Already configured: ${existingIds}

Suggest 8 AI providers NOT in the list above. Only REST APIs with API key auth.

Return a JSON array where each object has: providerId (kebab-case), providerName, providerType (llm|image|music|audio|video), description (1 sentence), endpoint (API URL), model, timeout (ms), costPerUnit, creditCost (1-25), priority (100-500), category (LLM|Image|Music|Audio|Video).

JSON array only, no markdown.`;

        const llmResponse = await client.invokeProvider<{ result?: string }>(
          {
            providerId: 'openai-llm',
            operation: 'text_generation',
            payload: {
              systemPrompt:
                'You are an AI infrastructure expert. Respond ONLY with a valid JSON array. No markdown fences, no explanation.',
              userPrompt,
              maxTokens: 2000,
              temperature: 0.3,
            },
          },
          { timeout: 90000 }
        );

        if (!llmResponse.success || !llmResponse.data?.result) {
          this.logger.error('LLM provider discovery call failed', { response: llmResponse });
          this.sendSuccessResponse(res, {
            success: false,
            error: 'Failed to get suggestions from LLM provider',
            providers: [],
          });
          return;
        }

        const rawText = llmResponse.data.result.trim();
        let providers: unknown[];
        try {
          providers = JSON.parse(rawText);
        } catch (parseError) {
          this.logger.error('Failed to parse LLM discovery response as JSON', { rawText, parseError });
          this.sendSuccessResponse(res, {
            success: false,
            error: 'Failed to parse provider suggestions from LLM response',
            providers: [],
          });
          return;
        }

        this.sendSuccessResponse(res, {
          success: true,
          providers,
          existingCount: existingProviders.length,
          suggestedCount: Array.isArray(providers) ? providers.length : 0,
        });
      } catch (error) {
        this.logger.error('Failed to discover providers via LLM', { error });
        this.sendSuccessResponse(res, {
          success: false,
          error: errorMessage(error) || 'An unexpected error occurred during provider discovery',
          providers: [],
        });
      }
    })(req, res);
  }
}

export const adminProvidersController = new AdminProvidersController();
