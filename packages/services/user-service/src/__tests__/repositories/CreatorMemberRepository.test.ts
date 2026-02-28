import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  serializeError: vi.fn((err: unknown) => err),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

import { CreatorMemberRepository } from '../../infrastructure/repositories/CreatorMemberRepository';

const TEST_CREATOR_ID = '11111111-1111-1111-1111-111111111111';
const TEST_MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const TEST_MEMBER_ID_2 = '33333333-3333-3333-3333-333333333333';
const TEST_LIBRARIAN_ID = '44444444-4444-4444-4444-444444444444';
const TEST_INVITATION_ID = '55555555-5555-5555-5555-555555555555';
const TEST_TOKEN = 'test-invitation-token-abc123';

function createMockRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel-id-1',
    creatorId: TEST_CREATOR_ID,
    memberId: TEST_MEMBER_ID,
    status: 'active',
    createdAt: new Date('2025-01-01'),
    acceptedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function createMockInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_INVITATION_ID,
    creatorId: TEST_CREATOR_ID,
    token: TEST_TOKEN,
    useCount: 0,
    maxUses: null,
    expiresAt: null,
    email: null,
    createdAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function createInsertChain(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returnValue),
      }),
      returning: vi.fn().mockResolvedValue(returnValue),
    }),
  };
}

function createSelectChainWhereLimit(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(resolvedValue),
      }),
    }),
  };
}

function createSelectChainWhere(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(resolvedValue),
    }),
  };
}

function createSelectFieldsChainWhereLimit(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(resolvedValue),
      }),
    }),
  };
}

function createSelectFieldsChainWhere(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(resolvedValue),
    }),
  };
}

function createUpdateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function createDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDb() {
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  } as unknown as Record<string, unknown>;
}

function createMockTx() {
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Record<string, unknown>;
}

