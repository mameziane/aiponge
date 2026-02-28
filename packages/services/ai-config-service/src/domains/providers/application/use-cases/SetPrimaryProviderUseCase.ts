/**
 * Set Primary Provider Use Case
 * Sets a provider as primary for its type with validation and state management
 */

import { IProviderConfigRepository } from '../../domain/repositories/IProviderConfigRepository';
import { IProviderProxy } from '../interfaces/IProviderProxy';
import { ProviderConfiguration, ProviderType } from '../../domain/entities/ProviderConfiguration';
import { sanitizeProviderConfiguration, sanitizeErrorMessage } from '../../utils/security';
import { getLogger } from '@config/service-urls';
import { ConfigError } from '../../../../application/errors';

export interface SetPrimaryProviderParams {
  providerId: number;
  userId?: string;
  performHealthCheck?: boolean;
  force?: boolean; // Force even if provider is unhealthy
}

export interface SetPrimaryProviderResult {
  newPrimaryProvider: ProviderConfiguration;
  previousPrimaryProvider?: ProviderConfiguration;
  healthCheck?: {
    success: boolean;
    latencyMs: number;
    error?: string;
  };
  warnings?: string[];
  impact: {
    affectedOperations: string[];
    willReplaceExisting: boolean;
    serviceQualityChange?: 'improved' | 'degraded' | 'unchanged';
  };
}

export class SetPrimaryProviderUseCase {
  private readonly logger = getLogger('set-primary-provider-use-case');

  constructor(
    private providerConfigRepository: IProviderConfigRepository,
    private providerProxy: IProviderProxy
  ) {}

  async execute(params: SetPrimaryProviderParams): Promise<SetPrimaryProviderResult> {
    try {
      const provider = await this.findAndValidateProvider(params);

      // Find existing primary provider for this type
      const existingPrimary = await this.providerConfigRepository.findPrimaryProvider(provider.providerType);

      // Perform health check if requested (default: true)
      const healthCheckResult = await this.performHealthCheckIfNeeded(provider, params);

      // Set the new primary provider (this also unsets the previous primary)
      const newPrimaryProvider = await this.providerConfigRepository.setPrimaryProvider(params.providerId);

      // Analyze the impact of the change
      const impact = await this.analyzeImpact(provider, existingPrimary || undefined);

      // Generate warnings if applicable
      const warnings = this.generateWarnings(provider, existingPrimary || undefined, healthCheckResult);

      this.logPrimaryProviderChange(provider, existingPrimary, params.userId, warnings);

      // SECURITY: Sanitize both provider configurations before returning to prevent secret exposure
      const sanitizedNewPrimary = sanitizeProviderConfiguration(newPrimaryProvider) as ProviderConfiguration;
      const sanitizedPreviousPrimary = existingPrimary
        ? (sanitizeProviderConfiguration(existingPrimary) as ProviderConfiguration)
        : undefined;

      return {
        newPrimaryProvider: sanitizedNewPrimary,
        previousPrimaryProvider: sanitizedPreviousPrimary,
        healthCheck: healthCheckResult,
        warnings: warnings.length > 0 ? warnings : undefined,
        impact,
      };
    } catch (error: unknown) {
      this.logger.error('Error setting primary provider:', {
        module: 'set_primary_provider_use_case',
        operation: 'execute',
        error: sanitizeErrorMessage(error instanceof Error ? error : String(error)),
        providerId: params.providerId,
        phase: 'primary_provider_error',
      });
      throw ConfigError.internalError('Failed to set primary provider', error instanceof Error ? error : undefined);
    }
  }

  private async findAndValidateProvider(params: SetPrimaryProviderParams): Promise<ProviderConfiguration> {
    // Find the provider to set as primary
    const provider = await this.providerConfigRepository.findById(params.providerId);
    if (!provider) {
      throw ConfigError.providerNotFound(String(params.providerId));
    }

    // Validate that the provider can be set as primary
    const validation = await this.validatePrimaryEligibility(provider, params.force);
    if (!validation.eligible) {
      throw ConfigError.invalidProviderConfig(provider.providerId, validation.reasons.join(', '));
    }

    return provider;
  }

  private async performHealthCheckIfNeeded(
    provider: ProviderConfiguration,
    params: SetPrimaryProviderParams
  ): Promise<{ success: boolean; latencyMs: number; error?: string } | undefined> {
    if (params.performHealthCheck === false) {
      return undefined;
    }

    try {
      const healthCheckResult = await this.providerProxy.testProvider(
        provider.providerId,
        this.createTestPayload(provider.providerType)
      );

      if (!healthCheckResult.success && !params.force) {
        throw ConfigError.providerUnavailable(provider.providerId, 'Health check failed. Use force=true to override.');
      }

      return healthCheckResult;
    } catch (error: unknown) {
      if (!params.force) {
        throw ConfigError.providerUnavailable(provider.providerId, sanitizeErrorMessage(error instanceof Error ? error : String(error)));
      }
      return {
        success: false,
        latencyMs: 0,
        error: sanitizeErrorMessage(error instanceof Error ? error : String(error)),
      };
    }
  }

