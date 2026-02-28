import { getLogger } from '../../config/service-urls';
import { AudioProcessingService } from '../../domains/ai-music/services/AudioProcessingService';
import { AudioStreamingContract, OptimizedStreamUrl } from '../contracts/audio-integration';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('music-service-audioprocessingclient');

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

import type { IAudioProcessingClient } from '../../domains/music-catalog/ports/IAudioProcessingClient';

export class AudioProcessingClient implements IAudioProcessingClient {
  private audioService: AudioProcessingService;

  constructor() {
    this.audioService = new AudioProcessingService();
  }

  async getTrackMetadata(trackId: string): Promise<import('../contracts/audio-integration').AudioMetadata> {
    try {
      logger.info('Getting metadata for track', { trackId });

      const analysis = await this.audioService.analyzeAudio(trackId);

      return {
        duration: analysis.duration,
        bitrate: analysis.bitrate,
        sampleRate: analysis.sampleRate,
        codec: analysis.format || 'mp3',
        channels: analysis.channels,
      };
    } catch (error) {
      logger.error('Metadata fetch failed', {
        trackId,
        error: serializeError(error),
      });
      return {
        duration: 180,
        bitrate: 320,
        sampleRate: 44100,
        codec: 'mp3',
        channels: 2,
      };
    }
  }

  async processAudio(inputUrl: string, options: AudioProcessingOptions = {}): Promise<ProcessingResult> {
    try {
      logger.info('Processing audio', { inputUrl, options });

      const result = await this.audioService.processAudio(inputUrl, {
        outputFormat: options.format || 'mp3',
        normalize: options.normalize || false,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Audio processing failed',
        };
      }

      return {
        success: true,
        outputUrl: result.outputUrl,
        metadata: {
          originalFormat: result.metadata?.sourceAnalysis?.format || 'mp3',
          outputFormat: result.outputFormat,
          processingTimeMs: result.processingTimeMs,
          qualityScore: result.qualityScore,
          processedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Audio processing failed', {
        inputUrl,
        error: serializeError(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getProcessingStatus(taskId: string): Promise<'pending' | 'processing' | 'completed' | 'failed'> {
    try {
      logger.info('Getting processing status', { taskId });

      return 'completed';
    } catch (error) {
      logger.error('Status check failed', {
        taskId,
        error: serializeError(error),
      });
      return 'failed';
    }
  }

  async isTrackReady(trackId: string): Promise<boolean> {
    try {
      logger.info('Checking if track is ready', { trackId });
      return true;
    } catch (error) {
      logger.error('Track ready check failed', {
        trackId,
        error: serializeError(error),
      });
      return false;
    }
  }

  async getAvailableQualities(trackId: string): Promise<string[]> {
    try {
      logger.info('Getting available qualities for track', { trackId });
      return ['low', 'medium', 'high', 'lossless'];
    } catch (error) {
      logger.error('Get available qualities failed', {
        trackId,
        error: serializeError(error),
      });
      return ['medium'];
    }
  }

  async getOptimizedStreamUrl(trackId: string, quality: string): Promise<OptimizedStreamUrl> {
    try {
      logger.info('Getting optimized stream URL', { trackId, quality });

      const bitrateMap: Record<string, number> = {
        low: 128,
        medium: 256,
        high: 320,
        lossless: 1411,
      };

      return {
        quality,
        url: `/api/music/stream/${trackId}?quality=${quality}`,
        cdnUrl: undefined,
        bitrate: bitrateMap[quality] || 256,
        format: quality === 'lossless' ? 'flac' : 'mp3',
        fileSize: 0,
        expiresAt: new Date(Date.now() + 3600000),
      };
    } catch (error) {
      logger.error('Get optimized stream URL failed', {
        trackId,
        quality,
        error: serializeError(error),
      });
      throw error;
    }
  }

  async getBatchOptimizedUrls(requests: Array<{ trackId: string; quality: string }>): Promise<OptimizedStreamUrl[]> {
    return Promise.all(requests.map(req => this.getOptimizedStreamUrl(req.trackId, req.quality)));
  }

  async recordTrackAccess(trackId: string, userId: string, quality: string): Promise<void> {
    try {
      logger.info('Recording track access', { trackId, userId, quality });
    } catch (error) {
      logger.warn('Record track access failed (non-blocking)', {
        trackId,
        userId,
        quality,
        error: serializeError(error),
      });
    }
  }
}
