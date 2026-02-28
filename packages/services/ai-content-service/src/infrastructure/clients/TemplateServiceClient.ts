/**
 * Template Service Client
 * HTTP client for communicating with the ai-config-service
 * Handles template execution and management operations
 */

import { HttpClient, getLogger, withServiceResilience, errorMessage, errorStack } from '@aiponge/platform-core';
import { createServiceClient } from '../../config/service-urls';
import { TemplateError, ProviderError } from '../../application/errors';

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
  systemPrompt?: string;
  userPrompt?: string;
  messages?: Array<{ role: 'system' | 'user'; content: string }>;
  error?: string;
  executionTime: number;
  templateUsed: {
    id: string;
    name: string;
    version?: string;
  };
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category: string;
  content: string;
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required: boolean;
    description?: string;
    defaultValue?: unknown;
  }>;
  tags?: string[];
  createdBy: string;
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

export class TemplateServiceClient {
  private httpClient: HttpClient;
  private serviceUrl: string;

  constructor() {
    const { httpClient, baseUrl } = createServiceClient('ai-config-service');
    this.httpClient = httpClient;
    this.serviceUrl = baseUrl;

    const logger = getLogger('TemplateServiceClient');
    logger.debug('Template service client initialized', {
      module: 'template_service_client',
      operation: 'constructor',
      phase: 'client_initialization_completed',
    });
  }

  /**
   * Execute a template with variable substitution
   * THROWS on error - no fallback mechanism
   */
  async executeTemplate(request: TemplateExecutionRequest): Promise<TemplateExecutionResponse> {
    const logger = getLogger('TemplateServiceClient');

    try {
      const response = await withServiceResilience(
        'ai-config-service',
        'executeTemplate',
        () =>
          this.httpClient.post<TemplateServiceResponse<TemplateExecutionResponse>>(
            `${this.serviceUrl}/api/templates/execute`,
            request
          ),
        'internal-service'
      );

      if (!response.success) {
        const errorMessage = response.error?.message || 'Template execution failed';
        logger.error('Template execution failed', {
          module: 'template_service_client',
          operation: 'executeTemplate',
          templateId: request.templateId,
          error: response.error,
          phase: 'template_execution_failed',
        });
        throw TemplateError.executionFailed(errorMessage);
      }

      return response.data!;
    } catch (error) {
      logger.error('Template execution error', {
        module: 'template_service_client',
        operation: 'executeTemplate',
        templateId: request.templateId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'template_execution_error',
      });
      // NO FALLBACK - throw the error
      throw error;
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(request: CreateTemplateRequest): Promise<unknown> {
    return withServiceResilience(
      'ai-config-service',
      'createTemplate',
      async () => {
        try {
          const response = await this.httpClient.post<TemplateServiceResponse>(
            `${this.serviceUrl}/api/templates`,
            request
          );

          if (!response.success) {
            throw TemplateError.internalError(response.error?.message || 'Template creation failed');
          }

          return response.data;
        } catch (error) {
          const logger = getLogger('TemplateServiceClient');
          logger.error('Template creation failed', {
            module: 'template_service_client',
            operation: 'createTemplate',
            templateName: request.name,
            error: { message: errorMessage(error), stack: errorStack(error) },
            phase: 'template_creation_failed',
          });
          throw error;
        }
      },
      'internal-service'
    );
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<unknown> {
    return withServiceResilience(
      'ai-config-service',
      'getTemplate',
      async () => {
        try {
          const response = await this.httpClient.get<TemplateServiceResponse>(
            `${this.serviceUrl}/api/templates/${templateId}`
          );

          if (!response.success) {
            throw TemplateError.templateNotFound(templateId);
          }

          return response.data;
        } catch (error) {
          const logger = getLogger('TemplateServiceClient');
          logger.error('Template retrieval failed', {
            module: 'template_service_client',
            operation: 'getTemplate',
            templateId,
            error: { message: errorMessage(error), stack: errorStack(error) },
            phase: 'template_retrieval_failed',
          });
          throw error;
        }
      },
      'internal-service'
    );
  }

  /**
   * List templates with optional filtering
   */
  async listTemplates(filters?: {
    query?: string;
    category?: string;
    tags?: string[];
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    return withServiceResilience(
      'ai-config-service',
      'listTemplates',
      async () => {
        try {
          const params = new URLSearchParams();

          if (filters?.query) params.append('query', filters.query);
          if (filters?.category) params.append('category', filters.category);
          if (filters?.tags) params.append('tags', filters.tags.join(','));
          if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
          if (filters?.limit) params.append('limit', String(filters.limit));
          if (filters?.offset) params.append('offset', String(filters.offset));

          const response = await this.httpClient.get<TemplateServiceResponse>(
            `${this.serviceUrl}/api/templates?${params.toString()}`
          );

          if (!response.success) {
            throw TemplateError.internalError(response.error?.message || 'Template listing failed');
          }

          return response.data;
        } catch (error) {
          const logger = getLogger('TemplateServiceClient');
          logger.error('Template listing failed', {
            module: 'template_service_client',
            operation: 'listTemplates',
            error: { message: errorMessage(error), stack: errorStack(error) },
            phase: 'template_listing_failed',
          });
          throw error;
        }
      },
      'internal-service'
    );
  }

  /**
   * Health check for template service
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.httpClient.get(`${this.serviceUrl}/api/health`);
      return true;
    } catch (error) {
      const logger = getLogger('TemplateServiceClient');
      logger.warn('Template service health check failed', {
        module: 'template_service_client',
        operation: 'healthCheck',
        error: { message: errorMessage(error) },
        phase: 'health_check_failed',
      });
      return false;
    }
  }

  /**
   * Execute template - NO FALLBACK
   * THROWS on error to expose the actual issue
   */
  async executeWithFallback(
    templateId: string,
    variables: Record<string, unknown>,
    fallbackGenerator: () => string
  ): Promise<string> {
    const logger = getLogger('TemplateServiceClient');

    // NO FALLBACK - always execute template and throw on error
    const result = await this.executeTemplate({ templateId, variables });

    if (result.success && result.result) {
      logger.info('Successfully used template', {
        module: 'template_service_client',
        operation: 'executeWithFallback',
        templateId,
        phase: 'template_execution_successful',
      });
      return result.result;
    } else {
      logger.error('Template execution failed', {
        module: 'template_service_client',
        operation: 'executeWithFallback',
        templateId,
        error: result.error,
        phase: 'template_execution_failed',
      });
      throw TemplateError.executionFailed(result.error || 'Unknown error');
    }
  }
}
