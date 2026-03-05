/**
 * Guest Conversion Repository Implementation
 * Handles guest user tracking and conversion prompt logic
 */

import { eq } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  usrGuestConversionState,
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
  getActivePolicy(): Promise<Result<typeof DEFAULT_GUEST_CONVERSION_POLICY>>;
  getGuestState(userId: string): Promise<Result<GuestConversionState | null>>;
  createGuestState(userId: string): Promise<GuestConversionState>;
  trackEvent(userId: string, eventType: GuestEventType): Promise<TrackEventResult>;
  markConverted(userId: string): Promise<void>;
}

export class GuestConversionRepository implements IGuestConversionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getActivePolicy(): Promise<Result<typeof DEFAULT_GUEST_CONVERSION_POLICY>> {
    return Result.ok(DEFAULT_GUEST_CONVERSION_POLICY);
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
    const config = DEFAULT_GUEST_CONVERSION_POLICY;

    // Transaction wraps: read state → create-if-needed → increment → prompt update
    // Prevents lost increments and double prompt triggers under concurrent events
    return await this.db.transaction(async tx => {
      // Step 1: Get or create guest state atomically
      let [state] = await tx.select().from(usrGuestConversionState).where(eq(usrGuestConversionState.userId, userId));

      if (!state) {
        const [created] = await tx
          .insert(usrGuestConversionState)
          .values({
            userId,
            songsGenerated: 0,
            tracksPlayed: 0,
            entriesSaved: 0,
            promptCount: 0,
          })
          .onConflictDoNothing()
          .returning();

        if (created) {
          state = created;
          logger.info('Guest conversion state created (in transaction)', { userId });
        } else {
          // Concurrent insert won the race — re-read within same transaction
          [state] = await tx.select().from(usrGuestConversionState).where(eq(usrGuestConversionState.userId, userId));
        }
      }

      if (!state) {
        throw AuthError.internalError('Failed to get or create guest conversion state');
      }

      // Step 2: Increment the relevant counter
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

      const [updatedState] = await tx
        .update(usrGuestConversionState)
        .set(updateData)
        .where(eq(usrGuestConversionState.userId, userId))
        .returning();

      // Step 3: Evaluate and apply prompt trigger within same transaction
      const promptDecision = this.evaluatePromptTrigger(updatedState, config, eventType);

      if (promptDecision.shouldPrompt) {
        await tx
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
    });
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
    config: typeof DEFAULT_GUEST_CONVERSION_POLICY,
    eventType: GuestEventType
  ): { shouldPrompt: boolean; promptType: PromptType; promptContent?: { title: string; message: string } } {
    if (state.lastPromptShown) {
      const timeSincePrompt = Date.now() - state.lastPromptShown.getTime();
      if (timeSincePrompt < config.promptCooldownMs) {
        return { shouldPrompt: false, promptType: null };
      }
    }

    const messages = config.promptMessages;

    if (eventType === 'song_created' && state.songsGenerated === config.firstSongThreshold) {
      return {
        shouldPrompt: true,
        promptType: 'first-song',
        promptContent: messages['first-song'],
      };
    }

    if (eventType === 'track_played' && state.tracksPlayed === config.tracksPlayedThreshold) {
      return {
        shouldPrompt: true,
        promptType: 'multiple-tracks',
        promptContent: messages['multiple-tracks'],
      };
    }

    if (eventType === 'entry_created' && state.entriesSaved === config.entriesCreatedThreshold) {
      return {
        shouldPrompt: true,
        promptType: 'entries',
        promptContent: messages['entries'],
      };
    }

    return { shouldPrompt: false, promptType: null };
  }
}
