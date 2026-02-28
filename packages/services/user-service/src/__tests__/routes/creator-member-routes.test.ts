import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

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
}));

const TEST_MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const TEST_CREATOR_1_ID = '33333333-3333-3333-3333-333333333333';
const TEST_CREATOR_2_ID = '44444444-4444-4444-4444-444444444444';
const TEST_MEMBER_2_ID = '55555555-5555-5555-5555-555555555555';

function createMockRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel-id-1',
    creatorId: TEST_CREATOR_1_ID,
    memberId: TEST_MEMBER_ID,
    status: 'active',
    createdAt: new Date('2025-01-01'),
    acceptedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const mockRepo = {
  getFollowedCreators: vi.fn(),
  getMembers: vi.fn(),
  createRelationship: vi.fn(),
  createSelfRelationship: vi.fn(),
  findRelationship: vi.fn(),
  revokeRelationship: vi.fn(),
  autoFollowAllLibrarians: vi.fn(),
  addAllUsersToLibrarian: vi.fn(),
  createInvitation: vi.fn(),
  findInvitationByToken: vi.fn(),
  incrementInvitationUseCount: vi.fn(),
  getCreatorInvitations: vi.fn(),
  findInvitationById: vi.fn(),
  deleteInvitation: vi.fn(),
  getAccessibleCreatorIds: vi.fn(),
  getLibrarianIds: vi.fn(),
  backfillSelfRelationships: vi.fn(),
  backfillLibrarianRelationships: vi.fn(),
  acceptInvitationAtomically: vi.fn(),
};

