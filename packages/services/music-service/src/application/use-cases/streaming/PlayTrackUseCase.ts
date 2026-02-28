/**
 * Play Track Use Case - Enhanced playback with queue and mode support
 */

import {
  PlaybackSessionEntity,
  PlaybackMode,
  RepeatMode,
  PlaybackState,
  StreamQuality,
  StreamType,
} from '@domains/music-catalog/entities/PlaybackSession';
import { GetOptimizedStreamUrlUseCase } from './GetOptimizedStreamUrlUseCase';
import { AudioProcessingClient } from '@infrastructure/clients/AudioProcessingClient';
import { StreamingError } from '../../errors';

export interface PlayTrackRequest {
  userId: string;
  trackId: string;
  deviceId: string;

  // Optional queue context
  playlistId?: string;
  queueTrackIds?: string[];
  startIndex?: number;

  // Playback preferences
  mode?: PlaybackMode;
  repeat?: RepeatMode;
  quality?: StreamQuality;
  position?: number; // Start at specific position
}

export interface PlayTrackResponse {
  sessionId: string;
  trackId: string;
  streamUrl: string;
  position: number;
  duration: number;
  volume: number;

  // Playback state
  state: PlaybackState;
  mode: PlaybackMode;
  repeat: RepeatMode;

  // Streaming information
  quality: StreamQuality;
  cdnUrl?: string;
  availableQualities: StreamQuality[];
  fallbackUsed: boolean;

  // Queue information
  queueLength: number;
  currentIndex: number;
  hasNext: boolean;
  hasPrevious: boolean;

  message: string;
}

export interface IPlaybackSessionRepository {
  save(session: PlaybackSessionEntity): Promise<void>;
  findByUserId(userId: string): Promise<PlaybackSessionEntity | null>;
  findBySessionId(sessionId: string): Promise<PlaybackSessionEntity | null>;
  deleteBySessionId(sessionId: string): Promise<void>;
}

export class PlayTrackUseCase {
  constructor(
    private playbackSessionRepository: IPlaybackSessionRepository,
    private getOptimizedStreamUrlUseCase: GetOptimizedStreamUrlUseCase,
    private audioProcessingClient: AudioProcessingClient
  ) {}

  async execute(request: PlayTrackRequest): Promise<PlayTrackResponse> {
    try {
      // 1. Get or create playback session for user
      let session = await this.playbackSessionRepository.findByUserId(request.userId);

      if (!session) {
        // Create new session
        session = PlaybackSessionEntity.create({
          userId: request.userId,
          deviceId: request.deviceId,
          currentTrackId: request.trackId,
          duration: 0, // Will be updated below
          volume: 80, // Default volume
          mode: request.mode || PlaybackMode.NORMAL,
          repeat: request.repeat || RepeatMode.NONE,
          quality: request.quality || StreamQuality.MEDIUM,
          type: StreamType.ON_DEMAND,
          availableQualities: [],
        });
      }

      // 2. Load queue if provided
      if (request.queueTrackIds && request.queueTrackIds.length > 0) {
        const startIndex = request.startIndex ?? request.queueTrackIds.indexOf(request.trackId);
        session.loadQueue(request.queueTrackIds, Math.max(0, startIndex));
      } else if (request.trackId !== session.currentTrackId) {
        // Single track - create queue with just this track
        session.loadQueue([request.trackId], 0);
      }

      // 3. Apply playback preferences
      if (request.mode) {
        session.setPlaybackMode(request.mode);
      }
      if (request.repeat) {
        session.setRepeatMode(request.repeat);
      }

      // 4. Get optimized stream URL and track metadata
      const streamData = await this.getOptimizedStreamUrlUseCase.execute({
        trackId: request.trackId,
        preferredQuality: session.quality,
        userId: request.userId,
        fallbackToLower: true,
      });

      const trackMetadata = await this.audioProcessingClient.getTrackMetadata(request.trackId);

      // 5. Update session with stream data and metadata
      (session as unknown as { props: { duration: number } }).props.duration = trackMetadata.duration;
      session.setAvailableQualities(streamData.availableQualities);
      session.adaptQuality(streamData.selectedQuality, streamData.streamUrl, streamData.cdnUrl);

      // 6. Start playback
      session.play(request.trackId, streamData.streamUrl, streamData.cdnUrl);

      // 7. Seek to position if specified
      if (request.position && request.position > 0) {
        session.seek(request.position);
      }

      // 8. Save session
      await this.playbackSessionRepository.save(session);

      // 9. Return response
      return {
        sessionId: session.id,
        trackId: session.currentTrackId,
        streamUrl: session.streamUrl || streamData.streamUrl,
        position: session.position,
        duration: session.duration,
        volume: session.volume,
        state: session.state,
        mode: session.mode,
        repeat: session.repeat,
        quality: session.quality,
        cdnUrl: session.cdnUrl,
        availableQualities: session.availableQualities,
        fallbackUsed: streamData.fallbackUsed,
        queueLength: session.getQueueLength(),
        currentIndex: session.queue.currentIndex,
        hasNext: session.hasNext(),
        hasPrevious: session.hasPrevious(),
        message: streamData.fallbackUsed
          ? `Started with ${streamData.selectedQuality} quality (fallback)`
          : 'Track started successfully',
      };
    } catch (error) {
      throw StreamingError.playbackFailed(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }
}
