/**
 * Control Playback Use Case - Handle all playback controls (play, pause, next, previous, shuffle, repeat)
 */

import {
  PlaybackSessionEntity,
  PlaybackMode,
  RepeatMode,
  PlaybackState,
  StreamQuality,
} from '@domains/music-catalog/entities/PlaybackSession';
import { GetOptimizedStreamUrlUseCase } from './GetOptimizedStreamUrlUseCase';
import { AudioProcessingClient } from '@infrastructure/clients/AudioProcessingClient';
import { StreamingError } from '../../errors';

export type PlaybackAction =
  | 'play'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'next'
  | 'previous'
  | 'seek'
  | 'volume'
  | 'shuffle'
  | 'repeat'
  | 'quality';

export interface ControlPlaybackRequest {
  sessionId: string;
  action: PlaybackAction;

  // Action-specific parameters
  position?: number; // For seek action
  volume?: number; // For volume action
  mode?: PlaybackMode; // For shuffle action
  repeat?: RepeatMode; // For repeat action
  quality?: StreamQuality; // For quality action
}

export interface ControlPlaybackResponse {
  sessionId: string;
  trackId: string;
  action: PlaybackAction;

  // Current state
  state: PlaybackState;
  position: number;
  duration: number;
  volume: number;

  // Mode settings
  mode: PlaybackMode;
  repeat: RepeatMode;

  // Streaming settings
  quality: StreamQuality;
  cdnUrl?: string;
  availableQualities: StreamQuality[];

  // Queue state
  queueLength: number;
  currentIndex: number;
  hasNext: boolean;
  hasPrevious: boolean;

  // Track changes (for next/previous)
  trackChanged?: boolean;
  newStreamUrl?: string;

  message: string;
}

export interface IPlaybackSessionRepository {
  findBySessionId(sessionId: string): Promise<PlaybackSessionEntity | null>;
  save(session: PlaybackSessionEntity): Promise<void>;
}

export class ControlPlaybackUseCase {
  constructor(
    private playbackSessionRepository: IPlaybackSessionRepository,
    private getOptimizedStreamUrlUseCase: GetOptimizedStreamUrlUseCase,
    private audioProcessingClient: AudioProcessingClient
  ) {}

