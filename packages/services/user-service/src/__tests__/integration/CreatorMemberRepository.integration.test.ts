/**
 * CreatorMemberRepository Integration Tests
 * Tests ACTUAL repository implementation against REAL database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CreatorMemberRepository } from '../../infrastructure/repositories/CreatorMemberRepository';
import {
  getTestDatabase,
  closeTestDatabase,
  generateTestId,
  cleanupTestUser,
  createTestUser,
  shouldRunIntegrationTests,
  type TestDatabaseConnection,
} from './test-helpers';
import { USER_ROLES } from '@aiponge/shared-contracts';

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('CreatorMemberRepository Integration', () => {
  let db: TestDatabaseConnection;
  let repo: CreatorMemberRepository;
  let testUserIds: string[] = [];

  beforeAll(async () => {
    db = getTestDatabase();
    repo = new CreatorMemberRepository(db as unknown as ConstructorParameters<typeof repo.constructor>[0]);
  });

  afterAll(async () => {
    for (const userId of testUserIds) {
      await cleanupTestUser(db, userId);
    }
    await closeTestDatabase();
  });

  beforeEach(() => {
    testUserIds = [];
  });

  describe('createRelationship', () => {
    it('should create a new creator-member relationship', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);

      const relationship = await repo.createRelationship(creator.id, member.id);

      expect(relationship).toBeDefined();
      expect(relationship.creatorId).toBe(creator.id);
      expect(relationship.memberId).toBe(member.id);
      expect(relationship.status).toBe('active');
    });

    it('should return existing relationship on duplicate (idempotent)', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);

      const first = await repo.createRelationship(creator.id, member.id);
      const second = await repo.createRelationship(creator.id, member.id);

      expect(first.id).toBe(second.id);
      expect(first.creatorId).toBe(second.creatorId);
    });
  });

  describe('createSelfRelationship', () => {
    it('should create a self-following relationship', async () => {
      const user = await createTestUser(db, { id: generateTestId('selffollow') });
      testUserIds.push(user.id);

      const relationship = await repo.createSelfRelationship(user.id);

      expect(relationship.creatorId).toBe(user.id);
      expect(relationship.memberId).toBe(user.id);
      expect(relationship.status).toBe('active');
    });
  });

  describe('findRelationship', () => {
    it('should find an existing relationship', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);

      await repo.createRelationship(creator.id, member.id);
      const found = await repo.findRelationship(creator.id, member.id);

      expect(found).not.toBeNull();
      expect(found!.creatorId).toBe(creator.id);
      expect(found!.memberId).toBe(member.id);
    });

    it('should return null for non-existent relationship', async () => {
      const randomUuid1 = crypto.randomUUID();
      const randomUuid2 = crypto.randomUUID();
      const found = await repo.findRelationship(randomUuid1, randomUuid2);
      expect(found).toBeNull();
    });
  });

  describe('getFollowedCreators', () => {
    it('should return all creators followed by a member', async () => {
      const creator1 = await createTestUser(db, { id: generateTestId('creator1') });
      const creator2 = await createTestUser(db, { id: generateTestId('creator2') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator1.id, creator2.id, member.id);

      await repo.createRelationship(creator1.id, member.id);
      await repo.createRelationship(creator2.id, member.id);

      const followed = await repo.getFollowedCreators(member.id);

      expect(followed.length).toBe(2);
      const creatorIds = followed.map(f => f.creatorId);
      expect(creatorIds).toContain(creator1.id);
      expect(creatorIds).toContain(creator2.id);
    });

    it('should return empty array if member follows no one', async () => {
      const member = await createTestUser(db, { id: generateTestId('loner') });
      testUserIds.push(member.id);

      const followed = await repo.getFollowedCreators(member.id);
      expect(followed).toEqual([]);
    });
  });

  describe('revokeRelationship', () => {
    it('should revoke an existing relationship', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);

      await repo.createRelationship(creator.id, member.id);
      await repo.revokeRelationship(creator.id, member.id);

      const relationship = await repo.findRelationship(creator.id, member.id);
      expect(relationship!.status).toBe('revoked');
    });
  });

  describe('getAccessibleCreatorIds', () => {
    it('should return all accessible creator IDs for a member', async () => {
      const creator1 = await createTestUser(db, { id: generateTestId('creator1') });
      const creator2 = await createTestUser(db, { id: generateTestId('creator2') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator1.id, creator2.id, member.id);

      await repo.createRelationship(creator1.id, member.id);
      await repo.createRelationship(creator2.id, member.id);

      const accessibleIds = await repo.getAccessibleCreatorIds(member.id);

      expect(accessibleIds.length).toBe(2);
      expect(accessibleIds).toContain(creator1.id);
      expect(accessibleIds).toContain(creator2.id);
    });

    it('should NOT include revoked relationships', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);

      await repo.createRelationship(creator.id, member.id);
      await repo.revokeRelationship(creator.id, member.id);

      const accessibleIds = await repo.getAccessibleCreatorIds(member.id);
      expect(accessibleIds).not.toContain(creator.id);
    });
  });

  describe('Invitation flow', () => {
    it('should create and find invitation by token', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(creator.id);
      const token = generateTestId('token');

      const invitation = await repo.createInvitation(creator.id, token);

      expect(invitation).toBeDefined();
      expect(invitation.creatorId).toBe(creator.id);
      expect(invitation.token).toBe(token);
      expect(invitation.useCount).toBe(0);

      const found = await repo.findInvitationByToken(token);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(invitation.id);
    });

    it('should increment invitation use count', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(creator.id);
      const token = generateTestId('token');

      const invitation = await repo.createInvitation(creator.id, token);
      expect(invitation.useCount).toBe(0);

      await repo.incrementInvitationUseCount(invitation.id);

      const updated = await repo.findInvitationByToken(token);
      expect(updated!.useCount).toBe(1);
    });

    it('should delete invitation', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(creator.id);
      const token = generateTestId('token');

      const invitation = await repo.createInvitation(creator.id, token);
      await repo.deleteInvitation(invitation.id);

      const found = await repo.findInvitationByToken(token);
      expect(found).toBeNull();
    });
  });

  describe('acceptInvitationAtomically', () => {
    it('should atomically accept invitation and create relationship', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);
      const token = generateTestId('token');

      await repo.createInvitation(creator.id, token);
      const result = await repo.acceptInvitationAtomically(token, member.id);

      expect(result.success).toBe(true);
      expect(result.relationship).toBeDefined();
      expect(result.relationship!.creatorId).toBe(creator.id);
      expect(result.relationship!.memberId).toBe(member.id);

      const invitation = await repo.findInvitationByToken(token);
      expect(invitation!.useCount).toBe(1);
    });

    it('should fail with NOT_FOUND for invalid token', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(member.id);

      const result = await repo.acceptInvitationAtomically('invalid_token', member.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_FOUND');
    });

    it('should fail with ALREADY_FOLLOWING if relationship exists', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);
      const token = generateTestId('token');

      await repo.createRelationship(creator.id, member.id);
      await repo.createInvitation(creator.id, token);

      const result = await repo.acceptInvitationAtomically(token, member.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('ALREADY_FOLLOWING');
    });

    it('should fail with MAX_USES_REACHED when limit exceeded', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member1 = await createTestUser(db, { id: generateTestId('member1') });
      const member2 = await createTestUser(db, { id: generateTestId('member2') });
      testUserIds.push(creator.id, member1.id, member2.id);
      const token = generateTestId('token');

      await repo.createInvitation(creator.id, token, { maxUses: 1 });
      
      const result1 = await repo.acceptInvitationAtomically(token, member1.id);
      expect(result1.success).toBe(true);

      const result2 = await repo.acceptInvitationAtomically(token, member2.id);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('MAX_USES_REACHED');
    });

    it('should fail with EXPIRED for expired invitation', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(creator.id, member.id);
      const token = generateTestId('token');

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await repo.createInvitation(creator.id, token, { expiresAt: pastDate });

      const result = await repo.acceptInvitationAtomically(token, member.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('EXPIRED');
    });
  });

  describe('autoFollowAllLibrarians', () => {
    it('should auto-follow all librarians for a new member', async () => {
      const librarian = await createTestUser(db, { 
        id: generateTestId('librarian'),
        role: USER_ROLES.LIBRARIAN,
      });
      const member = await createTestUser(db, { id: generateTestId('member') });
      testUserIds.push(librarian.id, member.id);

      const count = await repo.autoFollowAllLibrarians(member.id);
      
      expect(count).toBeGreaterThanOrEqual(1);
      
      const relationship = await repo.findRelationship(librarian.id, member.id);
      expect(relationship).not.toBeNull();
    });
  });
});
