import type {
  IMusicProvider,
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicProviderHealth,
  MusicProviderCapabilities,
} from '../interfaces/IMusicProvider';
import type { IProviderClient, ProviderMusicGenerationRequest } from '../interfaces/IProviderClient';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('music-service:musicapi-provider');

export class MusicApiProvider implements IMusicProvider {
  readonly providerId = 'musicapi';
  readonly providerName = 'MusicAPI.ai';
  readonly capabilities: MusicProviderCapabilities = {
    supportsSyncedLyrics: true,
    supportsEarlyPlayback: true,
    supportsInstrumental: true,
    supportsVocalGender: true,
    maxDurationSeconds: 240,
  };

  constructor(private readonly client: IProviderClient) {}

  async generateMusic(request: MusicGenerationRequest): Promise<MusicGenerationResult> {
    const startTime = Date.now();

    try {
      const providerRequest: ProviderMusicGenerationRequest = {
        prompt: request.prompt,
        parameters: {
          title: request.title,
          style: request.style,
          genre: request.genre,
          mood: request.mood,
          duration: request.duration,
          isInstrumental: request.isInstrumental ?? !request.lyrics,
          instrumentType: request.instrumentType,
          vocalGender: request.vocalGender,
          musicType: request.style || 'song',
          negativeTags: request.negativeTags,
          tempo: request.tempo,
          numClips: request.numClips,
          styleWeight: request.styleWeight,
          culturalStyle: request.culturalStyle,
        },
        options: {
          preferredProvider: 'musicapi',
        },
      };

      const result = await this.client.generateMusic(providerRequest);
      const processingTimeMs = Date.now() - startTime;

      if (!result.success) {
        const errorMsg =
          typeof result.error === 'string'
            ? result.error
            : (result.error as { message?: string })?.message || 'Audio generation failed';

        return {
          success: false,
          error: { code: 'GENERATION_FAILED', message: errorMsg },
          metadata: {
            provider: this.providerId,
            processingTimeMs,
          },
        };
      }

      const clips = (result.variations || []).map((v, idx) => ({
        clipId: v.clipId || `${this.providerId}-${idx}`,
        audioUrl: v.audioUrl,
        duration: undefined,
        title: request.title,
      }));

      if (clips.length === 0 && result.audioUrl) {
        clips.push({
          clipId: `${this.providerId}-0`,
          audioUrl: result.audioUrl,
          duration: undefined,
          title: request.title,
        });
      }

      return {
        success: true,
        clips,
        metadata: {
          provider: this.providerId,
          processingTimeMs,
          creditsUsed: result.cost,
        },
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      logger.error('MusicApiProvider.generateMusic failed', { error: message });

      return {
        success: false,
        error: { code: 'PROVIDER_ERROR', message },
        metadata: {
          provider: this.providerId,
          processingTimeMs,
        },
      };
    }
  }

  async checkHealth(): Promise<MusicProviderHealth> {
    const startTime = Date.now();
    try {
      const result = await this.client.getProviderHealth();
      return {
        isHealthy: result.success && (result.health?.healthy ?? true),
        latencyMs: Date.now() - startTime,
        errorRate: 0,
        lastChecked: new Date(),
      };
    } catch (error) {
      logger.warn('MusicApiProvider health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        errorRate: 1,
        lastChecked: new Date(),
      };
    }
  }

  async getCreditsBalance(): Promise<{ credits: number; extraCredits?: number }> {
    return { credits: -1 };
  }
}
