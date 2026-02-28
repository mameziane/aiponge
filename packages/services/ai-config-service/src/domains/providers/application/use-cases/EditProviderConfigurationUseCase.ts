/**
 * Edit Provider Configuration Use Case
 * Interactive editing of provider configurations with real-time validation and preview
 */

import { IProviderConfigRepository } from '../../domain/repositories/IProviderConfigRepository';
import { IProviderProxy } from '../interfaces/IProviderProxy';
import { ITemplateClient } from '../interfaces/ITemplateClient';
import { ProviderConfiguration } from '../../domain/entities/ProviderConfiguration';
import { InsertProviderConfiguration } from '@schema/schema';
import { sanitizeProviderConfiguration, sanitizeErrorMessage, sanitizeForLogging } from '../../utils/security';
import { getLogger } from '@config/service-urls';
import { serializeError, DomainError } from '@aiponge/platform-core';
import { ConfigError } from '../../../../application/errors';

// Provider configuration value types (includes all possible schema field types)
type ConfigFieldValue = string | number | boolean | null | undefined | Date | Record<string, unknown> | unknown[];

const CONNECTIVITY_TEST_PAYLOADS: Record<string, Record<string, unknown>> = {
  llm: { prompt: 'Connectivity probe', maxTokens: 1 },
  music: { genre: 'test', duration: 1 },
  image: { prompt: 'Connectivity probe', size: '256x256' },
  video: { prompt: 'Connectivity probe', duration: 1 },
  audio: { text: 'Connectivity probe', voice: 'default' },
  text: { text: 'Connectivity probe' },
};

export interface EditProviderConfigurationParams {
  id: number;
  edits: {
    field: keyof InsertProviderConfiguration;
    value: ConfigFieldValue;
    validate?: boolean;
  }[];
  preview?: boolean; // Return preview without saving
  userId?: string;
}

export interface EditProviderConfigurationResult {
  success: boolean;
  configuration?: ProviderConfiguration;
  preview?: {
    changes: Array<{
      field: string;
      currentValue: ConfigFieldValue;
      newValue: ConfigFieldValue;
      valid: boolean;
      warnings?: string[];
    }>;
    overallValid: boolean;
    estimatedImpact: {
      requiresHealthCheck: boolean;
      affectsConnectivity: boolean;
      changesCapabilities: boolean;
    };
  };
  validation?: {
    errors: Record<string, string[]>;
    warnings: Record<string, string[]>;
    valid: boolean;
  };
  testResults?: {
    connectivityTest: boolean;
    performanceTest?: {
      latencyMs: number;
      success: boolean;
    };
  };
}

// Provider config data structure for validation
interface ProviderConfigData {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  defaultDuration?: number;
  defaultSize?: string;
  maxDuration?: number;
  outputFormat?: string;
  timeout?: number;
  requestTemplate?: Record<string, unknown>;
  responseMapping?: Record<string, unknown>;
  // New auth structure for provider configurations
  auth?: {
    scheme?: string;
    envVarName?: string;
    headerName?: string;
  };
}

export class EditProviderConfigurationUseCase {
  private readonly logger = getLogger('edit-provider-configuration-use-case');

  constructor(
    private providerConfigRepository: IProviderConfigRepository,
    private providerProxy: IProviderProxy,
    private templateClient?: ITemplateClient
  ) {}

  async execute(params: EditProviderConfigurationParams): Promise<EditProviderConfigurationResult> {
    try {
      // Find existing configuration
      const existingConfig = await this.providerConfigRepository.findById(params.id);
      if (!existingConfig) {
        throw ConfigError.providerNotFound(String(params.id));
      }

      // Apply edits to create preview
      const previewConfig = await this.applyEdits(existingConfig, params.edits);

      // Validate all changes
      const validation = await this.validateConfiguration(previewConfig, existingConfig);

      if (params.preview) {
        return this.buildPreviewResult(existingConfig, previewConfig, params.edits, validation);
      }

      // If not valid and not forced, return with errors
      if (!validation.valid) {
        return {
          success: false,
          validation,
        };
      }

      return await this.saveAndReturnResult(params, existingConfig, previewConfig);
    } catch (error: unknown) {
      return this.buildErrorResult(error, params.id);
    }
  }

  private async buildPreviewResult(
    existingConfig: ProviderConfiguration,
    previewConfig: ProviderConfiguration,
    edits: EditProviderConfigurationParams['edits'],
    validation: { valid: boolean; errors: Record<string, string[]>; warnings: Record<string, string[]> }
  ): Promise<EditProviderConfigurationResult> {
    // Return preview without saving
    const preview = await this.generatePreview(existingConfig, previewConfig, edits);
    return {
      success: true,
      preview,
      validation: validation.valid ? undefined : validation,
    };
  }

