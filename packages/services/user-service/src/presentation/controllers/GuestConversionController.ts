/**
 * Guest Conversion Controller
 * Handles guest user tracking and conversion prompt endpoints
 */

import { Request, Response } from 'express';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess } from '../utils/response-helpers';
import { GuestConversionRepository, GuestEventType } from '@infrastructure/repositories';
import { DEFAULT_GUEST_CONVERSION_POLICY } from '@infrastructure/database/schemas/subscription-schema';
import { Result } from '@aiponge/shared-contracts';
import { createControllerHelpers, serializeError } from '@aiponge/platform-core';

const logger = getLogger('guest-conversion-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class GuestConversionController {
  constructor(private readonly guestConversionRepository: GuestConversionRepository) {}

  /**
   * Get active guest conversion policy
   * GET /guest-conversion/policy
   */
  async getPolicy(_req: Request, res: Response): Promise<void> {
    try {
      const policyResult = await this.guestConversionRepository.getActivePolicy();

      if (Result.isFail(policyResult)) {
        logger.error('Database error getting policy', { error: policyResult.error });
        ServiceErrors.serviceUnavailable(res, 'Failed to get guest conversion policy', _req);
        return;
      }

      sendSuccess(
        res,
        policyResult.data || {
          firstSongThreshold: DEFAULT_GUEST_CONVERSION_POLICY.firstSongThreshold,
          tracksPlayedThreshold: DEFAULT_GUEST_CONVERSION_POLICY.tracksPlayedThreshold,
          entriesCreatedThreshold: DEFAULT_GUEST_CONVERSION_POLICY.entriesCreatedThreshold,
          promptCooldownMs: DEFAULT_GUEST_CONVERSION_POLICY.promptCooldownMs,
          promptMessages: DEFAULT_GUEST_CONVERSION_POLICY.promptMessages,
        }
      );
    } catch (error) {
      logger.error('Get policy error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get guest conversion policy', _req);
      return;
    }
  }

  /**
   * Get guest conversion state for a user
   * GET /guest-conversion/:userId/state
   */
  async getState(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;

      const stateResult = await this.guestConversionRepository.getGuestState(userId);

      if (Result.isFail(stateResult)) {
        logger.error('Database error getting guest state', { userId, error: stateResult.error });
        ServiceErrors.serviceUnavailable(res, 'Failed to get guest conversion state', req);
        return;
      }

      let state = stateResult.data;
      if (!state) {
        state = await this.guestConversionRepository.createGuestState(userId);
      }

      sendSuccess(res, {
        songsCreated: state.songsGenerated,
        tracksPlayed: state.tracksPlayed,
        entriesCreated: state.entriesSaved,
        lastPromptTime: state.lastPromptShown,
        hasSeenPrompt: state.promptCount > 0,
        convertedAt: state.convertedAt,
      });
    } catch (error) {
      logger.error('Get state error', {
        error: serializeError(error),
        userId: req.params.userId,
      });
      ServiceErrors.fromException(res, error, 'Failed to get guest conversion state', req);
      return;
    }
  }

  /**
   * Track a guest event and evaluate prompt trigger
   * POST /guest-conversion/:userId/event
   * Body: { eventType: 'song_created' | 'track_played' | 'entry_created' }
   */
  async trackEvent(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId as string;
    const { eventType } = req.body;

    const validEvents: GuestEventType[] = ['song_created', 'track_played', 'entry_created'];
    if (!validEvents.includes(eventType)) {
      ServiceErrors.badRequest(res, 'Invalid event type. Must be song_created, track_played, or entry_created', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to track guest event',
      handler: async () => this.guestConversionRepository.trackEvent(userId, eventType),
    });
  }

  /**
   * Mark guest as converted (after registration)
   * POST /guest-conversion/:userId/convert
   */
  async markConverted(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to mark guest as converted',
      handler: async () => {
        const userId = req.params.userId as string;
        await this.guestConversionRepository.markConverted(userId);
        return { message: 'Guest marked as converted' };
      },
    });
  }
}