  private logPrimaryProviderChange(
    provider: ProviderConfiguration,
    existingPrimary: ProviderConfiguration | null,
    userId?: string,
    warnings: string[] = []
  ): void {
    this.logger.info(
      `Primary provider changed for ${provider.providerType}: ${existingPrimary?.providerId || 'none'} -> ${provider.providerId} by ${userId || 'system'}`,
      {
        module: 'set_primary_provider_use_case',
        operation: 'execute',
        providerType: provider.providerType,
        newProviderId: provider.providerId,
        previousProviderId: existingPrimary?.providerId,
        userId,
        phase: 'primary_provider_changed',
      }
    );

    if (warnings.length > 0) {
      this.logger.warn('Primary provider change warnings:', {
        module: 'set_primary_provider_use_case',
        operation: 'execute',
        warnings,
        providerId: provider.providerId,
        phase: 'primary_provider_warnings',
      });
    }
  }

  private async validatePrimaryEligibility(
    provider: ProviderConfiguration,
    force?: boolean
  ): Promise<{ eligible: boolean; reasons: string[]; warnings: string[] }> {
    const reasons: string[] = [];
    const warnings: string[] = [];

    // Check if provider is active
    if (!provider.isActive) {
      if (force) {
        warnings.push('Setting an inactive provider as primary');
      } else {
        reasons.push('Provider is not active');
      }
    }

    // Check health status
    if (provider.healthStatus !== 'healthy') {
      if (force) {
        warnings.push(`Setting provider with ${provider.healthStatus} status as primary`);
      } else {
        reasons.push(`Provider health status is ${provider.healthStatus}`);
      }
    }

    // Check if provider already is primary
    if (provider.isPrimary) {
      if (force) {
        warnings.push('Provider is already set as primary');
      } else {
        reasons.push('Provider is already set as primary');
      }
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      warnings,
    };
  }

  private async analyzeImpact(
    newProvider: ProviderConfiguration,
    previousProvider?: ProviderConfiguration
  ): Promise<{
    affectedOperations: string[];
    willReplaceExisting: boolean;
    serviceQualityChange?: 'improved' | 'degraded' | 'unchanged';
  }> {
    const affectedOperations = this.getOperationsForProviderType(newProvider.providerType);
    const willReplaceExisting = !!previousProvider;

    let serviceQualityChange: 'improved' | 'degraded' | 'unchanged' | undefined;

    if (previousProvider) {
      // Compare providers to determine quality change
      serviceQualityChange = await this.compareProviderQuality(newProvider, previousProvider);
    }

    return {
      affectedOperations,
      willReplaceExisting,
      serviceQualityChange,
    };
  }

  private async compareProviderQuality(
    newProvider: ProviderConfiguration,
    previousProvider: ProviderConfiguration
  ): Promise<'improved' | 'degraded' | 'unchanged'> {
    try {
      // Get analytics for both providers
      const [newAnalytics, previousAnalytics] = await Promise.all([
        this.getProviderQualityMetrics(newProvider),
        this.getProviderQualityMetrics(previousProvider),
      ]);

      // Calculate quality scores
      const newScore = this.calculateQualityScore(newAnalytics, newProvider);
      const previousScore = this.calculateQualityScore(previousAnalytics, previousProvider);

      const difference = newScore - previousScore;

      if (Math.abs(difference) < 5) return 'unchanged';
      return difference > 0 ? 'improved' : 'degraded';
    } catch (error) {
      return 'unchanged';
    }
  }

  private async getProviderQualityMetrics(provider: ProviderConfiguration) {
    return {
      successRate: provider.healthStatus === 'healthy' ? 95 : 0,
      avgLatency: 500,
      totalRequests: 0,
      cost: typeof provider.costPerUnit === 'string' ? parseFloat(provider.costPerUnit) : Number(provider.costPerUnit),
    };
  }

  private calculateQualityScore(
    analytics: { successRate: number; avgLatency: number; totalRequests: number; cost: number },
    provider: ProviderConfiguration
  ): number {
    let score = 50; // Base score

    // Success rate contribution (up to 30 points)
    score += (analytics.successRate / 100) * 30;

    // Latency contribution (up to 20 points, better for lower latency)
    const latencyScore = Math.max(0, 20 - analytics.avgLatency / 100);
    score += latencyScore;

    // Health status contribution (up to 20 points)
    const healthScore = provider.healthStatus === 'healthy' ? 20 : provider.healthStatus === 'unknown' ? 10 : 0;
    score += healthScore;

    // Priority contribution (up to 20 points, lower priority number = higher score)
    const priorityScore = Math.max(0, 20 - provider.priority / 50);
    score += priorityScore;

    // Cost consideration (penalize very high costs, up to -10 points)
    const costPenalty = Math.min(10, parseFloat(provider.costPerUnit.toString()) * 1000000);
    score -= costPenalty;

    return Math.max(0, Math.min(100, score));
  }

