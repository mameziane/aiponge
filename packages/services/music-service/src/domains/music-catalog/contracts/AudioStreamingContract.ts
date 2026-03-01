/**
 * Audio Streaming Domain Contract
 * Type definitions for audio streaming capabilities.
 * These live in the domain layer so that domain ports can depend on them
 * without importing from infrastructure.
 */

export interface AudioMetadata {
  title?: string;
  displayName?: string;
  album?: string;
  year?: number;
  genre?: string;
  track?: number;
  duration: number; // in seconds
  bitrate: number; // in kbps
  sampleRate: number; // in Hz
  channels: number;
  codec: string;
}

export interface OptimizedStreamUrl {
  quality: string;
  url: string;
  cdnUrl?: string;
  bitrate: number;
  format: string;
  fileSize: number;
  expiresAt?: Date;
}

export interface AudioStreamingContract {
  /**
   * Get optimized stream URL for a track with specified quality
   */
  getOptimizedStreamUrl(trackId: string, quality: string): Promise<OptimizedStreamUrl>;

  /**
   * Get track metadata including duration and technical details
   */
  getTrackMetadata(trackId: string): Promise<AudioMetadata>;

  /**
   * Get all available quality levels for a track
   */
  getAvailableQualities(trackId: string): Promise<string[]>;

  /**
   * Get multiple optimized URLs for different qualities (batch operation)
   */
  getBatchOptimizedUrls(requests: Array<{ trackId: string; quality: string }>): Promise<OptimizedStreamUrl[]>;

  /**
   * Record access to track for analytics and optimization
   */
  recordTrackAccess(trackId: string, userId: string, quality: string): Promise<void>;

  /**
   * Check if track is ready for streaming (processing complete)
   */
  isTrackReady(trackId: string): Promise<boolean>;
}
