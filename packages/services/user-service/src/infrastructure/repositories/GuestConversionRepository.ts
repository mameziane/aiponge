/**
 * Guest Conversion Repository Implementation
 * Handles guest user tracking and conversion prompt logic
 */

import { eq } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  usrGuestConversionPolicy,
  usrGuestConversionState,
  GuestConversionPolicy,
  GuestConversionState,
  DEFAULT_GUEST_CONVERSION_POLICY,
} from '../database/schemas/subscription-schema';
import { getLogger } from '../../config/service-urls';
import { Result } from '@aiponge/shared-contracts';
import { AuthError } from '../../application/errors';

const logger = getLogger('guest-conversion-repository');

export type GuestEventType = 'song_created' | 'track_played' | 'entry_created';
export type PromptType = 'first-song' | 'multiple-tracks' | 'entries' | null;

export interface TrackEventResult {
  shouldPrompt: boolean;
  promptType: PromptType;
  promptContent?: {
    title: string;
    message: string;
  };
  stats: {
    songsCreated: number;
    tracksPlayed: number;
    entriesCreated: number;
  };
}

export interface IGuestConversionRepository {
  getActivePolicy(): Promise<Result<GuestConversionPolicy | null>>;
  getGuestState(userId: string): Promise<Result<GuestConversionState | null>>;
  createGuestState(userId: string): Promise<GuestConversionState>;
  trackEvent(userId: string, eventType: GuestEventType): Promise<TrackEventResult>;
  markConverted(userId: string): Promise<void>;
}

