/**
 * Template Service Client for AI Providers Service
 * Handles test prompts for provider validation and health checks
 * Updated to use ServiceCallClient for standardized service communication
 */

import { createServiceHttpClient, type HttpClient, getLogger, getOwnPort } from '@config/service-urls';
import { ConfigError } from '../../../application/errors';

// Template IDs for AI Providers Service

const logger = getLogger('ai-config-service-templateserviceclient');

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

export interface TemplateServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: Date;
}

const getOwnServiceUrl = () => `http://localhost:${getOwnPort()}`;

export class TemplateServiceClient {
  private readonly httpClient: HttpClient;

  constructor() {
    // Initialize HTTP client for internal service communication
    this.httpClient = createServiceHttpClient('internal');

    logger.info('🔧 Initialized HTTP client for ai-config-service');
  }

  /**
   * Execute a template with variable substitution
   */
  async executeTemplate(request: TemplateExecutionRequest): Promise<TemplateExecutionResponse> {
    try {
      const url = `${getOwnServiceUrl()}/api/templates/execute`;
      const response: { data: TemplateServiceResponse<TemplateExecutionResponse> } = await this.httpClient.post(url, request, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const serviceResponse = response.data;

      if (!serviceResponse.success) {
        throw ConfigError.providerInvocationFailed(
          'template',
          'execute',
          new Error(serviceResponse.error?.message || 'Template execution failed')
        );
      }

      return serviceResponse.data!;
    } catch (error) {
      logger.error('Template execution failed:', { error: error instanceof Error ? error.message : String(error) });

      // Return fallback response
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown template execution error',
        executionTime: 0,
        templateUsed: {
          id: request.templateId,
          name: 'Unknown',
          version: 'Unknown',
        },
      };
    }
  }

  /**
   * Execute template with fallback to default test prompt construction
   */
  async executeWithFallback(
    templateId: string,
    variables: Record<string, unknown>,
    fallbackGenerator: () => string
  ): Promise<string> {
    try {
      const result = await this.executeTemplate({ templateId, variables });

      if (result.success && result.result) {
        logger.info('✨ Successfully used template: {}', { data0: templateId });
        return result.result;
      } else {
        logger.warn('Template execution failed, using fallback for: {}', { data0: templateId });
        return fallbackGenerator();
      }
    } catch (error) {
      logger.warn('Template service unavailable, using fallback for: ${templateId}', { data: error });
      return fallbackGenerator();
    }
  }

  /**
   * Get test prompt for provider validation
   */
  async getProviderTestPrompt(
    providerType: 'llm' | 'image' | 'video' | 'music' | 'audio' | 'text',
    variables: Record<string, unknown> = {}
  ): Promise<string> {
    const templateMap = {
      llm: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_TEXT,
      text: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_TEXT,
      image: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_IMAGE,
      video: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_VIDEO,
      music: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_MUSIC,
      audio: PROVIDER_TEMPLATE_IDS.PROVIDER_TEST_AUDIO,
    };

    const templateId = templateMap[providerType];

    return this.executeWithFallback(
      templateId,
      {
        provider_type: providerType,
        test_type: 'validation',
        ...variables,
      },
      () => this.generateFallbackTestPrompt(providerType)
    );
  }

  /**
   * Get health check prompt for provider monitoring
   */
  async getHealthCheckPrompt(
    providerId: string,
    providerType: string,
    variables: Record<string, unknown> = {}
  ): Promise<string> {
    return this.executeWithFallback(
      PROVIDER_TEMPLATE_IDS.PROVIDER_HEALTH_CHECK,
      {
        provider_id: providerId,
        provider_type: providerType,
        check_type: 'health',
        ...variables,
      },
      () => `Health check for ${providerType} provider: ${providerId}`
    );
  }

  /**
   * Get configuration test prompt
   */
  async getConfigurationTestPrompt(
    providerType: string,
    configurationName: string,
    variables: Record<string, unknown> = {}
  ): Promise<string> {
    return this.executeWithFallback(
      PROVIDER_TEMPLATE_IDS.PROVIDER_CONFIGURATION_TEST,
      {
        provider_type: providerType,
        configuration_name: configurationName,
        test_type: 'configuration',
        ...variables,
      },
      () => `Test configuration for ${providerType}: ${configurationName}`
    );
  }

  /**
   * Health check for template service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${getOwnServiceUrl()}/api/health`;
      const response: { data: { success?: boolean } } = await this.httpClient.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.data.success === true;
    } catch (error) {
      logger.warn('Template service health check failed:', { data: error });
      return false;
    }
  }

  /**
   * Generate fallback test prompt when template service is unavailable
   */
  private generateFallbackTestPrompt(providerType: string): string {
    const fallbackPrompts = {
      llm: 'Test connection and basic response generation',
      text: 'Test text processing capability',
      image: 'Generate a simple test image',
      video: 'Create a short test video clip',
      music: 'Generate a brief test music sample',
      audio: 'Create a short test audio clip',
    };

    return fallbackPrompts[providerType as keyof typeof fallbackPrompts] || 'Test provider functionality';
  }
}
