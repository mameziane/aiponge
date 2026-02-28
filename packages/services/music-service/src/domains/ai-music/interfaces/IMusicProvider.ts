/**
 * Music Provider Interface
 *
 * Abstraction for music generation providers (MusicAPI.ai, ElevenLabs, etc.)
 * Enables automatic failover between providers when primary is unavailable.
 */

export interface MusicProviderCapabilities {
  supportsSyncedLyrics: boolean;
  supportsEarlyPlayback: boolean;
  supportsInstrumental: boolean;
  supportsVocalGender: boolean;
  maxDurationSeconds?: number;
}

export interface MusicGenerationRequest {
  prompt: string;
  title?: string;
  lyrics?: string;
  genre?: string;
  style?: string;
  mood?: string;
  tempo?: number;
  duration?: number;
  numClips?: number;
  vocalGender?: 'f' | 'm' | null;
  negativeTags?: string;
  styleWeight?: number;
  isInstrumental?: boolean;
  instrumentType?: string;
  culturalStyle?: string;
}

export interface MusicClip {
  clipId: string;
  audioUrl: string;
  duration?: number;
  title?: string;
}

export interface MusicGenerationResult {
  success: boolean;
  taskId?: string;
  clips?: MusicClip[];
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    provider: string;
    processingTimeMs: number;
    creditsUsed?: number;
  };
}

export interface MusicProviderHealth {
  isHealthy: boolean;
  latencyMs: number;
  errorRate: number;
  lastChecked: Date;
}

export interface IMusicProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly capabilities: MusicProviderCapabilities;

  generateMusic(request: MusicGenerationRequest): Promise<MusicGenerationResult>;
  checkHealth(): Promise<MusicProviderHealth>;
  getCreditsBalance(): Promise<{ credits: number; extraCredits?: number }>;
}

export interface IMusicProviderOrchestrator {
  generateMusicWithFallback(request: MusicGenerationRequest): Promise<MusicGenerationResult>;
  getPrimaryProvider(): IMusicProvider;
  getProviderHealth(providerId: string): Promise<MusicProviderHealth>;
  getProviderCapabilities(providerId: string): MusicProviderCapabilities | null;
  listProviders(): string[];
}
