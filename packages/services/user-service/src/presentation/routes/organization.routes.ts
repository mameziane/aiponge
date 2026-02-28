import { Router, Request, Response } from 'express';
import { serviceAuthMiddleware, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { normalizeRole, USER_ROLES, CREATOR_MEMBER_STATUS, getCorrelationId } from '@aiponge/shared-contracts';
import { sendSuccess, ServiceErrors } from '../utils/response-helpers';
import { UserEventPublisher } from '../../infrastructure/events/UserEventPublisher';
import { getLogger } from '../../config/service-urls';
import { users } from '../../infrastructure/database/schemas/user-schema';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import type { OrganizationController } from '../controllers/OrganizationController';

interface OrganizationRouteDeps {
  organizationController: OrganizationController;
}

export function registerOrganizationRoutes(router: Router, deps: OrganizationRouteDeps): void {
  const { organizationController } = deps;
  const db = getDatabase();
  const logger = getLogger('user-service-routes');

  // ==============================================
  // CREATOR-MEMBER RELATIONSHIP ROUTES
  // ==============================================

  // Get accessible creator IDs for content visibility
  // Used by other services to determine which content a user can access
  router.get('/creator-members/accessible-creators', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID required', req);
        return;
      }

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);
      const creatorIds = await repo.getAccessibleCreatorIds(userId);

      sendSuccess(res, { creatorIds });
    } catch (error) {
      logger.error('Failed to get accessible creator IDs', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get accessible creators', req);
      return;
    }
  });

  // Get all librarian user IDs
  // Used by other services for unauthenticated access to determine publicly visible content
  // NOTE: required: false because this endpoint is for service-to-service calls without user context
  router.get('/creator-members/librarians', serviceAuthMiddleware({ required: false }), async (req, res) => {
    try {
      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);
      const librarianIds = await repo.getLibrarianIds();

      sendSuccess(res, { librarianIds });
    } catch (error) {
      logger.error('Failed to get librarian IDs', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get librarians', req);
      return;
    }
  });

  // ==============================================
  // ORGANIZATION ROUTES
  // ==============================================

  router.post('/organizations', (req, res) => organizationController.createOrganization(req, res));
  router.get('/organizations/me', (req, res) => organizationController.getMyOrganization(req, res));
  router.get('/organizations/:organizationId', (req, res) => organizationController.getOrganization(req, res));
  router.patch('/organizations/:organizationId', (req, res) => organizationController.updateOrganization(req, res));
  router.post('/organizations/:organizationId/members', (req, res) => organizationController.addMember(req, res));
  router.delete('/organizations/:organizationId/members', (req, res) => organizationController.removeMember(req, res));
  router.get('/organizations/:organizationId/members', (req, res) => organizationController.getMembers(req, res));

  // ==============================================
  // BRANDING RESOLUTION ROUTE
  // ==============================================
  router.get('/branding/resolve/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        ServiceErrors.badRequest(res, 'userId is required', req);
        return;
      }
      const { BrandingService } = await import('../../application/services/BrandingService');
      const brandingService = new BrandingService();
      const result = await brandingService.resolveForUser(userId as string);
      sendSuccess(res, result);
    } catch (error: unknown) {
      logger.error('Failed to resolve branding', { userId: req.params.userId, error });
      ServiceErrors.internal(res, 'Failed to resolve branding', undefined, req);
    }
  });

  // ==============================================
  // INVITATION ENDPOINTS
  // ==============================================

  // Create an invitation for others to follow this creator
  // POST /api/creator-members/invitations
  const createInvitationSchema = z.object({
    maxUses: z.number().int().positive().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    email: z.string().email().optional().nullable(),
  });

  router.post('/creator-members/invitations', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      // Validate request body
      const parseResult = createInvitationSchema.safeParse(req.body);
      if (!parseResult.success) {
        ServiceErrors.badRequest(
          res,
          'Invalid request body',
          req,
          parseResult.error.flatten().fieldErrors as Record<string, unknown>
        );
        return;
      }

      const { maxUses, expiresAt, email } = parseResult.data;

      const { randomBytes } = await import('crypto');
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = randomBytes(8);
      let token = 'AIP';
      for (let i = 0; i < 8; i++) {
        token += chars[bytes[i] % chars.length];
      }

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);

      const invitation = await repo.createInvitation(userId, token, {
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        email: email ?? null,
      });

      sendSuccess(res, {
        id: invitation.id,
        token: invitation.token,
        maxUses: invitation.maxUses,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      });
    } catch (error) {
      logger.error('Failed to create invitation', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to create invitation', req);
      return;
    }
  });

  // List creator's own invitations
  // GET /api/creator-members/invitations
  router.get('/creator-members/invitations', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);
      const invitationList = await repo.getCreatorInvitations(userId);

      const invitationsWithStatus = invitationList.map(inv => ({
        id: inv.id,
        token: inv.token,
        useCount: inv.useCount,
        maxUses: inv.maxUses,
        expiresAt: inv.expiresAt,
        email: inv.email,
        createdAt: inv.createdAt,
        isExpired: inv.expiresAt ? new Date(inv.expiresAt) < new Date() : false,
        isMaxedOut: inv.maxUses !== null ? inv.useCount >= inv.maxUses : false,
      }));

      sendSuccess(res, invitationsWithStatus);
    } catch (error) {
      logger.error('Failed to list invitations', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to list invitations', req);
      return;
    }
  });

  // Delete/revoke an invitation
  // DELETE /api/creator-members/invitations/:id
  router.delete('/creator-members/invitations/:id', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const id = req.params.id as string;

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);

      // Verify the invitation belongs to this user
      const invitation = await repo.findInvitationById(id);
      if (!invitation) {
        ServiceErrors.notFound(res, 'Invitation', req);
        return;
      }
      if (invitation.creatorId !== userId) {
        ServiceErrors.forbidden(res, 'Not authorized to delete this invitation', req);
        return;
      }

      await repo.deleteInvitation(id);

      logger.info('Invitation deleted', { creatorId: userId, invitationId: id });

      sendSuccess(res, { message: 'Invitation deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete invitation', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete invitation', req);
      return;
    }
  });

  // Get invitation details by token (validate before accepting)
  // GET /api/creator-members/invitations/:token
  router.get('/creator-members/invitations/:token', async (req, res) => {
    try {
      const { token } = req.params;

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);
      const invitation = await repo.findInvitationByToken(token);

      if (!invitation) {
        ServiceErrors.notFound(res, 'Invitation', req);
        return;
      }

      // Check if expired
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        ServiceErrors.badRequest(res, 'Invitation has expired', req);
        return;
      }

      // Check if max uses reached
      if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) {
        ServiceErrors.badRequest(res, 'Invitation has reached maximum uses', req);
        return;
      }

      // Get creator info for display
      const creatorResult = await db
        .select({ id: users.id, metadata: users.metadata })
        .from(users)
        .where(eq(users.id, invitation.creatorId))
        .limit(1);

      const creator = creatorResult[0];
      const creatorMetadata = creator?.metadata as { displayName?: string } | null;

      sendSuccess(res, {
        id: invitation.id,
        creatorId: invitation.creatorId,
        creatorName: creatorMetadata?.displayName || 'Unknown',
        usesRemaining: invitation.maxUses !== null ? invitation.maxUses - invitation.useCount : null,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to get invitation', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get invitation', req);
      return;
    }
  });

  // Accept an invitation (create member relationship) - ATOMIC TRANSACTION
  // POST /api/creator-members/invitations/:token/accept
  router.post(
    '/creator-members/invitations/:token/accept',
    serviceAuthMiddleware({ required: true }),
    async (req, res) => {
      try {
        const { userId } = extractAuthContext(req);
        if (!userId) {
          ServiceErrors.unauthorized(res, 'Authentication required', req);
          return;
        }

        const token = req.params.token as string;

        const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
        const repo = new CreatorMemberRepository(db);

        // Use atomic transaction to prevent race conditions
        const result = await repo.acceptInvitationAtomically(token, userId);

        if (!result.success) {
          logger.warn('Invitation acceptance failed', {
            error: result.error,
            errorMessage: result.errorMessage,
            userId,
          });

          const errorMsg = result.errorMessage || 'Failed to accept invitation';
          switch (result.error) {
            case 'NOT_FOUND':
              ServiceErrors.notFound(res, 'Invitation', req);
              return;
            case 'EXPIRED':
            case 'MAX_USES_REACHED':
              ServiceErrors.gone(res, errorMsg, req);
              return;
            case 'ALREADY_FOLLOWING':
              ServiceErrors.conflict(res, errorMsg, req);
              return;
            default:
              ServiceErrors.internal(res, errorMsg, undefined, req);
              return;
          }
        }

        const relationship = result.relationship!;

        UserEventPublisher.creatorMemberFollowed(relationship.memberId, relationship.creatorId, getCorrelationId(req));

        sendSuccess(res, {
          relationshipId: relationship.id,
          creatorId: relationship.creatorId,
          memberId: relationship.memberId,
        });
      } catch (error) {
        logger.error('Unexpected error accepting invitation', {
          error: serializeError(error),
        });
        ServiceErrors.fromException(res, error, 'An unexpected error occurred', req);
        return;
      }
    }
  );

  // ==============================================
  // RELATIONSHIP MANAGEMENT ENDPOINTS
  // ==============================================

  // List creators the current user is following
  // GET /api/creator-members/following
  router.get('/creator-members/following', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);
      const relationships = await repo.getFollowedCreators(userId);

      const filtered = relationships.filter(r => r.creatorId !== userId);

      const creatorIds = filtered.map(r => r.creatorId);
      const creatorMap: Record<string, { email: string; role: string; metadata: unknown; profile: unknown }> = {};
      if (creatorIds.length > 0) {
        const creatorRows = await db
          .select({
            id: users.id,
            email: users.email,
            role: users.role,
            metadata: users.metadata,
            profile: users.profile,
          })
          .from(users)
          .where(inArray(users.id, creatorIds));
        for (const row of creatorRows) {
          creatorMap[row.id] = { email: row.email, role: row.role, metadata: row.metadata, profile: row.profile };
        }
      }

      const following = filtered.map(r => {
        const creator = creatorMap[r.creatorId];
        const meta = creator?.metadata as { displayName?: string } | null;
        const profile = creator?.profile as { avatar?: string } | null;
        return {
          creatorId: r.creatorId,
          creatorName: meta?.displayName || null,
          creatorEmail: creator?.email || null,
          creatorAvatar: profile?.avatar || null,
          isLibrarian: creator?.role === USER_ROLES.LIBRARIAN,
          status: r.status ?? CREATOR_MEMBER_STATUS.ACTIVE,
          followedAt: r.createdAt,
        };
      });

      sendSuccess(res, following);
    } catch (error) {
      logger.error('Failed to get following list', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get following list', req);
      return;
    }
  });

  // List members following the current user (as creator)
  // GET /api/creator-members/members
  router.get('/creator-members/members', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);
      const relationships = await repo.getMembers(userId);

      // Filter out self-relationship from the list
      const members = relationships
        .filter(r => r.memberId !== userId)
        .map(r => ({
          memberId: r.memberId,
          followedAt: r.createdAt,
        }));

      sendSuccess(res, members);
    } catch (error) {
      logger.error('Failed to get members list', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get members list', req);
      return;
    }
  });

  // Unfollow a creator
  // DELETE /api/creator-members/following/:creatorId
  router.delete(
    '/creator-members/following/:creatorId',
    serviceAuthMiddleware({ required: true }),
    async (req, res) => {
      try {
        const { userId } = extractAuthContext(req);
        if (!userId) {
          ServiceErrors.unauthorized(res, 'Authentication required', req);
          return;
        }

        const creatorId = req.params.creatorId as string;

        // Cannot unfollow self
        if (creatorId === userId) {
          ServiceErrors.badRequest(res, 'Cannot unfollow yourself', req);
          return;
        }

        const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
        const repo = new CreatorMemberRepository(db);

        // Cannot unfollow librarians (library access is mandatory)
        const librarianIds = await repo.getLibrarianIds();
        if (librarianIds.includes(creatorId)) {
          ServiceErrors.badRequest(res, 'Cannot unfollow the official library', req);
          return;
        }

        // Check if relationship exists
        const existingRelationship = await repo.findRelationship(creatorId, userId);
        if (!existingRelationship) {
          ServiceErrors.notFound(res, 'Creator relationship', req);
          return;
        }

        await repo.revokeRelationship(creatorId, userId);

        UserEventPublisher.creatorMemberUnfollowed(userId, creatorId, getCorrelationId(req));

        logger.info('User unfollowed creator', { memberId: userId, creatorId });

        sendSuccess(res, { message: 'Successfully unfollowed creator' });
      } catch (error) {
        logger.error('Failed to unfollow creator', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Failed to unfollow creator', req);
        return;
      }
    }
  );

  // Remove a member (as creator)
  // DELETE /api/creator-members/members/:memberId
  router.delete('/creator-members/members/:memberId', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const memberId = req.params.memberId as string;

      // Cannot remove self
      if (memberId === userId) {
        ServiceErrors.badRequest(res, 'Cannot remove yourself', req);
        return;
      }

      const { CreatorMemberRepository } = await import('../../infrastructure/repositories/CreatorMemberRepository');
      const repo = new CreatorMemberRepository(db);

      // Check if relationship exists
      const existingRelationship = await repo.findRelationship(userId, memberId);
      if (!existingRelationship) {
        ServiceErrors.notFound(res, 'Member', req);
        return;
      }

      await repo.revokeRelationship(userId, memberId);

      UserEventPublisher.creatorMemberUnfollowed(memberId, userId, getCorrelationId(req));

      logger.info('Creator removed member', { creatorId: userId, memberId });

      sendSuccess(res, { message: 'Successfully removed member' });
    } catch (error) {
      logger.error('Failed to remove member', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to remove member', req);
      return;
    }
  });
}