describe('CreatorMemberRepository', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let repo: CreatorMemberRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repo = new CreatorMemberRepository(mockDb);
  });

  describe('createRelationship', () => {
    it('should create a new creator-member relationship', async () => {
      const mockRel = createMockRelationship();
      const insertChain = createInsertChain([mockRel]);
      mockDb.insert.mockReturnValue(insertChain);

      const result = await repo.createRelationship(TEST_CREATOR_ID, TEST_MEMBER_ID);

      expect(result).toBeDefined();
      expect(result.creatorId).toBe(TEST_CREATOR_ID);
      expect(result.memberId).toBe(TEST_MEMBER_ID);
      expect(result.status).toBe('active');
      const valuesArg = insertChain.values.mock.calls[0][0];
      expect(valuesArg.creatorId).toBe(TEST_CREATOR_ID);
      expect(valuesArg.memberId).toBe(TEST_MEMBER_ID);
    });

    it('should return existing relationship on duplicate (idempotent)', async () => {
      const existingRel = createMockRelationship({ id: 'existing-rel-id' });
      mockDb.insert.mockReturnValue(createInsertChain([]));
      mockDb.select.mockReturnValue(createSelectChainWhereLimit([existingRel]));

      const result = await repo.createRelationship(TEST_CREATOR_ID, TEST_MEMBER_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe('existing-rel-id');
      expect(result.creatorId).toBe(TEST_CREATOR_ID);
      expect(result.memberId).toBe(TEST_MEMBER_ID);
    });
  });

  describe('createSelfRelationship', () => {
    it('should create a self-following relationship', async () => {
      const selfRel = createMockRelationship({
        creatorId: TEST_MEMBER_ID,
        memberId: TEST_MEMBER_ID,
      });
      mockDb.insert.mockReturnValue(createInsertChain([selfRel]));

      const result = await repo.createSelfRelationship(TEST_MEMBER_ID);

      expect(result.creatorId).toBe(TEST_MEMBER_ID);
      expect(result.memberId).toBe(TEST_MEMBER_ID);
      expect(result.status).toBe('active');
    });
  });

  describe('findRelationship', () => {
    it('should find an existing relationship', async () => {
      const mockRel = createMockRelationship();
      mockDb.select.mockReturnValue(createSelectChainWhereLimit([mockRel]));

      const found = await repo.findRelationship(TEST_CREATOR_ID, TEST_MEMBER_ID);

      expect(found).not.toBeNull();
      expect(found!.creatorId).toBe(TEST_CREATOR_ID);
      expect(found!.memberId).toBe(TEST_MEMBER_ID);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('should return null for non-existent relationship', async () => {
      mockDb.select.mockReturnValue(createSelectChainWhereLimit([]));

      const found = await repo.findRelationship('random-id-1', 'random-id-2');

      expect(found).toBeNull();
    });
  });

  describe('getFollowedCreators', () => {
    it('should return all creators followed by a member', async () => {
      const rel1 = createMockRelationship({ id: 'rel-1', creatorId: 'creator-1' });
      const rel2 = createMockRelationship({ id: 'rel-2', creatorId: 'creator-2' });
      mockDb.select.mockReturnValue(createSelectChainWhere([rel1, rel2]));

      const followed = await repo.getFollowedCreators(TEST_MEMBER_ID);

      expect(followed.length).toBe(2);
      const creatorIds = followed.map(f => f.creatorId);
      expect(creatorIds).toContain('creator-1');
      expect(creatorIds).toContain('creator-2');
    });

    it('should return empty array if member follows no one', async () => {
      mockDb.select.mockReturnValue(createSelectChainWhere([]));

      const followed = await repo.getFollowedCreators(TEST_MEMBER_ID);

      expect(followed).toEqual([]);
    });
  });

  describe('revokeRelationship', () => {
    it('should revoke an existing relationship', async () => {
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      await repo.revokeRelationship(TEST_CREATOR_ID, TEST_MEMBER_ID);

      const setArg = updateChain.set.mock.calls[0][0];
      expect(setArg).toHaveProperty('status');
    });
  });

  describe('getAccessibleCreatorIds', () => {
    it('should return all accessible creator IDs for a member', async () => {
      const rel1 = { creatorId: 'creator-1' };
      const rel2 = { creatorId: 'creator-2' };
      mockDb.select.mockReturnValue(createSelectFieldsChainWhere([rel1, rel2]));

      const accessibleIds = await repo.getAccessibleCreatorIds(TEST_MEMBER_ID);

      expect(accessibleIds.length).toBe(2);
      expect(accessibleIds).toContain('creator-1');
      expect(accessibleIds).toContain('creator-2');
    });

    it('should NOT include revoked relationships', async () => {
      mockDb.select.mockReturnValue(createSelectFieldsChainWhere([]));

      const accessibleIds = await repo.getAccessibleCreatorIds(TEST_MEMBER_ID);

      expect(accessibleIds).toEqual([]);
      expect(accessibleIds).not.toContain(TEST_CREATOR_ID);
    });
  });

  describe('Invitation flow', () => {
    it('should create and find invitation by token', async () => {
      const mockInvitation = createMockInvitation();
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockInvitation]),
        }),
      });

      const invitation = await repo.createInvitation(TEST_CREATOR_ID, TEST_TOKEN);

      expect(invitation).toBeDefined();
      expect(invitation.creatorId).toBe(TEST_CREATOR_ID);
      expect(invitation.token).toBe(TEST_TOKEN);
      expect(invitation.useCount).toBe(0);

      mockDb.select.mockReturnValue(createSelectChainWhereLimit([mockInvitation]));

      const found = await repo.findInvitationByToken(TEST_TOKEN);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(invitation.id);
    });

    it('should increment invitation use count', async () => {
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      await repo.incrementInvitationUseCount(TEST_INVITATION_ID);

      const setArg = updateChain.set.mock.calls[0][0];
      expect(setArg).toHaveProperty('useCount');
    });

    it('should delete invitation', async () => {
      const deleteChain = createDeleteChain();
      mockDb.delete.mockReturnValue(deleteChain);

      await repo.deleteInvitation(TEST_INVITATION_ID);

      expect(deleteChain.where).toHaveBeenCalledWith(expect.anything());

      mockDb.select.mockReturnValue(createSelectChainWhereLimit([]));

      const found = await repo.findInvitationByToken(TEST_TOKEN);
      expect(found).toBeNull();
    });
  });

  describe('acceptInvitationAtomically', () => {
    it('should atomically accept invitation and create relationship', async () => {
      const mockInvitation = createMockInvitation();
      const mockRel = createMockRelationship();

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const mockTx = createMockTx();
        mockTx.select.mockReturnValueOnce(createSelectChainWhereLimit([mockInvitation]));
        mockTx.select.mockReturnValueOnce(createSelectChainWhereLimit([]));
        mockTx.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockRel]),
          }),
        });
        mockTx.update.mockReturnValue(createUpdateChain());
        return fn(mockTx);
      });

      const result = await repo.acceptInvitationAtomically(TEST_TOKEN, TEST_MEMBER_ID);

      expect(result.success).toBe(true);
      expect(result.relationship).toBeDefined();
      expect(result.relationship!.creatorId).toBe(TEST_CREATOR_ID);
      expect(result.relationship!.memberId).toBe(TEST_MEMBER_ID);
    });

    it('should fail with NOT_FOUND for invalid token', async () => {
      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const mockTx = createMockTx();
        mockTx.select.mockReturnValue(createSelectChainWhereLimit([]));
        return fn(mockTx);
      });

      const result = await repo.acceptInvitationAtomically('invalid_token', TEST_MEMBER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_FOUND');
    });

    it('should fail with ALREADY_FOLLOWING if relationship exists', async () => {
      const mockInvitation = createMockInvitation();
      const existingRel = createMockRelationship();

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const mockTx = createMockTx();
        mockTx.select.mockReturnValueOnce(createSelectChainWhereLimit([mockInvitation]));
        mockTx.select.mockReturnValueOnce(createSelectChainWhereLimit([existingRel]));
        return fn(mockTx);
      });

      const result = await repo.acceptInvitationAtomically(TEST_TOKEN, TEST_MEMBER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('ALREADY_FOLLOWING');
    });

    it('should fail with MAX_USES_REACHED when limit exceeded', async () => {
      const mockInvitation = createMockInvitation({ maxUses: 1, useCount: 1 });

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const mockTx = createMockTx();
        mockTx.select.mockReturnValue(createSelectChainWhereLimit([mockInvitation]));
        return fn(mockTx);
      });

      const result = await repo.acceptInvitationAtomically(TEST_TOKEN, TEST_MEMBER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('MAX_USES_REACHED');
    });

    it('should fail with EXPIRED for expired invitation', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const mockInvitation = createMockInvitation({ expiresAt: pastDate });

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const mockTx = createMockTx();
        mockTx.select.mockReturnValue(createSelectChainWhereLimit([mockInvitation]));
        return fn(mockTx);
      });

      const result = await repo.acceptInvitationAtomically(TEST_TOKEN, TEST_MEMBER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('EXPIRED');
    });
  });

  describe('autoFollowAllLibrarians', () => {
    it('should auto-follow all librarians for a new member', async () => {
      const librarians = [{ id: TEST_LIBRARIAN_ID }];
      const mockRel = createMockRelationship({
        creatorId: TEST_LIBRARIAN_ID,
        memberId: TEST_MEMBER_ID,
      });

      mockDb.select
        .mockReturnValueOnce(
          createSelectFieldsChainWhereLimit(librarians)
        );

      const insertChain = createInsertChain([mockRel]);
      mockDb.insert.mockReturnValue(insertChain);

      const count = await repo.autoFollowAllLibrarians(TEST_MEMBER_ID);

      expect(count).toBeGreaterThanOrEqual(1);
      const valuesArg = insertChain.values.mock.calls[0][0];
      expect(valuesArg[0].creatorId).toBe(TEST_LIBRARIAN_ID);
      expect(valuesArg[0].memberId).toBe(TEST_MEMBER_ID);
    });
  });
});