  private async saveAndReturnResult(
    params: EditProviderConfigurationParams,
    existingConfig: ProviderConfiguration,
    previewConfig: ProviderConfiguration
  ): Promise<EditProviderConfigurationResult> {
    // Perform connectivity test for critical changes
    let testResults;
    if (this.requiresConnectivityTest(params.edits)) {
      testResults = await this.performConnectivityTest(previewConfig);
    }

    // Save the changes
    const updates = this.buildUpdatesFromEdits(params.edits, previewConfig, params.userId);
    const savedConfig = await this.providerConfigRepository.update(params.id, updates);

    // Log the changes
    this.logger.info(
      `Provider configuration edited: ${existingConfig.providerId} by ${params.userId || 'system'} - Fields: ${params.edits.map(e => e.field).join(', ')}`,
      {
        module: 'edit_provider_configuration_use_case',
        operation: 'execute',
        providerId: existingConfig.providerId,
        userId: params.userId,
        editedFields: params.edits.map(e => e.field),
        phase: 'configuration_edited',
      }
    );

    // SECURITY: Sanitize the configuration before returning to prevent secret exposure
    const sanitizedConfig = sanitizeProviderConfiguration(savedConfig) as ProviderConfiguration;

    return {
      success: true,
      configuration: sanitizedConfig,
      testResults,
    };
  }

  private buildUpdatesFromEdits(
    edits: EditProviderConfigurationParams['edits'],
    previewConfig: ProviderConfiguration,
    userId?: string
  ): Partial<InsertProviderConfiguration> {
    const updates: Partial<InsertProviderConfiguration> = {};
    const readonlyFields = ['id', 'createdAt', 'updatedAt'];
    for (const edit of edits) {
      if (!readonlyFields.includes(edit.field as string)) {
        if (edit.field === 'configuration') {
          // Use the deep-merged configuration from previewConfig
          (updates as Record<string, unknown>)[edit.field as string] = previewConfig.configuration;
        } else {
          (updates as Record<string, unknown>)[edit.field as string] = edit.value;
        }
      }
    }
    updates.updatedBy = userId;
    return updates;
  }

  private buildErrorResult(error: unknown, providerId: number): EditProviderConfigurationResult {
    const errorMessage = error instanceof Error ? error : String(error);
    this.logger.error('Error editing provider configuration:', {
      module: 'edit_provider_configuration_use_case',
      operation: 'execute',
      error: sanitizeErrorMessage(errorMessage),
      providerId,
      phase: 'configuration_edit_error',
    });
    return {
      success: false,
      validation: {
        errors: { general: [sanitizeErrorMessage(errorMessage)] },
        warnings: {},
        valid: false,
      },
    };
  }

  private async applyEdits(
    existing: ProviderConfiguration,
    edits: EditProviderConfigurationParams['edits']
  ): Promise<ProviderConfiguration> {
    const modified = { ...existing };

    for (const edit of edits) {
      if (edit.field === 'configuration' && typeof edit.value === 'object') {
        // Deep merge configuration objects to preserve nested structures like requestTemplate
        const existingConfig =
          typeof existing.configuration === 'object' && existing.configuration !== null
            ? (existing.configuration as Record<string, unknown>)
            : {};
        modified.configuration = this.deepMerge(existingConfig, edit.value as Record<string, unknown>);
      } else {
        (modified as Record<string, unknown>)[edit.field as string] = edit.value;
      }
    }

    return modified;
  }

