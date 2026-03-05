import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { GuestConversionRepository } from '../../infrastructure/repositories/GuestConversionRepository';
import { Result } from '@aiponge/shared-contracts';
import { DEFAULT_GUEST_CONVERSION_POLICY } from '../../infrastructure/database/schemas/subscription-schema';

const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function createMockState(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: TEST_USER_ID,
    songsGenerated: 0,
    tracksPlayed: 0,
    entriesSaved: 0,
    lastPromptShown: null,
    promptCount: 0,
    converted: false,
    convertedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function createSelectChainNoLimit(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(resolvedValue),
    }),
  };
}

function createInsertChain(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnValue),
    }),
  };
}

function createInsertChainWithConflict(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returnValue),
      }),
    }),
  };
}

function createUpdateChain(returnValue?: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: returnValue ? vi.fn().mockResolvedValue(returnValue) : vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

function createMockDb() {
  const db = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    // trackEvent uses this.db.transaction(async tx => {...})
    // The tx object receives the same mock methods
    transaction: vi.fn(),
  } as unknown as Record<string, unknown>;
  return db;
}

describe('GuestConversionRepository', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let repo: GuestConversionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repo = new GuestConversionRepository(mockDb);
  });

  describe('getActivePolicy', () => {
    it('should return Result.ok with the code-based policy constant', async () => {
      const result = await repo.getActivePolicy();

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        expect(result.data).toBe(DEFAULT_GUEST_CONVERSION_POLICY);
        expect(result.data!.firstSongThreshold).toBe(1);
        expect(result.data!.tracksPlayedThreshold).toBe(5);
        expect(result.data!.entriesCreatedThreshold).toBe(3);
        expect(result.data!.promptCooldownMs).toBeGreaterThan(0);
        expect(result.data!.promptMessages).toBeDefined();
      }
    });
  });

  describe('getGuestState', () => {
    it('should return Result.ok with null for non-existent user', async () => {
      (mockDb as Record<string, ReturnType<typeof vi.fn>>).select.mockReturnValue(createSelectChainNoLimit([]));

      const result = await repo.getGuestState('non-existent-id');

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        expect(result.data).toBeNull();
      }
    });

    it('should return Result.ok with state after creation', async () => {
      const mockState = createMockState();
      (mockDb as Record<string, ReturnType<typeof vi.fn>>).select.mockReturnValue(
        createSelectChainNoLimit([mockState])
      );

      const result = await repo.getGuestState(TEST_USER_ID);

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        expect(result.data).not.toBeNull();
        expect(result.data!.userId).toBe(TEST_USER_ID);
        expect(result.data!.songsGenerated).toBe(0);
        expect(result.data!.tracksPlayed).toBe(0);
        expect(result.data!.entriesSaved).toBe(0);
      }
    });
  });

  describe('createGuestState', () => {
    it('should create guest state with zero counters', async () => {
      const mockState = createMockState();
      const insertChain = createInsertChain([mockState]);
      (mockDb as Record<string, ReturnType<typeof vi.fn>>).insert.mockReturnValue(insertChain);

      const state = await repo.createGuestState(TEST_USER_ID);

      expect(state.userId).toBe(TEST_USER_ID);
      expect(state.songsGenerated).toBe(0);
      expect(state.tracksPlayed).toBe(0);
      expect(state.entriesSaved).toBe(0);
      expect(state.promptCount).toBe(0);
      expect(state.converted).toBe(false);
      const valuesArg = insertChain.values.mock.calls[0][0];
      expect(valuesArg.userId).toBe(TEST_USER_ID);
      expect(valuesArg.songsGenerated).toBe(0);
      expect(valuesArg.tracksPlayed).toBe(0);
      expect(valuesArg.entriesSaved).toBe(0);
      expect(valuesArg.promptCount).toBe(0);
    });
  });

  describe('trackEvent', () => {
    /**
     * trackEvent uses this.db.transaction(async tx => { ... }).
     * We mock transaction to execute the callback with a tx object
     * that has the same select/insert/update mocks.
     */
    function setupTransactionMock(txSetup: (tx: Record<string, ReturnType<typeof vi.fn>>) => void) {
      const tx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };
      txSetup(tx);
      (mockDb as Record<string, ReturnType<typeof vi.fn>>).transaction.mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)
      );
      return tx;
    }

    it('should track song_created event and increment counter', async () => {
      const existingState = createMockState();
      const updatedState = createMockState({ songsGenerated: 1 });

      setupTransactionMock(tx => {
        tx.select.mockReturnValueOnce(createSelectChainNoLimit([existingState]));
        tx.update.mockReturnValueOnce(createUpdateChain([updatedState]));
        tx.update.mockReturnValueOnce(createUpdateChain()); // prompt update
      });

      const result = await repo.trackEvent(TEST_USER_ID, 'song_created');

      expect(result.stats.songsCreated).toBe(1);
      expect(result.stats.tracksPlayed).toBe(0);
      expect(result.stats.entriesCreated).toBe(0);
    });

    it('should track track_played event and increment counter', async () => {
      const existingState = createMockState({ tracksPlayed: 2 });
      const updatedState = createMockState({ tracksPlayed: 3 });

      setupTransactionMock(tx => {
        tx.select.mockReturnValueOnce(createSelectChainNoLimit([existingState]));
        tx.update.mockReturnValueOnce(createUpdateChain([updatedState]));
      });

      const result = await repo.trackEvent(TEST_USER_ID, 'track_played');

      expect(result.stats.tracksPlayed).toBe(3);
    });

    it('should track entry_created event and increment counter', async () => {
      const existingState = createMockState();
      const updatedState = createMockState({ entriesSaved: 1 });

      setupTransactionMock(tx => {
        tx.select.mockReturnValueOnce(createSelectChainNoLimit([existingState]));
        tx.update.mockReturnValueOnce(createUpdateChain([updatedState]));
      });

      const result = await repo.trackEvent(TEST_USER_ID, 'entry_created');

      expect(result.stats.entriesCreated).toBe(1);
    });

    it('should create state automatically if not exists', async () => {
      const createdState = createMockState();
      const updatedState = createMockState({ songsGenerated: 1 });

      const insertChain = createInsertChainWithConflict([createdState]);

      setupTransactionMock(tx => {
        tx.select.mockReturnValueOnce(createSelectChainNoLimit([])); // state not found
        tx.insert.mockReturnValue(insertChain);
        tx.update.mockReturnValueOnce(createUpdateChain([updatedState]));
        tx.update.mockReturnValueOnce(createUpdateChain()); // prompt update
      });

      const result = await repo.trackEvent(TEST_USER_ID, 'song_created');

      const valuesArg = insertChain.values.mock.calls[0][0];
      expect(valuesArg.userId).toBe(TEST_USER_ID);
      expect(valuesArg.songsGenerated).toBe(0);
      expect(result.stats.songsCreated).toBe(1);
    });

    it('should trigger prompt at first song threshold', async () => {
      const existingState = createMockState();
      const updatedState = createMockState({ songsGenerated: 1 });

      setupTransactionMock(tx => {
        tx.select.mockReturnValueOnce(createSelectChainNoLimit([existingState]));
        tx.update.mockReturnValueOnce(createUpdateChain([updatedState]));
        tx.update.mockReturnValueOnce(createUpdateChain()); // prompt update
      });

      const result = await repo.trackEvent(TEST_USER_ID, 'song_created');

      expect(result.shouldPrompt).toBe(true);
      expect(result.promptType).toBe('first-song');
      expect(result.promptContent).toBeDefined();
      expect(result.promptContent!.title).toBe(DEFAULT_GUEST_CONVERSION_POLICY.promptMessages['first-song'].title);
      expect(result.promptContent!.message).toBe(DEFAULT_GUEST_CONVERSION_POLICY.promptMessages['first-song'].message);
    });
  });

  describe('markConverted', () => {
    it('should mark user as converted', async () => {
      const updateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      (mockDb as Record<string, ReturnType<typeof vi.fn>>).update.mockReturnValue(updateChain);

      await repo.markConverted(TEST_USER_ID);

      expect((mockDb as Record<string, ReturnType<typeof vi.fn>>).update).toHaveBeenCalledTimes(1);
      const setCall = updateChain.set.mock.calls[0][0];
      expect(setCall.converted).toBe(true);
      expect(setCall.convertedAt).toBeInstanceOf(Date);
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });
  });
});
