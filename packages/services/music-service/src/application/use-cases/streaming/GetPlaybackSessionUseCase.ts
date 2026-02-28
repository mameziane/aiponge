/**
 * Get Playback Session Use Case
 * Retrieves current playback session information
 */

import { PlaybackSession } from '@domains/music-catalog/entities/PlaybackSession';
import { getLogger } from '@config/service-urls';
import { StreamingError } from '../../errors';

const logger = getLogger('music-service-getplaybacksessionusecase');

export interface GetPlaybackSessionRequest {
  sessionId: string;
  userId?: string;
}

export interface GetPlaybackSessionResponse {
  session: PlaybackSession | null;
  isActive: boolean;
  message: string;
}

export interface IPlaybackSessionRepository {
  findById(sessionId: string): Promise<PlaybackSession | null>;
  findActiveByUserId(userId: string): Promise<PlaybackSession | null>;
}

export class GetPlaybackSessionUseCase {
  constructor(private sessionRepository: IPlaybackSessionRepository) {}

  async execute(request: GetPlaybackSessionRequest): Promise<GetPlaybackSessionResponse> {
    try {
      logger.warn('Retrieving session: {}', { data0: request.sessionId });

      let session: PlaybackSession | null = null;

      // Try to find by session ID first
      if (request.sessionId) {
        session = await this.sessionRepository.findById(request.sessionId);
      }

      // If not found and userId provided, find active session for user
      if (!session && request.userId) {
        session = await this.sessionRepository.findActiveByUserId(request.userId);
      }

      if (!session) {
        logger.warn('Session not found: {}', { data0: request.sessionId });
        return {
          session: null,
          isActive: false,
          message: 'Playback session not found',
        };
      }

      const isActive = session.status === 'playing' || session.status === 'paused';

      logger.warn('Session retrieved: {}, active: {}', { data0: session.id, data1: isActive });

      return {
        session,
        isActive,
        message: 'Playback session retrieved successfully',
      };
    } catch (error) {
      logger.error('Error retrieving session:', { error: error instanceof Error ? error.message : String(error) });
      throw StreamingError.internalError(
        `Failed to retrieve playback session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}
