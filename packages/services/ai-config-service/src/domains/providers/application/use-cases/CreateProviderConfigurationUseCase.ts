/**
 * Create Provider Configuration Use Case
 * Creates new provider configurations with validation, security checks, and health monitoring
 */

import { IProviderConfigRepository } from '../../domain/repositories/IProviderConfigRepository';
import { IProviderProxy } from '../interfaces/IProviderProxy';
import { ITemplateClient } from '../interfaces/ITemplateClient';
import { ProviderConfiguration } from '../../domain/entities/ProviderConfiguration';
import { InsertProviderConfiguration } from '@schema/schema';
import { sanitizeProviderConfiguration, sanitizeErrorMessage, sanitizeForLogging } from '../../utils/security';
import { getLogger } from '@config/service-urls';
import { DomainError } from '@aiponge/platform-core';
import { ConfigError } from '../../../../application/errors';

const logger = getLogger('ai-config-service-createproviderconfigurationusecase');

export interface CreateProviderConfigurationParams {
  config: InsertProviderConfiguration;
  performHealthCheck?: boolean;
  userId?: string;
  validateApiKey?: boolean;
}

export interface CreateProviderConfigurationResult {
  configuration: ProviderConfiguration;
  healthCheck?: {
    success: boolean;
    latencyMs: number;
    error?: string;
  };
}

export class CreateProviderConfigurationUseCase {
  constructor(
    private providerConfigRepository: IProviderConfigRepository,
    private providerProxy: IProviderProxy,
    private templateClient?: ITemplateClient
  ) {}

  async execute(params: CreateProviderConfigurationParams): Promise<CreateProviderConfigurationResult> {
    try {
      // Validate the configuration
      await this.validateConfiguration(params.config);

      // Check for existing provider
      const existingProvider = await this.providerConfigRepository.findByProviderAndType(
        params.config.providerId,
        params.config.providerType
      );

      if (existingProvider) {
        throw ConfigError.invalidProviderConfig(
          params.config.providerId,
          `already exists for type ${params.config.providerType}`
        );
      }

      // SECURITY: Sanitize configuration for logging (don't log sensitive data)
      const sanitizedConfig = sanitizeForLogging(params.config);

      // If setting as primary, unset other primary providers of the same type
      if (params.config.isPrimary === true) {
        await this.providerConfigRepository.unsetPrimaryProvider(params.config.providerType);
      }

      // Prepare configuration with metadata
      const configWithMetadata: InsertProviderConfiguration = {
        ...params.config,
        createdBy: params.userId,
        healthStatus: 'unknown',
      };

      let healthCheckResult;

      // Perform health check if requested (default: true)
      if (params.performHealthCheck !== false) {
        try {
          healthCheckResult = await this.providerProxy.testProvider(
            params.config.providerId,
            await this.createTestPayload(params.config.providerType)
          );

          configWithMetadata.healthStatus = healthCheckResult.success ? 'healthy' : 'error';
        } catch (error: unknown) {
          logger.warn('Health check failed for new provider ${params.config.providerId}:', {
            data: sanitizeErrorMessage(error instanceof Error ? error : String(error)),
          });
          configWithMetadata.healthStatus = 'error';
          healthCheckResult = {
            success: false,
            latencyMs: 0,
            error: 'Health check failed',
          };
        }
      }

      // Create the configuration
      const result = await this.providerConfigRepository.create(configWithMetadata);

      // Log successful creation (with sanitized data)
      const sanitizedForLog = sanitizedConfig as { providerId?: string; providerType?: string };
      logger.info('Provider configuration created: {} ({}) by {}', {
        data0: sanitizedForLog.providerId,
        data1: sanitizedForLog.providerType,
        data2: params.userId || 'system',
      });

      // SECURITY: Sanitize the configuration before returning to prevent secret exposure
      const sanitizedResult = sanitizeProviderConfiguration(result) as unknown as ProviderConfiguration;

      return {
        configuration: sanitizedResult,
        healthCheck: healthCheckResult,
      };
    } catch (error: unknown) {
      const sanitizedError = sanitizeErrorMessage(error instanceof Error ? error : String(error));
      logger.error('Error creating provider configuration:', { error: sanitizedError });
      throw ConfigError.internalError(
        'Failed to create provider configuration',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async validateConfiguration(config: InsertProviderConfiguration): Promise<void> {
    // Validate required fields
    if (!config.providerId || !config.providerName || !config.providerType) {
      throw ConfigError.validationError(
        'providerId/providerName/providerType',
        'Provider ID, name, and type are required'
      );
    }

    // Validate provider type
    const validTypes = ['llm', 'music', 'image', 'video', 'audio', 'text'];
    if (!validTypes.includes(config.providerType)) {
      throw ConfigError.validationError(
        'providerType',
        `Invalid provider type. Must be one of: ${validTypes.join(', ')}`
      );
    }

    // Validate priority
    if (config.priority !== undefined && (config.priority < 0 || config.priority > 1000)) {
      throw ConfigError.validationError('priority', 'Priority must be between 0 and 1000');
    }

    // Validate cost per unit
    if (config.costPerUnit !== undefined && parseFloat(config.costPerUnit.toString()) < 0) {
      throw ConfigError.validationError('costPerUnit', 'Cost per unit must be non-negative');
    }

    // Validate configuration structure
    if (!config.configuration || typeof config.configuration !== 'object') {
      throw ConfigError.validationError('configuration', 'Configuration object is required');
    }

    await this.validateProviderConfiguration(config.providerType, config.configuration);
  }

  private async validateProviderConfiguration(providerType: string, configuration: Record<string, unknown>): Promise<void> {
    // Validate endpoint
    if (!configuration.endpoint || typeof configuration.endpoint !== 'string') {
      throw ConfigError.validationError('endpoint', 'Configuration endpoint is required');
    }

    try {
      new URL(configuration.endpoint);
    } catch (error) {
      logger.warn('Invalid provider configuration endpoint URL', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw ConfigError.validationError('endpoint', 'Configuration endpoint must be a valid URL');
    }

    // Validate request template
    if (!configuration.requestTemplate || typeof configuration.requestTemplate !== 'object') {
      throw ConfigError.validationError('requestTemplate', 'Request template is required');
    }

    // Validate response mapping
    if (!configuration.responseMapping || typeof configuration.responseMapping !== 'object') {
      throw ConfigError.validationError('responseMapping', 'Response mapping is required');
    }

    // Type-specific validations
    const typeSpecificValidation = {
      llm: () => this.validateLLMConfiguration(configuration),
      music: () => this.validateMusicConfiguration(configuration),
      image: () => this.validateImageConfiguration(configuration),
      video: () => this.validateVideoConfiguration(configuration),
      audio: () => this.validateAudioConfiguration(configuration),
      text: () => this.validateTextConfiguration(configuration),
    };

    const validator = typeSpecificValidation[providerType as keyof typeof typeSpecificValidation];
    if (validator) {
      await validator();
    }
  }

  private validateLLMConfiguration(config: Record<string, unknown>): void {
    const requiredFields = ['apiKey', 'model'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw ConfigError.validationError(field, `Missing required LLM configuration field: ${field}`);
      }
    }

    if (config.maxTokens && ((config.maxTokens as number) < 1 || (config.maxTokens as number) > 100000)) {
      throw ConfigError.validationError('maxTokens', 'MaxTokens must be between 1 and 100000');
    }

    if (config.temperature && ((config.temperature as number) < 0 || (config.temperature as number) > 2)) {
      throw ConfigError.validationError('temperature', 'Temperature must be between 0 and 2');
    }
  }

  private validateMusicConfiguration(config: Record<string, unknown>): void {
    const requiredFields = ['apiKey'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw ConfigError.validationError(field, `Missing required Music configuration field: ${field}`);
      }
    }
  }

  private validateImageConfiguration(config: Record<string, unknown>): void {
    const requiredFields = ['apiKey'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw ConfigError.validationError(field, `Missing required Image configuration field: ${field}`);
      }
    }
  }

  private validateVideoConfiguration(config: Record<string, unknown>): void {
    const requiredFields = ['apiKey'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw ConfigError.validationError(field, `Missing required Video configuration field: ${field}`);
      }
    }
  }

