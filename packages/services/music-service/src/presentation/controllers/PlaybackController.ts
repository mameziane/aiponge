/**
 * Playback Controller - Enhanced audio playback with shuffle, repeat, and queue management
 * Uses controller-helpers wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { PlayTrackUseCase } from '../../application/use-cases/streaming/PlayTrackUseCase';
import { ControlPlaybackUseCase, PlaybackAction } from '../../application/use-cases/streaming/ControlPlaybackUseCase';
import { GetPlaybackSessionUseCase } from '../../application/use-cases/streaming/GetPlaybackSessionUseCase';
import { AddToQueueUseCase } from '../../application/use-cases/streaming/AddToQueueUseCase';
import { RemoveFromQueueUseCase } from '../../application/use-cases/streaming/RemoveFromQueueUseCase';
import { PlaybackMode, RepeatMode } from '../../domains/music-catalog/entities/PlaybackSession';
import { getLogger } from '../../config/service-urls';
import { createControllerHelpers, serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors } = getResponseHelpers();

const logger = getLogger('music-service-playbackcontroller');
const { executeSimple } = createControllerHelpers('music-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class PlaybackController {
  constructor(
    private playTrackUseCase: PlayTrackUseCase,
    private controlPlaybackUseCase: ControlPlaybackUseCase,
    private getPlaybackSessionUseCase: GetPlaybackSessionUseCase,
    private addToQueueUseCase: AddToQueueUseCase,
    private removeFromQueueUseCase: RemoveFromQueueUseCase
  ) {}

  async playTrack(req: Request, res: Response): Promise<void> {
    const { userId, trackId, deviceId } = req.body;

    if (!userId || !trackId || !deviceId) {
      ServiceErrors.badRequest(res, 'userId, trackId, and deviceId are required', req);
      return;
    }

    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to start playback',
      execute: async () => {
        const { playlistId, queueTrackIds, startIndex, mode, repeat, quality, position } = req.body;

        const result = await this.playTrackUseCase.execute({
          userId,
          trackId,
          deviceId,
          playlistId,
          queueTrackIds,
          startIndex,
          mode: mode as PlaybackMode,
          repeat: repeat as RepeatMode,
          quality,
          position,
        });

        return {
          success: true,
          data: result,
        };
      },
      skipSuccessCheck: true,
    });
  }

  async controlPlayback(req: Request, res: Response): Promise<void> {
    const { sessionId, action } = req.body;

    if (!sessionId || !action) {
      ServiceErrors.badRequest(res, 'sessionId and action are required', req);
      return;
    }

    const validActions: PlaybackAction[] = [
      'play',
      'pause',
      'resume',
      'stop',
      'next',
      'previous',
      'seek',
      'volume',
      'shuffle',
      'repeat',
    ];

    if (!validActions.includes(action as PlaybackAction)) {
      ServiceErrors.badRequest(res, `Invalid action. Must be one of: ${validActions.join(', ')}`, req);
      return;
    }

    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to control playback',
      execute: async () => {
        const { position, volume, mode, repeat } = req.body;

        const result = await this.controlPlaybackUseCase.execute({
          sessionId,
          action: action as PlaybackAction,
          position,
          volume,
          mode: mode as PlaybackMode,
          repeat: repeat as RepeatMode,
        });

        return {
          success: true,
          data: result,
        };
      },
      skipSuccessCheck: true,
    });
  }

  async getPlaybackSession(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params as { sessionId: string };

    if (!sessionId) {
      ServiceErrors.badRequest(res, 'Session ID is required', req);
      return;
    }

    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to get session',
      execute: async () => {
        const userId = (req.headers['user-id'] as string) || '';
        const result = await this.getPlaybackSessionUseCase.execute({
          sessionId,
          userId: req.body.userId || userId,
        });

        return {
          success: true,
          data: result,
        };
      },
      skipSuccessCheck: true,
    });
  }

  async addToQueue(req: Request, res: Response): Promise<void> {
    const { sessionId, trackId } = req.body;

    if (!sessionId || !trackId) {
      ServiceErrors.badRequest(res, 'sessionId and trackId are required', req);
      return;
    }

    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to add to queue',
      execute: async () => {
        const { trackIds, position, playlistId } = req.body;

        const result = await this.addToQueueUseCase.execute({
          sessionId,
          trackIds: Array.isArray(trackIds) ? trackIds : [trackId],
          position,
          playlistId,
        });

        return {
          success: true,
          data: result,
        };
      },
      skipSuccessCheck: true,
    });
  }

  async removeFromQueue(req: Request, res: Response): Promise<void> {
    const trackId = (req.params.trackId as string) || '';
    const { sessionId } = req.body;

    if (!sessionId || !trackId) {
      ServiceErrors.badRequest(res, 'sessionId and trackId are required', req);
      return;
    }

    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to remove from queue',
      execute: async () => {
        const { queueItemIds, position, clear } = req.body;

        const result = await this.removeFromQueueUseCase.execute({
          sessionId,
          trackIds: [trackId],
          queueItemIds,
          position,
          clear,
        });

        return {
          success: true,
          data: result,
        };
      },
      skipSuccessCheck: true,
    });
  }
}