  private generateWarnings(
    provider: ProviderConfiguration,
    previousProvider?: ProviderConfiguration,
    healthCheck?: { success: boolean; error?: string }
  ): string[] {
    const warnings: string[] = [];

    // Health-related warnings
    if (provider.healthStatus !== 'healthy') {
      warnings.push(`New primary provider has ${provider.healthStatus} health status`);
    }

    if (healthCheck && !healthCheck.success) {
      warnings.push(`Health check failed: ${healthCheck.error || 'Unknown error'}`);
    }

    // Performance warnings
    if (provider.priority > 500) {
      warnings.push('New primary provider has low priority (high priority number)');
    }

    // Transition warnings
    if (previousProvider && previousProvider.healthStatus === 'healthy' && provider.healthStatus !== 'healthy') {
      warnings.push('Switching from healthy provider to potentially unhealthy provider');
    }

    // Cost warnings
    if (
      previousProvider &&
      parseFloat(provider.costPerUnit.toString()) > parseFloat(previousProvider.costPerUnit.toString()) * 1.5
    ) {
      warnings.push('New primary provider is significantly more expensive');
    }

    return warnings;
  }

  private getOperationsForProviderType(providerType: string): string[] {
    const operationMappings = {
      llm: ['text_generation', 'text_analysis', 'chat_completion', 'code_generation'],
      music: ['music_generation', 'audio_synthesis', 'melody_creation'],
      image: ['image_generation', 'image_analysis', 'image_enhancement'],
      video: ['video_generation', 'video_analysis', 'video_processing'],
      audio: ['audio_generation', 'speech_synthesis', 'audio_processing'],
      text: ['text_processing', 'text_analysis', 'language_detection'],
    };

    return operationMappings[providerType as keyof typeof operationMappings] || [];
  }

  private createTestPayload(providerType: string): Record<string, unknown> {
    const testPayloads = {
      llm: { prompt: 'Test primary provider connection', maxTokens: 5 },
      music: { genre: 'test', duration: 5 },
      image: { prompt: 'test primary', size: '128x128' },
      video: { prompt: 'test primary video', duration: 3 },
      audio: { text: 'test primary audio', voice: 'default' },
      text: { text: 'test primary text processing' },
    };

    return testPayloads[providerType as keyof typeof testPayloads] || {};
  }

  /**
   * Get recommendations for primary provider selection
   */
  async getPrimaryProviderRecommendations(providerType: string): Promise<{
    currentPrimary?: ProviderConfiguration;
    recommendations: Array<{
      provider: ProviderConfiguration;
      score: number;
      reasons: string[];
      wouldImproveService: boolean;
    }>;
    analysis: {
      totalCandidates: number;
      healthyCandidates: number;
      needsImprovement: boolean;
    };
  }> {
    const currentPrimary = await this.providerConfigRepository.findPrimaryProvider(providerType as ProviderType);
    const allProviders = await this.providerConfigRepository.findActiveProviders(providerType as ProviderType);

    const recommendations = [];
    let healthyCandidates = 0;

    for (const provider of allProviders) {
      if (provider.id === currentPrimary?.id) continue;

      const metrics = await this.getProviderQualityMetrics(provider);
      const score = this.calculateQualityScore(metrics, provider);

      if (provider.healthStatus === 'healthy') {
        healthyCandidates++;
      }

      const reasons = [];
      let wouldImproveService = false;

      if (provider.healthStatus === 'healthy') {
        reasons.push('Healthy status');
      }

      if (metrics.successRate > 90) {
        reasons.push(`High success rate (${metrics.successRate.toFixed(1)}%)`);
      }

      if (metrics.avgLatency < 500) {
        reasons.push('Fast response time');
      }

      if (currentPrimary) {
        const currentMetrics = await this.getProviderQualityMetrics(currentPrimary);
        const currentScore = this.calculateQualityScore(currentMetrics, currentPrimary);
        wouldImproveService = score > currentScore + 5;
      } else {
        wouldImproveService = true;
        reasons.push('No current primary provider');
      }

      recommendations.push({
        provider,
        score,
        reasons,
        wouldImproveService,
      });
    }

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score);

    return {
      currentPrimary: currentPrimary || undefined,
      recommendations: recommendations.slice(0, 5), // Top 5 recommendations
      analysis: {
        totalCandidates: allProviders.length,
        healthyCandidates,
        needsImprovement: !currentPrimary || currentPrimary.healthStatus !== 'healthy',
      },
    };
  }

  /**
   * Auto-select best primary provider for a type
   */
  async autoSetPrimaryProvider(providerType: string, userId?: string): Promise<SetPrimaryProviderResult> {
    const recommendations = await this.getPrimaryProviderRecommendations(providerType);

    if (recommendations.recommendations.length === 0) {
      throw ConfigError.providerUnavailable(providerType, 'No suitable providers found for auto-selection');
    }

    const bestProvider = recommendations.recommendations[0];

    return this.execute({
      providerId: bestProvider.provider.id,
      userId,
      performHealthCheck: true,
    });
  }
}