  private validateAudioConfiguration(config: Record<string, unknown>): void {
    const requiredFields = ['apiKey'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw ConfigError.validationError(field, `Missing required Audio configuration field: ${field}`);
      }
    }
  }

  private validateTextConfiguration(config: Record<string, unknown>): void {
    const requiredFields = ['apiKey'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw ConfigError.validationError(field, `Missing required Text configuration field: ${field}`);
      }
    }
  }

  private async createTestPayload(providerType: string): Promise<Record<string, unknown>> {
    try {
      if (!this.templateClient) {
        throw new DomainError('Template client not available', 503);
      }
      const testPrompt = await this.templateClient.getProviderTestPrompt(providerType as 'llm' | 'image' | 'video' | 'music' | 'audio' | 'text', {
        test_context: 'provider_creation',
      });

      const testPayloads = {
        llm: { prompt: testPrompt, maxTokens: 10 },
        music: { genre: 'test', duration: 10 },
        image: { prompt: testPrompt, size: '256x256' },
        video: { prompt: testPrompt, duration: 5 },
        audio: { text: testPrompt, voice: 'default' },
        text: { text: testPrompt },
      };

      return testPayloads[providerType as keyof typeof testPayloads] || {};
    } catch (error) {
      logger.warn('Using fallback test payload, template service unavailable:', { data: error });

      // Fallback to enhanced descriptive prompts
      const fallbackPayloads = {
        llm: { prompt: 'Test provider connection and response generation', maxTokens: 10 },
        music: { genre: 'test', duration: 10 },
        image: { prompt: 'Generate test image for provider validation', size: '256x256' },
        video: { prompt: 'Create test video for provider validation', duration: 5 },
        audio: { text: 'Test audio generation for provider validation', voice: 'default' },
        text: { text: 'Test text processing functionality' },
      };

      return fallbackPayloads[providerType as keyof typeof fallbackPayloads] || {};
    }
  }
}
