/**
 * ConfigServiceClient - Lightweight client for fetching AI model configuration
 * Single source of truth: cfg_provider_configs table in ai-config-service
 */

import { createServiceClient, getServiceUrl, getLogger, type HttpClient } from '../../config/service-urls';
import { serializeError, withServiceResilience } from '@aiponge/platform-core';

const logger = getLogger('user-service-configserviceclient');

interface ModelConfiguration {
  model: string;
  providerType: 'llm' | 'image' | 'music' | 'audio';
}

// Cache for model configuration (refreshed every 5 minutes)
let cachedLlmModel: { model: string; fetchedAt: number } | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ConfigServiceClient {
  private httpClient: HttpClient;

  constructor() {
    const { httpClient } = createServiceClient('ai-config-service', { type: 'ai' });
    this.httpClient = httpClient;
    logger.debug('ConfigServiceClient initialized');
  }

  /**
   * Get LLM model name from database configuration
   * Single source of truth: cfg_provider_configs table
   */
  async getLlmModel(): Promise<string> {
    // Check cache first
    if (cachedLlmModel && Date.now() - cachedLlmModel.fetchedAt < MODEL_CACHE_TTL_MS) {
      return cachedLlmModel.model;
    }

    return withServiceResilience(
      'ai-config-service',
      'getLlmModel',
      async () => {
        try {
          const data = await this.httpClient.get<{
            success: boolean;
            data?: Array<{
              providerId: string;
              providerType: string;
              configuration: Record<string, unknown>;
              isActive: boolean;
              isPrimary: boolean;
            }>;
          }>(getServiceUrl('ai-config-service') + '/api/providers/configurations');

          if (!data.success || !data.data) {
            logger.warn('Failed to fetch provider configurations');
            return this.getDefaultLlmModel();
          }

          // Find active LLM provider (prefer primary)
          const llmProviders = data.data.filter(p => p.providerType === 'llm' && p.isActive);
          const provider = llmProviders.find(p => p.isPrimary) || llmProviders[0];

          if (!provider) {
            logger.warn('No active LLM provider found');
            return this.getDefaultLlmModel();
          }

          const config = provider.configuration as Record<string, Record<string, unknown>> | undefined;
          const model = (config?.requestTemplate?.model as string) || this.getDefaultLlmModel();

          // Update cache
          cachedLlmModel = { model, fetchedAt: Date.now() };

          logger.info('LLM model configuration loaded from database', { model });
          return model;
        } catch (error) {
          logger.warn('Error fetching LLM model config, using default', {
            error: serializeError(error),
          });
          return this.getDefaultLlmModel();
        }
      },
      'internal-service'
    );
  }

  /**
   * Default model when database is unavailable
   * Should match cfg_provider_configs database value
   */
  private getDefaultLlmModel(): string {
    return 'gpt-4o-mini';
  }
}
