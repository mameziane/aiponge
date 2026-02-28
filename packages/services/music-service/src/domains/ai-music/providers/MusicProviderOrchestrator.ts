import type {
  IMusicProvider,
  IMusicProviderOrchestrator,
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicProviderHealth,
  MusicProviderCapabilities,
} from '../interfaces/IMusicProvider';
import { getLogger } from '../../../config/service-urls';
import { MusicError, MusicErrorCode } from '../../../application/errors/errors';

const logger = getLogger('music-service:provider-orchestrator');

export class MusicProviderOrchestrator implements IMusicProviderOrchestrator {
  private readonly providers: Map<string, IMusicProvider>;
  private primaryProviderId: string;

  constructor(providers: IMusicProvider[], primaryProviderId?: string) {
    this.providers = new Map();
    for (const provider of providers) {
      this.providers.set(provider.providerId, provider);
    }

    this.primaryProviderId = primaryProviderId || providers[0]?.providerId || '';

    if (!this.providers.has(this.primaryProviderId)) {
      throw new MusicError(
        `Primary provider "${this.primaryProviderId}" not found in registered providers: [${this.listProviders().join(', ')}]`,
        503,
        MusicErrorCode.SERVICE_UNAVAILABLE
      );
    }

    logger.info('MusicProviderOrchestrator initialized', {
      primaryProvider: this.primaryProviderId,
      registeredProviders: this.listProviders(),
    });
  }

  async generateMusicWithFallback(request: MusicGenerationRequest): Promise<MusicGenerationResult> {
    const primary = this.providers.get(this.primaryProviderId)!;

    logger.info('Generating music via orchestrator', {
      primaryProvider: this.primaryProviderId,
      fallbackProviders: this.listProviders().filter(id => id !== this.primaryProviderId),
    });

    const result = await primary.generateMusic(request);

    if (result.success) {
      return result;
    }

    logger.warn('Primary provider failed, trying fallbacks', {
      primaryProvider: this.primaryProviderId,
      error: result.error,
    });

    for (const [providerId, provider] of this.providers) {
      if (providerId === this.primaryProviderId) continue;

      const health = await provider.checkHealth();
      if (!health.isHealthy) {
        logger.debug('Skipping unhealthy fallback provider', { providerId });
        continue;
      }

      logger.info('Attempting fallback provider', { providerId });
      const fallbackResult = await provider.generateMusic(request);

      if (fallbackResult.success) {
        logger.info('Fallback provider succeeded', { providerId });
        return fallbackResult;
      }

      logger.warn('Fallback provider also failed', {
        providerId,
        error: fallbackResult.error,
      });
    }

    return result;
  }

  getPrimaryProvider(): IMusicProvider {
    return this.providers.get(this.primaryProviderId)!;
  }

  async getProviderHealth(providerId: string): Promise<MusicProviderHealth> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        isHealthy: false,
        latencyMs: 0,
        errorRate: 0,
        lastChecked: new Date(),
      };
    }
    return provider.checkHealth();
  }

  getProviderCapabilities(providerId: string): MusicProviderCapabilities | null {
    const provider = this.providers.get(providerId);
    return provider?.capabilities ?? null;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
