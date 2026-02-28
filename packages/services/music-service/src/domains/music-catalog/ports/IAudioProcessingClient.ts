import type { AudioStreamingContract, OptimizedStreamUrl } from '../../../infrastructure/contracts/audio-integration';

export interface AudioProcessingOptions {
  format?: 'mp3' | 'wav' | 'flac';
  normalize?: boolean;
}

export interface ProcessingResult {
  success: boolean;
  outputUrl?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface IAudioProcessingClient extends AudioStreamingContract {
  processAudio(inputUrl: string, options?: AudioProcessingOptions): Promise<ProcessingResult>;

  getProcessingStatus(taskId: string): Promise<'pending' | 'processing' | 'completed' | 'failed'>;

  isTrackReady(trackId: string): Promise<boolean>;

  getAvailableQualities(trackId: string): Promise<string[]>;

  getOptimizedStreamUrl(trackId: string, quality: string): Promise<OptimizedStreamUrl>;

  getBatchOptimizedUrls(requests: Array<{ trackId: string; quality: string }>): Promise<OptimizedStreamUrl[]>;

  recordTrackAccess(trackId: string, userId: string, quality: string): Promise<void>;
}
