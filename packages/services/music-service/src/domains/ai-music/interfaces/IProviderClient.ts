export interface ProviderMusicGenerationRequest {
  prompt: string;
  parameters: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface ProviderMusicGenerationResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string | { type?: string; message?: string };
  audioUrl?: string;
  variations?: Array<{ audioUrl: string; variationNumber: number; clipId?: string }>;
  metadata?: Record<string, unknown>;
  lyrics?: string;
  providerId?: string;
  model?: string;
  cost?: number;
  processingTimeMs?: number;
  enhancedPrompt?: string;
}

export interface ProviderHealthResponse {
  success: boolean;
  health?: {
    healthy: boolean;
    providers: Array<{ id: string; name: string; healthy: boolean }>;
  };
  error?: string;
}

export interface IProviderClient {
  generateMusic(request: ProviderMusicGenerationRequest): Promise<ProviderMusicGenerationResponse>;
  getProviderHealth(): Promise<ProviderHealthResponse>;
}