export class GuestConversionRepository implements IGuestConversionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getActivePolicy(): Promise<Result<GuestConversionPolicy | null>> {
    try {
      const [policy] = await this.db
        .select()
        .from(usrGuestConversionPolicy)
        .where(eq(usrGuestConversionPolicy.isActive, true))
        .limit(1);

      if (!policy) {
        logger.debug('No active policy found, using defaults');
        return Result.ok(null);
      }

      return Result.ok(policy);
    } catch (error) {
      logger.error('Failed to get guest conversion policy', { error });
      return Result.fail('DATABASE_ERROR', 'Failed to get guest conversion policy', error);
    }
  }

  async getGuestState(userId: string): Promise<Result<GuestConversionState | null>> {
    try {
      const [state] = await this.db
        .select()
        .from(usrGuestConversionState)
        .where(eq(usrGuestConversionState.userId, userId));

      return Result.ok(state || null);
    } catch (error) {
      logger.error('Failed to get guest state', { userId, error });
      return Result.fail('DATABASE_ERROR', 'Failed to get guest state', error);
    }
  }

  async createGuestState(userId: string): Promise<GuestConversionState> {
    const [state] = await this.db
      .insert(usrGuestConversionState)
      .values({
        userId,
        songsGenerated: 0,
        tracksPlayed: 0,
        entriesSaved: 0,
        promptCount: 0,
      })
      .returning();

    logger.info('Guest conversion state created', { userId });
    return state;
  }

  async trackEvent(userId: string, eventType: GuestEventType): Promise<TrackEventResult> {
    const stateResult = await this.getGuestState(userId);

    let state: GuestConversionState;
    if (Result.isFail(stateResult)) {
      logger.error('Database error getting guest state - cannot track event', {
        userId,
        eventType,
        error: stateResult.error,
      });
      throw AuthError.internalError(`Database error: ${stateResult.error.message}`);
    } else if (!stateResult.data) {
      state = await this.createGuestState(userId);
    } else {
      state = stateResult.data;
    }

    const policyResult = await this.getActivePolicy();
    let config: GuestConversionPolicy | typeof DEFAULT_GUEST_CONVERSION_POLICY;
    if (Result.isFail(policyResult)) {
      logger.warn('Database error getting policy, using defaults', { error: policyResult.error });
      config = DEFAULT_GUEST_CONVERSION_POLICY;
    } else {
      config = policyResult.data || DEFAULT_GUEST_CONVERSION_POLICY;
    }

    const fieldMap: Record<GuestEventType, 'songsGenerated' | 'tracksPlayed' | 'entriesSaved'> = {
      song_created: 'songsGenerated',
      track_played: 'tracksPlayed',
      entry_created: 'entriesSaved',
    };

    const field = fieldMap[eventType];
    const newValue = state[field] + 1;

    const updateData = {
      songsGenerated: field === 'songsGenerated' ? newValue : state.songsGenerated,
      tracksPlayed: field === 'tracksPlayed' ? newValue : state.tracksPlayed,
      entriesSaved: field === 'entriesSaved' ? newValue : state.entriesSaved,
      updatedAt: new Date(),
    };

    const [updatedState] = await this.db
      .update(usrGuestConversionState)
      .set(updateData)
      .where(eq(usrGuestConversionState.userId, userId))
      .returning();

    const promptDecision = this.evaluatePromptTrigger(updatedState, config, eventType);

    if (promptDecision.shouldPrompt) {
      await this.db
        .update(usrGuestConversionState)
        .set({
          lastPromptShown: new Date(),
          promptCount: updatedState.promptCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(usrGuestConversionState.userId, userId));

      logger.info('Guest conversion prompt triggered', {
        userId,
        eventType,
        promptType: promptDecision.promptType,
      });
    }

    return {
      ...promptDecision,
      stats: {
        songsCreated: updatedState.songsGenerated,
        tracksPlayed: updatedState.tracksPlayed,
        entriesCreated: updatedState.entriesSaved,
      },
    };
  }

  async markConverted(userId: string): Promise<void> {
    await this.db
      .update(usrGuestConversionState)
      .set({
        converted: true,
        convertedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usrGuestConversionState.userId, userId));

    logger.info('Guest marked as converted', { userId });
  }

  private evaluatePromptTrigger(
    state: GuestConversionState,
    config: GuestConversionPolicy | typeof DEFAULT_GUEST_CONVERSION_POLICY,
    eventType: GuestEventType
  ): { shouldPrompt: boolean; promptType: PromptType; promptContent?: { title: string; message: string } } {
    if (state.lastPromptShown) {
      const timeSincePrompt = Date.now() - state.lastPromptShown.getTime();
      const cooldownMs = this.getCooldownMs(config);
      if (timeSincePrompt < cooldownMs) {
        return { shouldPrompt: false, promptType: null };
      }
    }

    const thresholds = {
      firstSongThreshold: this.getSongsThreshold(config),
      tracksPlayedThreshold: this.getTracksThreshold(config),
      entriesCreatedThreshold: this.getEntriesThreshold(config),
    };

    const messages = DEFAULT_GUEST_CONVERSION_POLICY.promptMessages;

    if (eventType === 'song_created' && state.songsGenerated === thresholds.firstSongThreshold) {
      return {
        shouldPrompt: true,
        promptType: 'first-song',
        promptContent: messages['first-song'],
      };
    }

    if (eventType === 'track_played' && state.tracksPlayed === thresholds.tracksPlayedThreshold) {
      return {
        shouldPrompt: true,
        promptType: 'multiple-tracks',
        promptContent: messages['multiple-tracks'],
      };
    }

    if (eventType === 'entry_created' && state.entriesSaved === thresholds.entriesCreatedThreshold) {
      return {
        shouldPrompt: true,
        promptType: 'entries',
        promptContent: messages['entries'],
      };
    }

    return { shouldPrompt: false, promptType: null };
  }

  private getCooldownMs(config: GuestConversionPolicy | typeof DEFAULT_GUEST_CONVERSION_POLICY): number {
    if ('cooldownHours' in config) {
      return config.cooldownHours * 60 * 60 * 1000;
    }
    return DEFAULT_GUEST_CONVERSION_POLICY.promptCooldownMs;
  }

  private getSongsThreshold(config: GuestConversionPolicy | typeof DEFAULT_GUEST_CONVERSION_POLICY): number {
    if ('songsThreshold' in config) {
      return config.songsThreshold;
    }
    return DEFAULT_GUEST_CONVERSION_POLICY.firstSongThreshold;
  }

  private getTracksThreshold(config: GuestConversionPolicy | typeof DEFAULT_GUEST_CONVERSION_POLICY): number {
    if ('tracksThreshold' in config) {
      return config.tracksThreshold;
    }
    return DEFAULT_GUEST_CONVERSION_POLICY.tracksPlayedThreshold;
  }

  private getEntriesThreshold(config: GuestConversionPolicy | typeof DEFAULT_GUEST_CONVERSION_POLICY): number {
    if ('entriesCreatedThreshold' in config) {
      return config.entriesCreatedThreshold;
    }
    return DEFAULT_GUEST_CONVERSION_POLICY.entriesCreatedThreshold;
  }
}
