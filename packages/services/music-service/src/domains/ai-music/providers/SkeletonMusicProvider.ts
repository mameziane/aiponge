import type {
  IMusicProvider,
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicProviderHealth,
  MusicProviderCapabilities,
} from '../interfaces/IMusicProvider';

export class SkeletonMusicProvider implements IMusicProvider {
  readonly providerId = 'skeleton';
  readonly providerName = 'Skeleton Provider (stub)';
  readonly capabilities: MusicProviderCapabilities = {
    supportsSyncedLyrics: false,
    supportsEarlyPlayback: false,
    supportsInstrumental: false,
    supportsVocalGender: false,
  };

  async generateMusic(_request: MusicGenerationRequest): Promise<MusicGenerationResult> {
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `${this.providerName} is a stub and cannot generate music. Wire up a real provider implementation.`,
      },
      metadata: {
        provider: this.providerId,
        processingTimeMs: 0,
      },
    };
  }

  async checkHealth(): Promise<MusicProviderHealth> {
    return {
      isHealthy: false,
      latencyMs: 0,
      errorRate: 0,
      lastChecked: new Date(),
    };
  }

  async getCreditsBalance(): Promise<{ credits: number; extraCredits?: number }> {
    return { credits: 0 };
  }
}
