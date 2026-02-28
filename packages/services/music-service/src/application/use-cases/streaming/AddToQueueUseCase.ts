/**
 * Add To Queue Use Case
 * Adds tracks to the playback queue
 */

import { PlaybackSessionEntity as PlaybackSession, QueueItem } from '@domains/music-catalog/entities/PlaybackSession';
import type { Track } from '@schema/music-schema';
import { getLogger } from '@config/service-urls';
import { StreamingError } from '../../errors';

const logger = getLogger('music-service-addtoqueueusecase');

export interface AddToQueueRequest {
  sessionId: string;
  trackIds: string[];
  position?: 'next' | 'end';
  playlistId?: string;
}

export interface AddToQueueResponse {
  queueLength: number;
  addedTracks: number;
  message: string;
}

export interface IPlaybackSessionRepository {
  findById(sessionId: string): Promise<PlaybackSession | null>;
  update(session: PlaybackSession): Promise<PlaybackSession>;
}

export interface ITrackRepository {
  findTrackById(id: string): Promise<Track | null>;
}

export class AddToQueueUseCase {
  constructor(
    private sessionRepository: IPlaybackSessionRepository,
    private trackRepository: ITrackRepository
  ) {}

  async execute(request: AddToQueueRequest): Promise<AddToQueueResponse> {
    try {
      logger.info('Adding tracks to session', {
        trackCount: request.trackIds.length,
        sessionId: request.sessionId,
      });

      // Find the session
      const session = await this.sessionRepository.findById(request.sessionId);
      if (!session) {
        throw StreamingError.sessionNotFound(request.sessionId);
      }

      // Validate tracks exist
      const tracks: Track[] = [];
      for (const trackId of request.trackIds) {
        const track = await this.trackRepository.findTrackById(trackId);
        if (track) {
          tracks.push(track);
        }
      }

      if (tracks.length !== request.trackIds.length) {
        throw StreamingError.validationError('trackIds', 'Some tracks were not found');
      }

      // Create queue items
      const currentQueueLength = session.queue.items.length;
      const queueItems: QueueItem[] = tracks.map((track, index) => ({
        trackId: track.id,
        position: currentQueueLength + index,
        metadata: {
          title: track.title,
          displayName: (track.metadata as { displayName?: string })?.displayName || 'Unknown',
          duration: track.duration || 0,
        },
      }));

      // Add to queue based on position
      if (request.position === 'next') {
        // Insert after current track
        const currentIndex = session.queue.items.findIndex(item => item.trackId === session.currentTrackId);
        const insertPosition = currentIndex >= 0 ? currentIndex + 1 : 0;
        session.queue.items.splice(insertPosition, 0, ...queueItems);
      } else {
        // Add to end (default)
        session.queue.items.push(...queueItems);
      }

      // Update session
      const updatedSession = await this.sessionRepository.update(session);

      logger.info('Added tracks to queue', {
        addedCount: queueItems.length,
        queueLength: updatedSession.queue.items.length,
      });

      return {
        queueLength: updatedSession.queue.items.length,
        addedTracks: queueItems.length,
        message: `Added ${queueItems.length} tracks to queue`,
      };
    } catch (error) {
      logger.error('Error adding tracks to queue:', { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof StreamingError) {
        throw error;
      }
      throw StreamingError.internalError(
        `Failed to add tracks to queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}
