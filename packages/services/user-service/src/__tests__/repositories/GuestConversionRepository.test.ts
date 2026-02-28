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

function createMockPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    policyName: 'default',
    isActive: true,
    songsThreshold: 1,
    tracksThreshold: 5,
    entriesCreatedThreshold: 3,
    cooldownHours: 24,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function createSelectChain(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(resolvedValue),
      }),
    }),
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
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Record<string, unknown>;
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
    it('should return Result.ok with policy data when active policy exists', async () => {
      const mockPolicy = createMockPolicy();
      mockDb.select.mockReturnValue(createSelectChain([mockPolicy]));

      const result = await repo.getActivePolicy();

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        expect(result.data).not.toBeNull();
        expect(result.data!.policyName).toBe('default');
        expect(result.data!.isActive).toBe(true);
        expect(result.data!.songsThreshold).toBeGreaterThanOrEqual(0);
        expect(result.data!.tracksThreshold).toBeGreaterThanOrEqual(0);
        expect(result.data!.entriesCreatedThreshold).toBeGreaterThanOrEqual(0);
        expect(result.data!.cooldownHours).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getGuestState', () => {
    it('should return Result.ok with null for non-existent user', async () => {
      mockDb.select.mockReturnValue(createSelectChainNoLimit([]));

      const result = await repo.getGuestState('non-existent-id');

      expect(Result.isOk(result)).toBe(true);
      if (Result.isOk(result)) {
        expect(result.data).toBeNull();
      }
    });

    it('should return Result.ok with state after creation', async () => {
      const mockState = createMockState();
      mockDb.select.mockReturnValue(createSelectChainNoLimit([mockState]));

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
      mockDb.insert.mockReturnValue(insertChain);

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
    it('should track song_created event and increment counter', async () => {
      const existingState = createMockState();
      const updatedState = createMockState({ songsGenerated: 1 });

      mockDb.select
        .mockReturnValueOnce(createSelectChainNoLimit([existingState]))
        .mockReturnValueOnce(createSelectChain([]));

      mockDb.update.mockReturnValueOnce(createUpdateChain([updatedState]));
      mockDb.update.mockReturnValueOnce(createUpdateChain());

      const result = await repo.trackEvent(TEST_USER_ID, 'song_created');

      expect(result.stats.songsCreated).toBe(1);
      expect(result.stats.tracksPlayed).toBe(0);
      expect(result.stats.entriesCreated).toBe(0);
    });

    it('should track track_played event and increment counter', async () => {
      const existingState = createMockState({ tracksPlayed: 2 });
      const updatedState = createMockState({ tracksPlayed: 3 });

      mockDb.select
        .mockReturnValueOnce(createSelectChainNoLimit([existingState]))
        .mockReturnValueOnce(createSelectChain([]));

      mockDb.update.mockReturnValueOnce(createUpdateChain([updatedState]));

      const result = await repo.trackEvent(TEST_USER_ID, 'track_played');

      expect(result.stats.tracksPlayed).toBe(3);
    });

    it('should track entry_created event and increment counter', async () => {
      const existingState = createMockState();
      const updatedState = createMockState({ entriesSaved: 1 });

      mockDb.select
        .mockReturnValueOnce(createSelectChainNoLimit([existingState]))
        .mockReturnValueOnce(createSelectChain([]));

      mockDb.update.mockReturnValueOnce(createUpdateChain([updatedState]));

      const result = await repo.trackEvent(TEST_USER_ID, 'entry_created');

      expect(result.stats.entriesCreated).toBe(1);
    });

    it('should create state automatically if not exists', async () => {
      const createdState = createMockState();
      const updatedState = createMockState({ songsGenerated: 1 });

      mockDb.select.mockReturnValueOnce(createSelectChainNoLimit([])).mockReturnValueOnce(createSelectChain([]));

      const insertChain = createInsertChain([createdState]);
      mockDb.insert.mockReturnValue(insertChain);
      mockDb.update.mockReturnValueOnce(createUpdateChain([updatedState]));
      mockDb.update.mockReturnValueOnce(createUpdateChain());

      const result = await repo.trackEvent(TEST_USER_ID, 'song_created');

      const valuesArg = insertChain.values.mock.calls[0][0];
      expect(valuesArg.userId).toBe(TEST_USER_ID);
      expect(valuesArg.songsGenerated).toBe(0);
      expect(result.stats.songsCreated).toBe(1);
    });

    it('should trigger prompt at first song threshold', async () => {
      const existingState = createMockState();
      const updatedState = createMockState({ songsGenerated: 1 });

      mockDb.select
        .mockReturnValueOnce(createSelectChainNoLimit([existingState]))
        .mockReturnValueOnce(createSelectChain([]));

      mockDb.update.mockReturnValueOnce(createUpdateChain([updatedState]));
      mockDb.update.mockReturnValueOnce(createUpdateChain());

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
      mockDb.update.mockReturnValue(updateChain);

      await repo.markConverted(TEST_USER_ID);

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const setCall = updateChain.set.mock.calls[0][0];
      expect(setCall.converted).toBe(true);
      expect(setCall.convertedAt).toBeInstanceOf(Date);
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });
  });
});
