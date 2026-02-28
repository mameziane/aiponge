/**
 * Template Service Facade *
 * After consolidation:  ProviderProxy → TemplateServiceFacade → TemplateService (direct)
 */

import { TemplateService } from '../../domains/templates/application/services/TemplateService';
import { ExecutionService } from '../../domains/templates/application/services/ExecutionService';
import { errorMessage } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { ContentTemplateRepository } from '../templates/repositories/ContentTemplateRepository';
import { createDrizzleRepository } from '../database/DatabaseConnectionFactory';
import { ConfigEventPublisher } from '../events/ConfigEventPublisher';

const logger = getLogger('ai-config-service-templatefacade');

export const PROVIDER_TEMPLATE_IDS = {
  PROVIDER_TEST_TEXT: 'provider-test-text-v1',
  PROVIDER_TEST_IMAGE: 'provider-test-image-v1',
  PROVIDER_TEST_VIDEO: 'provider-test-video-v1',
  PROVIDER_TEST_MUSIC: 'provider-test-music-v1',
  PROVIDER_TEST_AUDIO: 'provider-test-audio-v1',
  PROVIDER_HEALTH_CHECK: 'provider-health-check-v1',
  PROVIDER_CONFIGURATION_TEST: 'provider-config-test-v1',
  PROVIDER_CONNECTIVITY_TEST: 'provider-connectivity-test-v1',
} as const;

export interface TemplateExecutionRequest {
  templateId: string;
  variables: Record<string, unknown>;
  options?: {
    timeout?: number;
    maxRetries?: number;
  };
}

export interface TemplateExecutionResponse {
  success: boolean;
  result?: string;
  error?: string;
  executionTime: number;
  templateUsed: {
    id: string;
    name: string;
    version?: string;
  };
}

/**
 * TemplateServiceFacade - Internal adapter for template operations
 * Replaces HTTP-based TemplateServiceClient with direct method calls
 */
export class TemplateServiceFacade {
  private templateService: TemplateService;
  private executionService: ExecutionService;

  constructor() {
    const contentTemplateRepository = createDrizzleRepository(ContentTemplateRepository);
    this.templateService = new TemplateService(contentTemplateRepository, ConfigEventPublisher);
    this.executionService = new ExecutionService(this.templateService);
    logger.info('✅ TemplateServiceFacade initialized (in-process, zero HTTP overhead)');
  }

  /**
   * Execute a template with variable substitution
   * Direct replacement for HTTP POST /api/execute
   */
  async executeTemplate(request: TemplateExecutionRequest): Promise<TemplateExecutionResponse> {
    const startTime = Date.now();

    try {
      logger.info('🔄 Executing template (in-process): {}', { data0: request.templateId });

      const template = await this.templateService.getTemplate(request.templateId);

      if (!template) {
        return {
          success: false,
          error: `Template not found: ${request.templateId}`,
          executionTime: Date.now() - startTime,
          templateUsed: {
            id: request.templateId,
            name: 'Unknown',
          },
        };
      }

      const result = await this.executionService.executeTemplate({
        templateId: request.templateId,
        variables: request.variables,
      });

      return {
        success: result.success,
        result: result.result,
        error: result.error,
        executionTime: Date.now() - startTime,
        templateUsed: {
          id: template.id,
          name: template.name,
          version: template.version || undefined,
        },
      };
    } catch (error) {
      logger.error('Template execution failed: {}', { data0: errorMessage(error) });

      return {
        success: false,
        error: `Template execution error: ${errorMessage(error)}`,
        executionTime: Date.now() - startTime,
        templateUsed: {
          id: request.templateId,
          name: 'Unknown',
        },
      };
    }
  }

  /**
   * Get test prompt for provider validation
   * Replaces TemplateServiceClient.getTestPrompt()
   */
  async getTestPrompt(providerType: string): Promise<string> {
    const templateId = this.getTemplateIdForProviderType(providerType);

    try {
      const result = await this.executeTemplate({
        templateId,
        variables: { providerType },
      });

      if (result.success && result.result) {
        return result.result;
      }

      logger.warn('Test prompt execution failed, using fallback');
      return this.getFallbackPrompt(providerType);
    } catch (error) {
      logger.error('Error getting test prompt: {}', { data0: errorMessage(error) });
      return this.getFallbackPrompt(providerType);
    }
  }

  /**
   * Get health check prompt for provider monitoring
   * Replaces TemplateServiceClient.getHealthCheckPrompt()
   */
  async getHealthCheckPrompt(providerType: string): Promise<string> {
    try {
      const result = await this.executeTemplate({
        templateId: PROVIDER_TEMPLATE_IDS.PROVIDER_HEALTH_CHECK,
        variables: { providerType },
      });

      if (result.success && result.result) {
        return result.result;
      }

      return 'Health check';
    } catch (error) {
      logger.error('Error getting health check prompt: {}', { data0: errorMessage(error) });
      return 'Health check';
    }
  }

  /**
   * Get configuration test prompt
   * Replaces TemplateServiceClient.getConfigTestPrompt()
   */
  async getConfigTestPrompt(providerType: string, providerName: string): Promise<string> {
    try {
      const result = await this.executeTemplate({
        templateId: PROVIDER_TEMPLATE_IDS.PROVIDER_CONFIGURATION_TEST,
        variables: { providerType, providerName },
      });

      if (result.success && result.result) {
        return result.result;
      }

      return `Test configuration for ${providerName}`;
    } catch (error) {
      logger.error('Error getting config test prompt: {}', { data0: errorMessage(error) });
      return `Test configuration for ${providerName}`;
    }
  }

  private getTemplateIdForProviderType(providerType: string): string {
    const templateMap: Record<string, string> = {
      text: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_TEXT,
      llm: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_TEXT,
      image: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_IMAGE,
      video: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_VIDEO,
      music: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_MUSIC,
      audio: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_AUDIO,
    };

    return templateMap[providerType.toLowerCase()] || PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_TEXT;
  }

  private getFallbackPrompt(providerType: string): string {
    const fallbackPrompts: Record<string, string> = {
      text: 'Test text processing capability',
      llm: 'Test text processing capability',
      image: 'Generate a simple test image',
      video: 'Create a short test video clip',
      music: 'Generate a brief test music sample',
      audio: 'Create a short test audio clip',
    };

    return fallbackPrompts[providerType.toLowerCase()] || 'Test provider functionality';
  }
}