  /**
   * Deep merge two objects, preserving nested structures
   * Arrays are replaced (not merged) to allow explicit overwrites
   * Sensitive fields with masked values are preserved from target
   */
  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      // Skip overwriting sensitive fields if the source value looks masked/redacted
      if (this.isSensitiveField(key) && this.isMaskedValue(sourceValue)) {
        // Preserve the original value from target
        continue;
      }

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge nested objects
        result[key] = this.deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
      } else {
        // Replace primitive values, arrays, or null
        result[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * Checks if a field name indicates it contains sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitivePatterns = [
      /api[_-]?key/i,
      /access[_-]?token/i,
      /auth[_-]?token/i,
      /secret/i,
      /password/i,
      /token/i,
      /key$/i,
      /credential/i,
    ];
    return sensitivePatterns.some(pattern => pattern.test(fieldName));
  }

  /**
   * Checks if a value looks like a masked/redacted secret
   */
  private isMaskedValue(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    // Check for common masking patterns
    return (
      value.includes('***') || value === '***REDACTED***' || /^\w{2,4}\*+\w{2,4}$/.test(value) // Pattern like "sk-1****abcd"
    );
  }

  private async validateConfiguration(
    config: ProviderConfiguration,
    original: ProviderConfiguration
  ): Promise<{ valid: boolean; errors: Record<string, string[]>; warnings: Record<string, string[]> }> {
    const errors: Record<string, string[]> = {};
    const warnings: Record<string, string[]> = {};

    // Validate immutable fields
    if (config.providerId !== original.providerId) {
      errors.providerId = ['Provider ID cannot be changed'];
    }
    if (config.providerType !== original.providerType) {
      errors.providerType = ['Provider type cannot be changed'];
    }

    // Validate required fields
    if (!config.providerName?.trim()) {
      errors.providerName = ['Provider name is required'];
    }

    // Validate priority
    if (config.priority < 0 || config.priority > 1000) {
      errors.priority = ['Priority must be between 0 and 1000'];
    }

    // Validate cost per unit
    if (parseFloat(config.costPerUnit.toString()) < 0) {
      errors.costPerUnit = ['Cost per unit must be non-negative'];
    }

    // Validate configuration object
    const configValidation = await this.validateProviderConfiguration(config);
    if (configValidation.errors.length > 0) {
      errors.configuration = configValidation.errors;
    }
    if (configValidation.warnings.length > 0) {
      warnings.configuration = configValidation.warnings;
    }

    // Business logic warnings
    if (config.isActive && config.healthStatus !== 'healthy') {
      warnings.general = warnings.general || [];
      warnings.general.push('Activating provider with non-healthy status');
    }

    if (config.isPrimary && !config.isActive) {
      errors.general = errors.general || [];
      errors.general.push('Primary provider must be active');
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      warnings,
    };
  }

  private async validateProviderConfiguration(
    config: ProviderConfiguration
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.configuration) {
      errors.push('Configuration object is required');
      return { errors, warnings };
    }

    const configData = config.configuration as unknown as ProviderConfigData;

    // Validate endpoint
    if (configData.endpoint) {
      try {
        new URL(configData.endpoint);
      } catch (error) {
        this.logger.warn('Invalid endpoint URL during validation', {
          error: error instanceof Error ? error.message : String(error),
        });
        errors.push('Invalid endpoint URL');
      }
    } else {
      errors.push('Endpoint is required');
    }

    // Validate request template
    if (!configData.requestTemplate || typeof configData.requestTemplate !== 'object') {
      errors.push('Request template is required and must be an object');
    }

    // Validate response mapping
    if (!configData.responseMapping || typeof configData.responseMapping !== 'object') {
      errors.push('Response mapping is required and must be an object');
    }

    // Provider-type specific validation
    const typeValidation = await this.validateByProviderType(config);
    errors.push(...typeValidation.errors);
    warnings.push(...typeValidation.warnings);

    return { errors, warnings };
  }

  private async validateByProviderType(
    config: ProviderConfiguration
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const configData = config.configuration as unknown as ProviderConfigData;

    const validators = {
      llm: () => this.validateLLMConfig(configData),
      music: () => this.validateMusicConfig(configData),
      image: () => this.validateImageConfig(configData),
      video: () => this.validateVideoConfig(configData),
      audio: () => this.validateAudioConfig(configData),
      text: () => this.validateTextConfig(configData),
    };

    const validator = validators[config.providerType as keyof typeof validators];
    if (validator) {
      const result = validator();
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return { errors, warnings };
  }

  /**
   * Check if authentication is configured via either old apiKey format or new auth structure
   */
  private hasValidAuth(config: ProviderConfigData): boolean {
    // Old format: direct apiKey field
    if (config.apiKey && config.apiKey.length > 0) {
      return true;
    }
    // New format: auth.envVarName reference to environment variable
    if (config.auth?.envVarName && config.auth.envVarName.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Get model from either top-level or requestTemplate
   */
  private getModel(config: ProviderConfigData): string | undefined {
    if (config.model) return config.model;
    if (config.requestTemplate?.model) return config.requestTemplate.model as string;
    return undefined;
  }

  private validateLLMConfig(config: ProviderConfigData): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.hasValidAuth(config)) {
      errors.push('API key or auth configuration is required');
    }

    const model = this.getModel(config);
    if (!model) {
      errors.push('Model is required (either in config or requestTemplate)');
    }

    if (config.maxTokens && (config.maxTokens < 1 || config.maxTokens > 100000)) {
      errors.push('Max tokens must be between 1 and 100000');
    }

    const temp = config.temperature ?? (config.requestTemplate?.temperature as number | undefined);
    if (temp !== undefined && (temp < 0 || temp > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (temp !== undefined && temp > 1.5) {
      warnings.push('High temperature may produce unpredictable results');
    }

    return { errors, warnings };
  }

  private validateMusicConfig(config: ProviderConfigData): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.hasValidAuth(config)) {
      errors.push('API key or auth configuration is required');
    }

    if (config.defaultDuration && (config.defaultDuration < 5 || config.defaultDuration > 300)) {
      warnings.push('Default duration should be between 5 and 300 seconds');
    }

    return { errors, warnings };
  }

  private validateImageConfig(config: ProviderConfigData): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.hasValidAuth(config)) {
      errors.push('API key or auth configuration is required');
    }

    const validSizes = ['256x256', '512x512', '1024x1024'];
    if (config.defaultSize && !validSizes.includes(config.defaultSize)) {
      warnings.push(`Unusual image size: ${config.defaultSize}`);
    }

    return { errors, warnings };
  }

  private validateVideoConfig(config: ProviderConfigData): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.hasValidAuth(config)) {
      errors.push('API key or auth configuration is required');
    }

    if (config.maxDuration && config.maxDuration > 60) {
      warnings.push('Long video generation may be expensive');
    }

    return { errors, warnings };
  }

  private validateAudioConfig(config: ProviderConfigData): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.hasValidAuth(config)) {
      errors.push('API key or auth configuration is required');
    }

    const supportedFormats = ['mp3', 'wav', 'aac', 'ogg'];
    if (config.outputFormat && !supportedFormats.includes(config.outputFormat)) {
      warnings.push(`Unsupported output format: ${config.outputFormat}`);
    }

    return { errors, warnings };
  }

  private validateTextConfig(config: ProviderConfigData): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.hasValidAuth(config)) {
      errors.push('API key or auth configuration is required');
    }

    return { errors, warnings };
  }

  private async generatePreview(
    original: ProviderConfiguration,
    modified: ProviderConfiguration,
    edits: EditProviderConfigurationParams['edits']
  ): Promise<NonNullable<EditProviderConfigurationResult['preview']>> {
    const changes = [];

    for (const edit of edits) {
      const currentValue = original[edit.field as keyof ProviderConfiguration];
      const newValue = edit.value;
      const valid = await this.validateSingleField(edit.field, newValue, modified);

      changes.push({
        field: edit.field as string,
        // SECURITY: Use comprehensive sanitization for preview values
        currentValue: (sanitizeForLogging({ [edit.field as string]: currentValue }) as Record<string, unknown>)[
          edit.field as string
        ] as ConfigFieldValue,
        newValue: (sanitizeForLogging({ [edit.field as string]: newValue }) as Record<string, unknown>)[
          edit.field as string
        ] as ConfigFieldValue,
        valid: valid.valid,
        warnings: valid.warnings.length > 0 ? valid.warnings : undefined,
      });
    }

    const estimatedImpact = this.estimateImpact(edits);

    return {
      changes,
      overallValid: changes.every(c => c.valid),
      estimatedImpact,
    };
  }

  private async validateSingleField(
    field: keyof InsertProviderConfiguration,
    value: ConfigFieldValue,
    fullConfig: ProviderConfiguration
  ): Promise<{ valid: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    let valid = true;

    switch (field) {
      case 'isActive':
        if (value && fullConfig.healthStatus !== 'healthy') {
          warnings.push('Activating provider with unhealthy status');
        }
        break;
      case 'isPrimary':
        if (value && !fullConfig.isActive) {
          valid = false;
        }
        break;
      case 'costPerUnit':
        if (typeof value === 'number') {
          if (value < 0) {
            valid = false;
          } else if (value > 0.01) {
            warnings.push('High cost per unit');
          }
        }
        break;
    }

    return { valid, warnings };
  }

  private estimateImpact(edits: EditProviderConfigurationParams['edits']): {
    requiresHealthCheck: boolean;
    affectsConnectivity: boolean;
    changesCapabilities: boolean;
  } {
    const connectivityFields = ['configuration', 'endpoint', 'isActive'];
    const capabilityFields = ['configuration', 'providerType'];
    const healthCheckFields = ['configuration', 'endpoint', 'isActive', 'isPrimary'];

    return {
      requiresHealthCheck: edits.some(e => healthCheckFields.includes(e.field as string)),
      affectsConnectivity: edits.some(e => connectivityFields.includes(e.field as string)),
      changesCapabilities: edits.some(e => capabilityFields.includes(e.field as string)),
    };
  }

  private requiresConnectivityTest(edits: EditProviderConfigurationParams['edits']): boolean {
    const criticalFields = ['configuration', 'endpoint'];
    return edits.some(e => criticalFields.includes(e.field as string));
  }

  private async performConnectivityTest(
    config: ProviderConfiguration
  ): Promise<{ connectivityTest: boolean; performanceTest?: { latencyMs: number; success: boolean } }> {
    try {
      const testResult = await this.providerProxy.testProvider(
        config.providerId,
        await this.createTestPayload(config.providerType)
      );

      return {
        connectivityTest: testResult.success,
        performanceTest: {
          latencyMs: testResult.latencyMs,
          success: testResult.success,
        },
      };
    } catch (error) {
      this.logger.warn('Connectivity test failed', {
        error: error instanceof Error ? error.message : String(error),
        providerId: config.providerId,
      });
      return {
        connectivityTest: false,
      };
    }
  }

  private async createTestPayload(providerType: string): Promise<Record<string, unknown>> {
    try {
      if (!this.templateClient) {
        throw new DomainError('Template client not available', 503);
      }
      const testPrompt = await this.templateClient.getProviderTestPrompt(providerType as 'llm' | 'image' | 'video' | 'music' | 'audio' | 'text', {
        test_context: 'provider_configuration_edit',
      });

      const testPayloads: Record<string, Record<string, unknown>> = {
        llm: { prompt: testPrompt, maxTokens: 1 },
        music: { genre: 'test', duration: 1 },
        image: { prompt: testPrompt, size: '256x256' },
        video: { prompt: testPrompt, duration: 1 },
        audio: { text: testPrompt, voice: 'default' },
        text: { text: testPrompt },
      };

      return testPayloads[providerType] || {};
    } catch (error) {
      this.logger.error('Template service unavailable — using static connectivity probe payload', {
        module: 'edit_provider_configuration_use_case',
        operation: 'createTestPayload',
        providerType,
        error: serializeError(error),
        phase: 'template_service_fallback',
      });

      return CONNECTIVITY_TEST_PAYLOADS[providerType] || {};
    }
  }

  // NOTE: Old basic sanitization methods removed - now using comprehensive security helper from domain utils

  /**
   * Batch edit multiple fields at once
   */
  async batchEdit(
    params: Omit<EditProviderConfigurationParams, 'edits'> & {
      changes: Record<string, ConfigFieldValue>;
    }
  ): Promise<EditProviderConfigurationResult> {
    const edits = Object.entries(params.changes).map(([field, value]) => ({
      field: field as keyof InsertProviderConfiguration,
      value,
      validate: true,
    }));

    return this.execute({
      id: params.id,
      edits,
      preview: params.preview,
      userId: params.userId,
    });
  }

  /**
   * Get edit suggestions for a provider
   */
  async getEditSuggestions(id: number): Promise<{
    optimizationSuggestions: Array<{
      field: string;
      currentValue: ConfigFieldValue;
      suggestedValue: ConfigFieldValue;
      reason: string;
      impact: 'low' | 'medium' | 'high';
    }>;
    validationIssues: Array<{
      field: string;
      issue: string;
      suggestedFix: string;
    }>;
  }> {
    const config = await this.providerConfigRepository.findById(id);
    if (!config) {
      throw ConfigError.providerNotFound(String(id));
    }

    const optimizationSuggestions = [];
    const validationIssues = [];

    // Health status suggestions
    if (config.healthStatus !== 'healthy' && config.isActive) {
      validationIssues.push({
        field: 'healthStatus',
        issue: 'Provider is active but not healthy',
        suggestedFix: 'Run health check or deactivate provider',
      });
    }

    // Priority optimization
    if (config.priority > 500) {
      optimizationSuggestions.push({
        field: 'priority',
        currentValue: config.priority, // Non-sensitive field - safe to expose
        suggestedValue: 100,
        reason: 'Lower priority number improves selection ranking',
        impact: 'medium' as const,
      });
    }

    // Timeout optimization based on configuration
    const configData = config.configuration as unknown as { timeout?: number };
    if (!configData.timeout || configData.timeout < 10000) {
      optimizationSuggestions.push({
        field: 'configuration.timeout',
        currentValue: configData.timeout || 'default',
        suggestedValue: 30000,
        reason: 'Consider increasing timeout for better reliability',
        impact: 'low' as const,
      });
    }

    return { optimizationSuggestions, validationIssues };
  }
}