describe('Creator-Member API Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.get('/api/creator-members/following', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const relationships = await mockRepo.getFollowedCreators(userId);
        const following = relationships
          .filter((r: Record<string, unknown>) => r.creatorId !== userId)
          .map((r: Record<string, unknown>) => ({
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

        const relationships = await mockRepo.getMembers(userId);
        const members = relationships
          .filter((r: Record<string, unknown>) => r.memberId !== userId)
          .map((r: Record<string, unknown>) => ({
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
        const relationship = await mockRepo.createRelationship(creatorId, userId);

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

        const existingRelationship = await mockRepo.findRelationship(creatorId, userId);
        if (!existingRelationship) {
          return res.status(404).json({ success: false, error: 'Not following this creator' });
        }

        await mockRepo.revokeRelationship(creatorId, userId);

        res.json({ success: true, message: 'Unfollowed successfully' });
      } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/creator-members/following', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/creator-members/following');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Authentication required');
    });

    it('should return empty array when user follows no creators', async () => {
      mockRepo.getFollowedCreators.mockResolvedValue([]);

      const res = await request(app).get('/api/creator-members/following').set('x-user-id', TEST_MEMBER_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(mockRepo.getFollowedCreators).toHaveBeenCalledWith(TEST_MEMBER_ID);
    });

    it('should return list of followed creators', async () => {
      const relationships = [
        createMockRelationship({ creatorId: TEST_CREATOR_1_ID, memberId: TEST_MEMBER_ID }),
        createMockRelationship({ id: 'rel-id-2', creatorId: TEST_CREATOR_2_ID, memberId: TEST_MEMBER_ID }),
      ];
      mockRepo.getFollowedCreators.mockResolvedValue(relationships);

      const res = await request(app).get('/api/creator-members/following').set('x-user-id', TEST_MEMBER_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);

      const creatorIds = res.body.data.map((f: Record<string, unknown>) => f.creatorId);
      expect(creatorIds).toContain(TEST_CREATOR_1_ID);
      expect(creatorIds).toContain(TEST_CREATOR_2_ID);
    });

    it('should exclude self-relationship from following list', async () => {
      const selfRelationship = createMockRelationship({
        creatorId: TEST_MEMBER_ID,
        memberId: TEST_MEMBER_ID,
      });
      mockRepo.getFollowedCreators.mockResolvedValue([selfRelationship]);

      const res = await request(app).get('/api/creator-members/following').set('x-user-id', TEST_MEMBER_ID);

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
      mockRepo.getMembers.mockResolvedValue([]);

      const res = await request(app).get('/api/creator-members/members').set('x-user-id', TEST_CREATOR_1_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(mockRepo.getMembers).toHaveBeenCalledWith(TEST_CREATOR_1_ID);
    });

    it('should return list of members following the creator', async () => {
      const relationships = [
        createMockRelationship({ creatorId: TEST_CREATOR_1_ID, memberId: TEST_MEMBER_ID }),
        createMockRelationship({ id: 'rel-id-2', creatorId: TEST_CREATOR_1_ID, memberId: TEST_MEMBER_2_ID }),
      ];
      mockRepo.getMembers.mockResolvedValue(relationships);

      const res = await request(app).get('/api/creator-members/members').set('x-user-id', TEST_CREATOR_1_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);

      const memberIds = res.body.data.map((m: Record<string, unknown>) => m.memberId);
      expect(memberIds).toContain(TEST_MEMBER_ID);
      expect(memberIds).toContain(TEST_MEMBER_2_ID);
    });
  });

  describe('POST /api/creator-members/follow/:creatorId', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/creator-members/follow/some-id');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should create a new follow relationship', async () => {
      const relationship = createMockRelationship({
        creatorId: TEST_CREATOR_1_ID,
        memberId: TEST_MEMBER_ID,
      });
      mockRepo.createRelationship.mockResolvedValue(relationship);

      const res = await request(app)
        .post(`/api/creator-members/follow/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.creatorId).toBe(TEST_CREATOR_1_ID);
      expect(res.body.data.memberId).toBe(TEST_MEMBER_ID);
      expect(mockRepo.createRelationship).toHaveBeenCalledWith(TEST_CREATOR_1_ID, TEST_MEMBER_ID);
    });

    it('should be idempotent - following same creator twice returns success', async () => {
      const relationship = createMockRelationship({
        creatorId: TEST_CREATOR_1_ID,
        memberId: TEST_MEMBER_ID,
      });
      mockRepo.createRelationship.mockResolvedValue(relationship);

      const res1 = await request(app)
        .post(`/api/creator-members/follow/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);

      const res2 = await request(app)
        .post(`/api/creator-members/follow/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);

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
      const res = await request(app)
        .delete(`/api/creator-members/following/${TEST_MEMBER_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Cannot unfollow yourself');
    });

    it('should return 404 when not following the creator', async () => {
      mockRepo.findRelationship.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/creator-members/following/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Not following this creator');
      expect(mockRepo.findRelationship).toHaveBeenCalledWith(TEST_CREATOR_1_ID, TEST_MEMBER_ID);
    });

    it('should successfully unfollow a creator', async () => {
      const relationship = createMockRelationship({ status: 'active' });
      mockRepo.findRelationship.mockResolvedValue(relationship);
      mockRepo.revokeRelationship.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/creator-members/following/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Unfollowed successfully');
      expect(mockRepo.revokeRelationship).toHaveBeenCalledWith(TEST_CREATOR_1_ID, TEST_MEMBER_ID);
    });

    it('should allow re-following after unfollowing', async () => {
      mockRepo.findRelationship.mockResolvedValue(createMockRelationship({ status: 'active' }));
      mockRepo.revokeRelationship.mockResolvedValue(undefined);

      const unfollowRes = await request(app)
        .delete(`/api/creator-members/following/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);
      expect(unfollowRes.status).toBe(200);

      const reFollowRelationship = createMockRelationship({
        creatorId: TEST_CREATOR_1_ID,
        memberId: TEST_MEMBER_ID,
      });
      mockRepo.createRelationship.mockResolvedValue(reFollowRelationship);

      const followRes = await request(app)
        .post(`/api/creator-members/follow/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);

      expect(followRes.status).toBe(201);
      expect(followRes.body.success).toBe(true);
    });
  });

  describe('End-to-End: Complete Follow/Unfollow Workflow', () => {
    it('should complete full follow → verify → unfollow → verify cycle', async () => {
      const relationship = createMockRelationship({
        creatorId: TEST_CREATOR_1_ID,
        memberId: TEST_MEMBER_ID,
      });
      mockRepo.createRelationship.mockResolvedValue(relationship);

      const followRes = await request(app)
        .post(`/api/creator-members/follow/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);
      expect(followRes.status).toBe(201);

      mockRepo.getFollowedCreators.mockResolvedValue([relationship]);
      const verifyFollowingRes = await request(app)
        .get('/api/creator-members/following')
        .set('x-user-id', TEST_MEMBER_ID);
      expect(verifyFollowingRes.body.data).toHaveLength(1);
      expect(verifyFollowingRes.body.data[0].creatorId).toBe(TEST_CREATOR_1_ID);

      mockRepo.getMembers.mockResolvedValue([relationship]);
      const verifyMembersRes = await request(app)
        .get('/api/creator-members/members')
        .set('x-user-id', TEST_CREATOR_1_ID);
      expect(verifyMembersRes.body.data).toHaveLength(1);
      expect(verifyMembersRes.body.data[0].memberId).toBe(TEST_MEMBER_ID);

      mockRepo.findRelationship.mockResolvedValue(relationship);
      mockRepo.revokeRelationship.mockResolvedValue(undefined);
      const unfollowRes = await request(app)
        .delete(`/api/creator-members/following/${TEST_CREATOR_1_ID}`)
        .set('x-user-id', TEST_MEMBER_ID);
      expect(unfollowRes.status).toBe(200);

      mockRepo.getFollowedCreators.mockResolvedValue([]);
      const verifyUnfollowedRes = await request(app)
        .get('/api/creator-members/following')
        .set('x-user-id', TEST_MEMBER_ID);
      expect(verifyUnfollowedRes.body.data).toHaveLength(0);

      mockRepo.getMembers.mockResolvedValue([]);
      const verifyNoMembersRes = await request(app)
        .get('/api/creator-members/members')
        .set('x-user-id', TEST_CREATOR_1_ID);
      expect(verifyNoMembersRes.body.data).toHaveLength(0);
    });
  });
});
