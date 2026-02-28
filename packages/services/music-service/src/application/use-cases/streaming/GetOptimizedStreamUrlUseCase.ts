/**
 * Get Optimized Stream URL Use Case
 * Handles quality-based stream URL selection and optimization
 */

import { StreamQuality } from '@domains/music-catalog/entities/PlaybackSession';
import { AudioProcessingClient } from '@infrastructure/clients/AudioProcessingClient';
import { OptimizedStreamUrl } from '@infrastructure/contracts/audio-integration';
import { getLogger } from '@config/service-urls';
import { StreamingError } from '../../errors';

const logger = getLogger('get-optimized-stream-url');

export interface GetOptimizedStreamUrlRequest {
  trackId: string;
  preferredQuality: StreamQuality;
  userId?: string; // For analytics
  fallbackToLower?: boolean; // If preferred quality not available
}

export interface GetOptimizedStreamUrlResponse {
  trackId: string;
  selectedQuality: StreamQuality;
  streamUrl: string;
  cdnUrl?: string;
  bitrate: number;
  format: string;
  fileSize: number;
  availableQualities: StreamQuality[];
  fallbackUsed: boolean;
  expiresAt?: Date;
  message: string;
}

export class GetOptimizedStreamUrlUseCase {
  constructor(private audioProcessingClient: AudioProcessingClient) {}

  async execute(request: GetOptimizedStreamUrlRequest): Promise<GetOptimizedStreamUrlResponse> {
    try {
      // 1. Check if track is ready for streaming
      const isReady = await this.audioProcessingClient.isTrackReady(request.trackId);
      if (!isReady) {
        throw StreamingError.streamingUnavailable(`Track ${request.trackId} is not ready for streaming`);
      }

      // 2. Get available qualities
      const availableQualitiesStrings = await this.audioProcessingClient.getAvailableQualities(request.trackId);
      const availableQualities = availableQualitiesStrings.map(q => this.mapStringToStreamQuality(q));

      // 3. Select best available quality
      const selectedQuality = this.selectBestQuality(
        request.preferredQuality,
        availableQualities,
        request.fallbackToLower ?? true
      );

      if (!selectedQuality) {
        throw StreamingError.streamingUnavailable(`No suitable quality available for track ${request.trackId}`);
      }

      // 4. Get optimized stream URL
      const optimizedUrl = await this.audioProcessingClient.getOptimizedStreamUrl(request.trackId, selectedQuality);

      // 5. Record access for analytics (non-blocking)
      if (request.userId) {
        this.audioProcessingClient.recordTrackAccess(request.trackId, request.userId, selectedQuality).catch(error => {
          logger.warn('Failed to record track access', {
            module: 'get_optimized_stream_url',
            operation: 'execute',
            trackId: request.trackId,
            userId: request.userId,
            error: error instanceof Error ? error.message : String(error),
            phase: 'track_access_recording_failed',
          });
        });
      }

      // 6. Determine if fallback was used
      const fallbackUsed = selectedQuality !== request.preferredQuality.toString();

      return {
        trackId: request.trackId,
        selectedQuality: this.mapStringToStreamQuality(selectedQuality),
        streamUrl: optimizedUrl.url,
        cdnUrl: optimizedUrl.cdnUrl,
        bitrate: optimizedUrl.bitrate,
        format: optimizedUrl.format,
        fileSize: optimizedUrl.fileSize,
        availableQualities,
        fallbackUsed,
        expiresAt: optimizedUrl.expiresAt,
        message: fallbackUsed
          ? `Fallback to ${selectedQuality} quality (${request.preferredQuality} not available)`
          : `Optimized ${selectedQuality} quality stream ready`,
      };
    } catch (error) {
      if (error instanceof StreamingError) {
        throw error;
      }
      throw StreamingError.internalError(
        `Failed to get optimized stream URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private selectBestQuality(
    preferred: StreamQuality,
    available: StreamQuality[],
    allowFallback: boolean
  ): string | null {
    // Convert enum to string for API compatibility
    const preferredString = preferred.toString();

    // Check if preferred quality is available
    if (available.includes(preferred)) {
      return preferredString;
    }

    if (!allowFallback) {
      return null;
    }

    // Define quality hierarchy (best to worst)
    const qualityHierarchy: StreamQuality[] = [
      StreamQuality.LOSSLESS,
      StreamQuality.HIGH,
      StreamQuality.MEDIUM,
      StreamQuality.LOW,
    ];

    // Find preferred quality index
    const preferredIndex = qualityHierarchy.indexOf(preferred);

    // Try to find next best quality (fallback to lower quality)
    for (let i = preferredIndex + 1; i < qualityHierarchy.length; i++) {
      const fallbackQuality = qualityHierarchy[i];
      if (available.includes(fallbackQuality)) {
        return fallbackQuality.toString();
      }
    }

    // If no lower quality available, try higher quality
    for (let i = preferredIndex - 1; i >= 0; i--) {
      const fallbackQuality = qualityHierarchy[i];
      if (available.includes(fallbackQuality)) {
        return fallbackQuality.toString();
      }
    }

    // Return any available quality as last resort
    return available.length > 0 ? available[0].toString() : null;
  }

  private mapStringToStreamQuality(qualityString: string): StreamQuality {
    const mapping: { [key: string]: StreamQuality } = {
      lossless: StreamQuality.LOSSLESS,
      high: StreamQuality.HIGH,
      medium: StreamQuality.MEDIUM,
      low: StreamQuality.LOW,
    };

    return mapping[qualityString.toLowerCase()] || StreamQuality.MEDIUM;
  }
}
