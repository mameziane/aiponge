/**
 * Template Service Client for AI Analytics Service
 * HTTP client for communicating with the ai-config-service
 * Provides template execution with fallback support for analytics prompts
 * Updated to use ServiceCallClient for standardized service communication
 */

import { createServiceClient, type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import { withServiceResilience } from '@aiponge/platform-core';

const logger = getLogger('ai-analytics-service-templateserviceclient');

export interface TemplateExecutionRequest {
  templateId: string;
  variables: Record<string, unknown>;
  options?: {
    validateVariables?: boolean;
    fallbackToDefaults?: boolean;
  };
}

export interface TemplateExecutionResponse {
  success: boolean;
  content: string;
  templateId: string;
  variablesUsed: string[];
  executionTime: number;
}

const SERVICE_NAME = 'ai-config-service';

export class TemplateServiceClient {
  private readonly httpClient: HttpClient;

  constructor() {
    const { httpClient } = createServiceClient('ai-config-service');
    this.httpClient = httpClient;

    logger.info('Initialized HTTP client for ai-config-service');
  }

  /**
   * Execute template with fallback support
   * This is the main method that AI services should use
   */
  async executeWithFallback<T>(
    templateId: string,
    variables: Record<string, unknown>,
    fallbackFunction: () => T
  ): Promise<T> {
    try {
      const result = await this.execute({
        templateId,
        variables,
        options: {
          validateVariables: true,
          fallbackToDefaults: true,
        },
      });

      logger.info('✨ Successfully executed template: {}', { data0: templateId });
      return result.content as T;
    } catch (error) {
      logger.warn('Template execution failed for ${templateId}, using fallback:', { data: error });
      return fallbackFunction();
    }
  }

  /**
   * Execute template directly
   */
  async execute(request: TemplateExecutionRequest): Promise<TemplateExecutionResponse> {
    return withServiceResilience('ai-config-service', 'execute', async () => {
      try {
        const startTime = Date.now();

        const url = `${getServiceUrl(SERVICE_NAME)}/api/templates/execute`;
        const response = (await this.httpClient.post(url, request, {
          headers: {
            'Content-Type': 'application/json',
          },
        })) as { data: { content?: string; prompt?: string; variablesUsed?: string[] } };
        const result = response.data;
        const executionTime = Date.now() - startTime;

        return {
          success: true,
          content: result.content || result.prompt || '',
          templateId: request.templateId,
          variablesUsed: result.variablesUsed || Object.keys(request.variables),
          executionTime,
        };
      } catch (error) {
        logger.error('Template execution failed:', { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
  }

  /**
   * Check if template service is available
   */
  async ping(): Promise<boolean> {
    try {
      const url = `${getServiceUrl(SERVICE_NAME)}/health`;
      const response = (await this.httpClient.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      })) as { status: number };
      return response.status === 200;
    } catch (error) {
      logger.debug('Template service ping failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}
