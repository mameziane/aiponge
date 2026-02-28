/**
 * Creator-Member API Route Handler Integration Tests
 *
 * Tests the creator-member route handler logic with REAL database operations.
 *
 * Note: These tests create a lightweight Express app that mirrors the production
 * route handlers but uses the actual CreatorMemberRepository with real DB connections.
 * This validates:
 * - Route handler business logic
 * - Repository integration with real PostgreSQL
 * - HTTP response formats and status codes
 * - Authentication requirement enforcement
 *
 * For full end-to-end API Gateway tests, see api-gateway integration tests.
 * For pure repository tests, see CreatorMemberRepository.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
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

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('Creator-Member API Routes Integration', () => {
  let db: TestDatabaseConnection;
  let app: Express;
  let repo: CreatorMemberRepository;
  let testUserIds: string[] = [];

  beforeAll(async () => {
    db = getTestDatabase();
    repo = new CreatorMemberRepository(db as unknown as ConstructorParameters<typeof repo.constructor>[0]);

    app = express();
    app.use(express.json());

    app.get('/api/creator-members/following', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const relationships = await repo.getFollowedCreators(userId);
        const following = relationships
          .filter(r => r.creatorId !== userId)
          .map(r => ({
            creatorId: r.creatorId,
            followedAt: r.createdAt,
          }));

        res.json({ success: true, data: following });
      } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    });

    app.get('/api/creator-members/members', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const relationships = await repo.getMembers(userId);
        const members = relationships
          .filter(r => r.memberId !== userId)
          .map(r => ({
            memberId: r.memberId,
            followedAt: r.createdAt,
          }));

        res.json({ success: true, data: members });
      } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    });

    app.post('/api/creator-members/follow/:creatorId', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const creatorId = req.params.creatorId;
        const relationship = await repo.createRelationship(creatorId, userId);

        res.status(201).json({
          success: true,
          data: {
            creatorId: relationship.creatorId,
            memberId: relationship.memberId,
            followedAt: relationship.createdAt,
          },
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    });

    app.delete('/api/creator-members/following/:creatorId', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const creatorId = req.params.creatorId;

        if (creatorId === userId) {
          return res.status(400).json({ success: false, error: 'Cannot unfollow yourself' });
        }

        const existingRelationship = await repo.findRelationship(creatorId, userId);
        if (!existingRelationship) {
          return res.status(404).json({ success: false, error: 'Not following this creator' });
        }

        await repo.revokeRelationship(creatorId, userId);

        res.json({ success: true, message: 'Unfollowed successfully' });
      } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    });
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

  describe('GET /api/creator-members/following', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/creator-members/following');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Authentication required');
    });

    it('should return empty array when user follows no creators', async () => {
      const user = await createTestUser(db, { id: generateTestId('user') });
      testUserIds.push(user.id);

      const res = await request(app).get('/api/creator-members/following').set('x-user-id', user.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return list of followed creators', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      const creator1 = await createTestUser(db, { id: generateTestId('creator1') });
      const creator2 = await createTestUser(db, { id: generateTestId('creator2') });
      testUserIds.push(member.id, creator1.id, creator2.id);

      await repo.createRelationship(creator1.id, member.id);
      await repo.createRelationship(creator2.id, member.id);

      const res = await request(app).get('/api/creator-members/following').set('x-user-id', member.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);

      const creatorIds = res.body.data.map((f: Record<string, unknown>) => f.creatorId);
      expect(creatorIds).toContain(creator1.id);
      expect(creatorIds).toContain(creator2.id);
    });

    it('should exclude self-relationship from following list', async () => {
      const user = await createTestUser(db, { id: generateTestId('selfuser') });
      testUserIds.push(user.id);

      await repo.createSelfRelationship(user.id);

      const res = await request(app).get('/api/creator-members/following').set('x-user-id', user.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/creator-members/members', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/creator-members/members');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return empty array when no members follow creator', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(creator.id);

      const res = await request(app).get('/api/creator-members/members').set('x-user-id', creator.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return list of members following the creator', async () => {
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      const member1 = await createTestUser(db, { id: generateTestId('member1') });
      const member2 = await createTestUser(db, { id: generateTestId('member2') });
      testUserIds.push(creator.id, member1.id, member2.id);

      await repo.createRelationship(creator.id, member1.id);
      await repo.createRelationship(creator.id, member2.id);

      const res = await request(app).get('/api/creator-members/members').set('x-user-id', creator.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);

      const memberIds = res.body.data.map((m: Record<string, unknown>) => m.memberId);
      expect(memberIds).toContain(member1.id);
      expect(memberIds).toContain(member2.id);
    });
  });

  describe('POST /api/creator-members/follow/:creatorId', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/creator-members/follow/some-id');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should create a new follow relationship', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(member.id, creator.id);

      const res = await request(app).post(`/api/creator-members/follow/${creator.id}`).set('x-user-id', member.id);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.creatorId).toBe(creator.id);
      expect(res.body.data.memberId).toBe(member.id);

      const relationship = await repo.findRelationship(creator.id, member.id);
      expect(relationship).not.toBeNull();
    });

    it('should be idempotent - following same creator twice returns success', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(member.id, creator.id);

      const res1 = await request(app).post(`/api/creator-members/follow/${creator.id}`).set('x-user-id', member.id);

      const res2 = await request(app).post(`/api/creator-members/follow/${creator.id}`).set('x-user-id', member.id);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.data.creatorId).toBe(res2.body.data.creatorId);
    });
  });

  describe('DELETE /api/creator-members/following/:creatorId', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete('/api/creator-members/following/some-id');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when trying to unfollow self', async () => {
      const user = await createTestUser(db, { id: generateTestId('user') });
      testUserIds.push(user.id);

      const res = await request(app).delete(`/api/creator-members/following/${user.id}`).set('x-user-id', user.id);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Cannot unfollow yourself');
    });

    it('should return 404 when not following the creator', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(member.id, creator.id);

      const res = await request(app).delete(`/api/creator-members/following/${creator.id}`).set('x-user-id', member.id);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Not following this creator');
    });

    it('should successfully unfollow a creator', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(member.id, creator.id);

      await repo.createRelationship(creator.id, member.id);

      const relationshipBefore = await repo.findRelationship(creator.id, member.id);
      expect(relationshipBefore).not.toBeNull();
      expect(relationshipBefore!.status).toBe('active');

      const res = await request(app).delete(`/api/creator-members/following/${creator.id}`).set('x-user-id', member.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Unfollowed successfully');

      const relationshipAfter = await repo.findRelationship(creator.id, member.id);
      expect(relationshipAfter).not.toBeNull();
      expect(relationshipAfter!.status).toBe('revoked');
    });

    it('should allow re-following after unfollowing', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(member.id, creator.id);

      await repo.createRelationship(creator.id, member.id);

      await request(app).delete(`/api/creator-members/following/${creator.id}`).set('x-user-id', member.id);

      const res = await request(app).post(`/api/creator-members/follow/${creator.id}`).set('x-user-id', member.id);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const relationship = await repo.findRelationship(creator.id, member.id);
      expect(relationship).not.toBeNull();
    });
  });

  describe('End-to-End: Complete Follow/Unfollow Workflow', () => {
    it('should complete full follow → verify → unfollow → verify cycle', async () => {
      const member = await createTestUser(db, { id: generateTestId('member') });
      const creator = await createTestUser(db, { id: generateTestId('creator') });
      testUserIds.push(member.id, creator.id);

      const followRes = await request(app)
        .post(`/api/creator-members/follow/${creator.id}`)
        .set('x-user-id', member.id);
      expect(followRes.status).toBe(201);

      const verifyFollowingRes = await request(app).get('/api/creator-members/following').set('x-user-id', member.id);
      expect(verifyFollowingRes.body.data).toHaveLength(1);
      expect(verifyFollowingRes.body.data[0].creatorId).toBe(creator.id);

      const verifyMembersRes = await request(app).get('/api/creator-members/members').set('x-user-id', creator.id);
      expect(verifyMembersRes.body.data).toHaveLength(1);
      expect(verifyMembersRes.body.data[0].memberId).toBe(member.id);

      const unfollowRes = await request(app)
        .delete(`/api/creator-members/following/${creator.id}`)
        .set('x-user-id', member.id);
      expect(unfollowRes.status).toBe(200);

      const verifyUnfollowedRes = await request(app).get('/api/creator-members/following').set('x-user-id', member.id);
      expect(verifyUnfollowedRes.body.data).toHaveLength(0);

      const verifyNoMembersRes = await request(app).get('/api/creator-members/members').set('x-user-id', creator.id);
      expect(verifyNoMembersRes.body.data).toHaveLength(0);
    });
  });
});
