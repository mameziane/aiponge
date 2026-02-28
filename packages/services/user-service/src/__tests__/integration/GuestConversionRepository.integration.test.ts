/**
 * GuestConversionRepository Integration Tests
 * Tests ACTUAL repository implementation against REAL database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GuestConversionRepository } from '../../infrastructure/repositories/GuestConversionRepository';
import {
  getTestDatabase,
  closeTestDatabase,
  generateTestId,
  cleanupTestUser,
  createTestUser,
  shouldRunIntegrationTests,
  type TestDatabaseConnection,
} from './test-helpers';
import { Result } from '@aiponge/shared-contracts';
import { eq } from 'drizzle-orm';
import { usrGuestConversionState } from '../../infrastructure/database/schemas/subscription-schema';

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('GuestConversionRepository Integration', () => {
  let db: TestDatabaseConnection;
  let repo: GuestConversionRepository;
  let testUserIds: string[] = [];

  beforeAll(async () => {
    db = getTestDatabase();
    repo = new GuestConversionRepository(db as unknown as ConstructorParameters<typeof repo.constructor>[0]);
  });

  afterAll(async () => {
    for (const userId of testUserIds) {
      try {
        await db.delete(usrGuestConversionState).where(eq(usrGuestConversionState.userId, userId));
      } catch {
        /* cleanup - row may not exist */
      }
      await cleanupTestUser(db, userId);
    }
    await closeTestDatabase();
  });

  beforeEach(() => {
    testUserIds = [];
  });

  describe('getActivePolicy', () => {
    it('should return Result.ok with policy data when active policy exists', async () => {
      const result = await repo.getActivePolicy();

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        if (result.data) {
          expect(result.data.policyName).toBeDefined();
          expect(result.data.isActive).toBe(true);
          expect(result.data.songsThreshold).toBeGreaterThanOrEqual(0);
          expect(result.data.tracksThreshold).toBeGreaterThanOrEqual(0);
          expect(result.data.entriesCreatedThreshold).toBeGreaterThanOrEqual(0);
          expect(result.data.cooldownHours).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('getGuestState', () => {
    it('should return Result.ok with null for non-existent user', async () => {
      const nonexistentUserId = crypto.randomUUID();
      const result = await repo.getGuestState(nonexistentUserId);

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        expect(result.data).toBeNull();
      }
    });

    it('should return Result.ok with state after creation', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      await repo.createGuestState(user.id);
      const result = await repo.getGuestState(user.id);

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        expect(result.data).not.toBeNull();
        expect(result.data!.userId).toBe(user.id);
        expect(result.data!.songsGenerated).toBe(0);
        expect(result.data!.tracksPlayed).toBe(0);
        expect(result.data!.entriesSaved).toBe(0);
      }
    });
  });

  describe('createGuestState', () => {
    it('should create guest state with zero counters', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      const state = await repo.createGuestState(user.id);

      expect(state.userId).toBe(user.id);
      expect(state.songsGenerated).toBe(0);
      expect(state.tracksPlayed).toBe(0);
      expect(state.entriesSaved).toBe(0);
      expect(state.promptCount).toBe(0);
      expect(state.converted).toBe(false);
    });
  });

  describe('trackEvent', () => {
    it('should track song_created event and increment counter', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      const result = await repo.trackEvent(user.id, 'song_created');

      expect(result.stats.songsCreated).toBe(1);
      expect(result.stats.tracksPlayed).toBe(0);
      expect(result.stats.entriesCreated).toBe(0);
    });

    it('should track track_played event and increment counter', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      await repo.trackEvent(user.id, 'track_played');
      await repo.trackEvent(user.id, 'track_played');
      const result = await repo.trackEvent(user.id, 'track_played');

      expect(result.stats.tracksPlayed).toBe(3);
    });

    it('should track entry_created event and increment counter', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      const result = await repo.trackEvent(user.id, 'entry_created');

      expect(result.stats.entriesCreated).toBe(1);
    });

    it('should create state automatically if not exists', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      const stateBeforeResult = await repo.getGuestState(user.id);
      expect(Result.isOk(stateBeforeResult)).toBe(true);
      if (Result.isOk(stateBeforeResult)) {
        expect(stateBeforeResult.data).toBeNull();
      }

      await repo.trackEvent(user.id, 'song_created');

      const stateAfterResult = await repo.getGuestState(user.id);
      expect(Result.isOk(stateAfterResult)).toBe(true);
      if (Result.isOk(stateAfterResult)) {
        expect(stateAfterResult.data).not.toBeNull();
      }
    });

    it('should trigger prompt at first song threshold', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      const result = await repo.trackEvent(user.id, 'song_created');

      expect(result.shouldPrompt).toBe(true);
      expect(result.promptType).toBe('first-song');
      expect(result.promptContent).toBeDefined();
    });
  });

  describe('markConverted', () => {
    it('should mark user as converted', async () => {
      const user = await createTestUser(db, {
        id: generateTestId('guest'),
        isGuest: true,
      });
      testUserIds.push(user.id);

      await repo.createGuestState(user.id);
      await repo.markConverted(user.id);

      const stateResult = await repo.getGuestState(user.id);
      expect(Result.isOk(stateResult)).toBe(true);
      if (Result.isOk(stateResult)) {
        expect(stateResult.data!.converted).toBe(true);
        expect(stateResult.data!.convertedAt).not.toBeNull();
      }
    });
  });
});
