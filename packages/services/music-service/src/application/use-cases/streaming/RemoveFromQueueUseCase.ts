/**
 * Remove From Queue Use Case
 * Removes tracks from the playback queue
 */

import { PlaybackSession } from '@domains/music-catalog/entities/PlaybackSession';
import { getLogger } from '@config/service-urls';
import { StreamingError } from '../../errors';

const logger = getLogger('music-service-removefromqueueusecase');

export interface RemoveFromQueueRequest {
  sessionId: string;
  queueItemIds?: string[];
  trackIds?: string[];
  position?: number; // Remove specific position
  clear?: boolean; // Clear entire queue
}

export interface RemoveFromQueueResponse {
  queueLength: number;
  removedItems: number;
  message: string;
}

export interface IPlaybackSessionRepository {
  findById(sessionId: string): Promise<PlaybackSession | null>;
  update(session: PlaybackSession): Promise<PlaybackSession>;
}

export class RemoveFromQueueUseCase {
  constructor(private sessionRepository: IPlaybackSessionRepository) {}

  async execute(request: RemoveFromQueueRequest): Promise<RemoveFromQueueResponse> {
    try {
      logger.warn('Removing items from session: {}', { data0: request.sessionId });

      // Find the session
      const session = await this.sessionRepository.findById(request.sessionId);
      if (!session) {
        throw StreamingError.sessionNotFound(request.sessionId);
      }

      const originalLength = session.queue.length;
      let removedItems = 0;

      if (request.clear) {
        // Clear entire queue
        removedItems = session.queue.length;
        session.queue = [];
        logger.warn('Cleared entire queue ({} items)', { data0: removedItems });
      } else if (request.position !== undefined) {
        // Remove specific position
        if (request.position >= 0 && request.position < session.queue.length) {
          session.queue.splice(request.position, 1);
          removedItems = 1;
          logger.warn('Removed item at position {}', { data0: request.position });
        }
      } else if (request.queueItemIds && request.queueItemIds.length > 0) {
        // Remove by queue item IDs
        session.queue = session.queue.filter(item => {
          const shouldRemove = request.queueItemIds!.includes(item.id);
          if (shouldRemove) removedItems++;
          return !shouldRemove;
        });
        logger.warn('Removed {} items by queue item IDs', { data0: removedItems });
      } else if (request.trackIds && request.trackIds.length > 0) {
        // Remove by track IDs
        session.queue = session.queue.filter(item => {
          const shouldRemove = request.trackIds!.includes(item.trackId);
          if (shouldRemove) removedItems++;
          return !shouldRemove;
        });
        logger.warn('Removed {} items by track IDs', { data0: removedItems });
      }

      // Update current track if it was removed
      if (session.currentTrackId) {
        const currentTrackExists = session.queue.some(item => item.trackId === session.currentTrackId);
        if (!currentTrackExists) {
          // Find next track or clear current
          if (session.queue.length > 0) {
            session.currentTrackId = session.queue[0].trackId;
          } else {
            session.currentTrackId = null;
          }
        }
      }

      // Update session
      const updatedSession = await this.sessionRepository.update(session);

      const message =
        removedItems > 0 ? `Removed ${removedItems} items from queue` : 'No items were removed from queue';

      logger.warn('{}. Queue length: {}', { data0: message, data1: updatedSession.queue.length });

      return {
        queueLength: updatedSession.queue.length,
        removedItems,
        message,
      };
    } catch (error) {
      logger.error('Error removing items from queue:', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof StreamingError) {
        throw error;
      }
      throw StreamingError.internalError(
        `Failed to remove items from queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}