  async execute(request: ControlPlaybackRequest): Promise<ControlPlaybackResponse> {
    try {
      // 1. Get session
      const session = await this.playbackSessionRepository.findBySessionId(request.sessionId);
      if (!session) {
        throw StreamingError.sessionNotFound(request.sessionId);
      }

      const originalTrackId = session.currentTrackId;
      let trackChanged = false;
      let newStreamUrl: string | undefined;

      // 2. Execute action
      switch (request.action) {
        case 'play':
          session.play();
          break;

        case 'pause':
          session.pause();
          break;

        case 'resume':
          session.resume();
          break;

        case 'stop':
          session.stop();
          break;

        case 'next':
          const nextTrack = session.next();
          if (nextTrack && nextTrack !== originalTrackId) {
            trackChanged = true;
            const streamData = await this.getOptimizedStreamUrlUseCase.execute({
              trackId: nextTrack,
              preferredQuality: session.quality,
              userId: session.userId,
              fallbackToLower: true,
            });
            const trackMetadata = await this.audioProcessingClient.getTrackMetadata(nextTrack);

            newStreamUrl = streamData.streamUrl;
            (session as unknown as { props: { duration: number } }).props.duration = trackMetadata.duration;
            session.adaptQuality(streamData.selectedQuality, streamData.streamUrl, streamData.cdnUrl);
          }
          break;

        case 'previous':
          const prevTrack = session.previous();
          if (prevTrack && prevTrack !== originalTrackId) {
            trackChanged = true;
            const streamData = await this.getOptimizedStreamUrlUseCase.execute({
              trackId: prevTrack,
              preferredQuality: session.quality,
              userId: session.userId,
              fallbackToLower: true,
            });
            const trackMetadata = await this.audioProcessingClient.getTrackMetadata(prevTrack);

            newStreamUrl = streamData.streamUrl;
            (session as unknown as { props: { duration: number } }).props.duration = trackMetadata.duration;
            session.adaptQuality(streamData.selectedQuality, streamData.streamUrl, streamData.cdnUrl);
          }
          break;

        case 'seek':
          if (request.position !== undefined) {
            session.seek(request.position);
          } else {
            throw StreamingError.validationError('position', 'required for seek action');
          }
          break;

        case 'volume':
          if (request.volume !== undefined) {
            session.setVolume(request.volume);
          } else {
            throw StreamingError.validationError('volume', 'required for volume action');
          }
          break;

        case 'shuffle':
          if (request.mode !== undefined) {
            session.setPlaybackMode(request.mode);
          } else {
            // Toggle shuffle mode
            const newMode = session.mode === PlaybackMode.SHUFFLE ? PlaybackMode.NORMAL : PlaybackMode.SHUFFLE;
            session.setPlaybackMode(newMode);
          }
          break;

        case 'repeat':
          if (request.repeat !== undefined) {
            session.setRepeatMode(request.repeat);
          } else {
            // Cycle through repeat modes
            let newRepeat: RepeatMode;
            switch (session.repeat) {
              case RepeatMode.NONE:
                newRepeat = RepeatMode.ALL;
                break;
              case RepeatMode.ALL:
                newRepeat = RepeatMode.ONE;
                break;
              case RepeatMode.ONE:
                newRepeat = RepeatMode.NONE;
                break;
            }
            session.setRepeatMode(newRepeat);
          }
          break;

        case 'quality':
          if (request.quality !== undefined && request.quality !== session.quality) {
            const streamData = await this.getOptimizedStreamUrlUseCase.execute({
              trackId: session.currentTrackId,
              preferredQuality: request.quality,
              userId: session.userId,
              fallbackToLower: true,
            });

            session.adaptQuality(streamData.selectedQuality, streamData.streamUrl, streamData.cdnUrl);
            newStreamUrl = streamData.streamUrl;
          }
          break;

        default:
          throw StreamingError.invalidCommand(request.action);
      }

      // 3. Save updated session
      await this.playbackSessionRepository.save(session);

      // 4. Generate response message
      const message = this.generateActionMessage(request.action, session, trackChanged);

      // 5. Return response
      return {
        sessionId: session.id,
        trackId: session.currentTrackId,
        action: request.action,
        state: session.state,
        position: session.position,
        duration: session.duration,
        volume: session.volume,
        mode: session.mode,
        repeat: session.repeat,
        quality: session.quality,
        cdnUrl: session.cdnUrl,
        availableQualities: session.availableQualities,
        queueLength: session.getQueueLength(),
        currentIndex: session.queue.currentIndex,
        hasNext: session.hasNext(),
        hasPrevious: session.hasPrevious(),
        trackChanged,
        newStreamUrl,
        message,
      };
    } catch (error) {
      if (error instanceof StreamingError) {
        throw error;
      }
      throw StreamingError.playbackFailed(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  private generateActionMessage(action: PlaybackAction, session: PlaybackSessionEntity, trackChanged: boolean): string {
    switch (action) {
      case 'play':
        return 'Playback started';
      case 'pause':
        return 'Playback paused';
      case 'resume':
        return 'Playback resumed';
      case 'stop':
        return 'Playback stopped';
      case 'next':
        return trackChanged ? 'Skipped to next track' : 'Reached end of queue';
      case 'previous':
        return trackChanged ? 'Went to previous track' : 'Restarted current track';
      case 'seek':
        return `Seeked to ${Math.floor(session.position)}s`;
      case 'volume':
        return `Volume set to ${session.volume}%`;
      case 'shuffle':
        return session.mode === PlaybackMode.SHUFFLE ? 'Shuffle enabled' : 'Shuffle disabled';
      case 'repeat':
        const repeatLabels = {
          [RepeatMode.NONE]: 'Repeat disabled',
          [RepeatMode.ALL]: 'Repeat all enabled',
          [RepeatMode.ONE]: 'Repeat one enabled',
        };
        return repeatLabels[session.repeat];
      case 'quality':
        return `Quality changed to ${session.quality}`;
      default:
        return 'Playback updated';
    }
  }
}
