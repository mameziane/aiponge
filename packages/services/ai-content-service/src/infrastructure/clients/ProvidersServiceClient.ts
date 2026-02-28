/**
 * AI Providers Service HTTP Client
 * Handles communication with ai-config-service for LLM operations
 */

import { type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import type { ProviderStatus } from '@aiponge/shared-contracts/providers';
import { ProviderError } from '../../application/errors';
import { withServiceResilience, HttpClient as PlatformHttpClient } from '@aiponge/platform-core';

const logger = getLogger('ai-content-service-providersserviceclient');

export interface ProviderRequest {
  operation: 'text_generation' | 'text_completion' | 'text_analysis';
  payload: {
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    contentType?: string;
    provider?: string;
    model?: string;
    [key: string]: unknown;
  };
  options?: {
    timeout?: number;
    retries?: number;
    priority?: 'low' | 'normal' | 'high';
    [key: string]: unknown;
  };
}

export interface ProviderResponse {
  id: string;
  success: boolean;
  result?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  providerId: string;
  providerName: string;
  model: string;
  metadata: {
    processingTimeMs: number;
    tokensUsed: number;
    cost: number;
    [key: string]: unknown;
  };
}

interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    type: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface ProviderHealthStatus {
  providerId: string;
  status: ProviderStatus;
  latency: number;
  errorRate: number;
  lastChecked: Date;
  capabilities: string[];
  models: string[];
}

export interface ProvidersListResponse {
  providers: ProviderHealthStatus[];
  totalProviders: number;
  healthyProviders: number;
  recommendedProvider?: string;
}

export class ProvidersServiceClient {
  private httpClient: HttpClient;

  constructor(_config?: { timeout?: number; retries?: number; headers?: Record<string, string> }) {
    this.httpClient = new PlatformHttpClient({
      timeout: 120000,
      retries: 2,
      useServiceAuth: true,
      serviceName: 'ai-content-service',
    });
    logger.debug('🔗 [ProvidersServiceClient] Initialized with service auth + 120s timeout');
  }

  /**
   * Map priority values from ai-content-service format to ai-config-service format
   * @param priority - Priority from ai-content-service ('low' | 'normal' | 'high')
   * @returns Mapped priority for ai-config-service ('speed' | 'quality' | 'cost')
   */
  private mapPriority(priority?: 'low' | 'normal' | 'high'): 'speed' | 'quality' | 'cost' | undefined {
    if (!priority) return undefined;

    const priorityMap: Record<string, 'speed' | 'quality' | 'cost'> = {
      low: 'cost', // Optimize for cost (slower, cheaper)
      normal: 'quality', // Balanced quality
      high: 'speed', // Optimize for speed (faster)
    };

    return priorityMap[priority];
  }

  /**
   * Generate text content using AI providers
   */
  async generateText(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    return withServiceResilience(
      'ai-config-service',
      'generateText',
      async () => {
        try {
          logger.info('🚀 Generating text: {}', { data0: request.operation });

          const url = `${getServiceUrl('ai-config-service')}/api/providers/invoke`;

          // Map priority from ai-content-service format to ai-config-service format
          const mappedOptions = request.options
            ? {
                ...request.options,
                priority: this.mapPriority(request.options.priority as 'low' | 'normal' | 'high'),
              }
            : undefined;

          // HttpClient.post() already returns response.data, so result is the body: { success, data, timestamp }
          const result = await this.httpClient.post<ServiceResponse<ProviderResponse>>(url, {
            ...request,
            options: mappedOptions,
            metadata: {
              sourceService: 'ai-content-service',
              timestamp: new Date().toISOString(),
              ...mappedOptions,
            },
          });

          const processingTime = Date.now() - startTime;
          logger.info('Text generated successfully in {}ms', { data0: processingTime });

          // Result is already the response body from ai-config-service: { success, data, timestamp }
          if (!result.success) {
            const errorMsg = result.error?.message || 'Provider invocation failed';
            logger.error('Provider invocation failed: {}', { data0: errorMsg, error: result.error });
            throw ProviderError.invocationFailed(errorMsg);
          }

          if (!result.data) {
            throw ProviderError.invalidResponse('Invalid response from ai-config-service: missing data field');
          }

          // DEBUG: Log the response structure to identify content extraction issues
          if (process.env.NODE_ENV !== 'production') {
            logger.debug('🔍 Provider response structure:', {
              hasData: !!result.data,
              hasResult: !!result.data.result,
              resultType: typeof result.data.result,
              resultLength: result.data.result?.length || 0,
              responseKeys: Object.keys(result.data),
            });
          }

          // Return the inner data which contains the actual ProviderResponse
          return result.data;
        } catch (error) {
          const _processingTime = Date.now() - startTime;
          logger.error('Text generation failed after ${processingTime}ms:', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw this.handleError(error as Record<string, unknown>, 'TEXT_GENERATION_FAILED');
        }
      },
      'ai-provider'
    );
  }

  /**
   * Get list of available providers and their status
   */
  async getProviders(): Promise<ProvidersListResponse> {
    return withServiceResilience(
      'ai-config-service',
      'getProviders',
      async () => {
        try {
          logger.info('📋 Fetching available providers');

          const url = `${getServiceUrl('ai-config-service')}/api/providers`;
          const response = (await this.httpClient.get(url)) as { data: ProvidersListResponse };

          logger.info('Retrieved {} providers', { data0: response.data.totalProviders });
          return response.data;
        } catch (error) {
          logger.error('Failed to fetch providers:', { error: error instanceof Error ? error.message : String(error) });
          throw this.handleError(error, 'FETCH_PROVIDERS_FAILED');
        }
      },
      'internal-service'
    );
  }

  /**
   * Get health status of a specific provider
   */
  async getProviderHealth(providerId: string): Promise<ProviderHealthStatus> {
    return withServiceResilience(
      'ai-config-service',
      'getProviderHealth',
      async () => {
        try {
          logger.info('🔍 Checking health for provider: {}', { data0: providerId });

          const url = `${getServiceUrl('ai-config-service')}/api/providers/${providerId}/health`;
          const response = (await this.httpClient.get(url)) as { data: ProviderHealthStatus };

          logger.info('Provider {} status: {}', { data0: providerId, data1: response.data.status });
          return response.data;
        } catch (error) {
          logger.error('Health check failed for ${providerId}:', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw this.handleError(error, 'PROVIDER_HEALTH_CHECK_FAILED');
        }
      },
      'internal-service'
    );
  }

  /**
   * Test a provider with a simple request
   */
  async testProvider(providerId: string, testPrompt: string = 'Hello, world!'): Promise<ProviderResponse> {
    return withServiceResilience(
      'ai-config-service',
      'testProvider',
      async () => {
        try {
          logger.info('🧪 Testing provider: {}', { data0: providerId });

          const testRequest: ProviderRequest = {
            operation: 'text_generation',
            payload: {
              prompt: testPrompt,
              maxTokens: 50,
              temperature: 0.7,
              provider: providerId,
            },
            options: {
              timeout: 10000, // Shorter timeout for tests
              retries: 1,
            },
          };

          const response = await this.generateText(testRequest);

          logger.info('Provider {} test successful', { data0: providerId });
          return response;
        } catch (error) {
          logger.error('Provider ${providerId} test failed:', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw this.handleError(error, 'PROVIDER_TEST_FAILED');
        }
      },
      'ai-provider'
    );
  }

  /**
   * Get optimal provider for specific content type
   */
  async getOptimalProvider(
    contentType: string,
    requirements?: {
      maxLatency?: number;
      minQuality?: number;
      costOptimized?: boolean;
    }
  ): Promise<string> {
    return withServiceResilience(
      'ai-config-service',
      'getOptimalProvider',
      async () => {
        try {
          logger.info('Finding optimal provider for: {}', { data0: contentType });

          const url = `${getServiceUrl('ai-config-service')}/api/providers/optimal`;
          const response = (await this.httpClient.post(url, {
            contentType,
            requirements: requirements || {},
          })) as { data: { recommendedProvider: string } };

          logger.info('Optimal provider: {}', { data0: response.data.recommendedProvider });
          return response.data.recommendedProvider;
        } catch (error) {
          logger.warn('Failed to get optimal provider, using default', {
            error: error instanceof Error ? error.message : String(error),
          });
          return 'openai'; // Fallback to default provider
        }
      },
      'ai-provider'
    );
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    responseTime: number;
    providersAvailable: number;
  }> {
    const startTime = Date.now();

    try {
      const url = `${getServiceUrl('ai-config-service')}/health`;
      const response = (await this.httpClient.get(url)) as { data: { status: string; providersAvailable: number } };

      const responseTime = Date.now() - startTime;

      return {
        status: response.data.status as 'healthy' | 'degraded' | 'unhealthy',
        timestamp: new Date(),
        responseTime,
        providersAvailable: response.data.providersAvailable,
      };
    } catch (error) {
      logger.warn('Provider health check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        providersAvailable: 0,
      };
    }
  }

  // ===== IMAGE GENERATION =====
  // Migrated from music-service for centralized image generation

  /**
   * Generate image using AI providers via centralized ProviderProxy
   * Supports DALL-E (primary) and Stable Diffusion (fallback)
   * Routes through ai-config-service for consistent auth, monitoring, and circuit breaking
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
      'ai-config-service',
      'generateImage',
      async () => {
        try {
          logger.info('Generating image via centralized ProviderProxy', {
            promptLength: request.prompt.length,
            providerId: request.providerId,
            size: request.parameters?.size,
          });

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
          }>(getServiceUrl('ai-config-service') + '/api/providers/invoke', {
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

          const data = response.data;

          if (response.success && data?.result) {
            const isBase64 = data.metadata?.isBase64 || data.metadata?.responseFormat === 'base64';

            if (isBase64 && data.result) {
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

  // ===== PRIVATE METHODS =====

  private handleError(error: Record<string, unknown>, context: string): Error {
    if (error.status) {
      return new Error(`${context}: HTTP ${error.status} - ${error.message || 'Unknown error'}`);
    } else {
      return new Error(`${context}: ${error.message || 'Unknown error'}`);
    }
  }
}
