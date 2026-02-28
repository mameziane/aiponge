/**
 * Creator-Member Repository
 * Handles creator-member relationships for the unified content access model
 */

import { eq, and, sql, isNull } from 'drizzle-orm';
import { createLogger, serializeError } from '@aiponge/platform-core';
import { ProfileError } from '../../application/errors/errors';
import type { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  creatorMembers,
  invitations,
  type CreatorMember,
  type Invitation,
  CREATOR_MEMBER_STATUS,
} from '../database/schemas/creator-member-schema';
import { libBooks } from '../database/schemas/library-schema';
import { users } from '../database/schemas/user-schema';
import { USER_ROLES, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

const logger = createLogger('creator-member-repository');

/**
 * Result of atomic invitation acceptance
 */
export interface AcceptInvitationResult {
  success: boolean;
  relationship?: CreatorMember;
  error?: 'NOT_FOUND' | 'EXPIRED' | 'MAX_USES_REACHED' | 'ALREADY_FOLLOWING' | 'TRANSACTION_FAILED';
  errorMessage?: string;
}

export interface ICreatorMemberRepository {
  createRelationship(creatorId: string, memberId: string, status?: string): Promise<CreatorMember>;
  createSelfRelationship(userId: string): Promise<CreatorMember>;
  autoFollowAllLibrarians(memberId: string): Promise<number>;
  addAllUsersToLibrarian(creatorId: string): Promise<number>;
  findRelationship(creatorId: string, memberId: string): Promise<CreatorMember | null>;
  getFollowedCreators(memberId: string): Promise<CreatorMember[]>;
  getMembers(creatorId: string): Promise<CreatorMember[]>;
  revokeRelationship(creatorId: string, memberId: string): Promise<void>;
  createInvitation(creatorId: string, token: string): Promise<Invitation>;
  findInvitationByToken(token: string): Promise<Invitation | null>;
  incrementInvitationUseCount(invitationId: string): Promise<void>;
  getCreatorInvitations(creatorId: string): Promise<Invitation[]>;
  findInvitationById(invitationId: string): Promise<Invitation | null>;
  deleteInvitation(invitationId: string): Promise<void>;
  getAccessibleCreatorIds(memberId: string): Promise<string[]>;
  getLibrarianIds(): Promise<string[]>;
  backfillSelfRelationships(): Promise<number>;
  backfillLibrarianRelationships(): Promise<number>;
  acceptInvitationAtomically(token: string, memberId: string): Promise<AcceptInvitationResult>;
}

export class CreatorMemberRepository implements ICreatorMemberRepository {
  constructor(private db: DatabaseConnection) {}

  async createRelationship(
    creatorId: string,
    memberId: string,
    status: string = CREATOR_MEMBER_STATUS.ACTIVE
  ): Promise<CreatorMember> {
    const [relationship] = await this.db
      .insert(creatorMembers)
      .values({ creatorId, memberId, status })
      .onConflictDoNothing()
      .returning();

    if (!relationship) {
      const existing = await this.findRelationship(creatorId, memberId);
      if (existing) return existing;
      throw ProfileError.internalError('Failed to create relationship');
    }

    logger.info('Creator-member relationship created', { creatorId, memberId });
    return relationship;
  }

  async createSelfRelationship(userId: string): Promise<CreatorMember> {
    return this.createRelationship(userId, userId, CREATOR_MEMBER_STATUS.ACTIVE);
  }

  async autoFollowAllLibrarians(memberId: string): Promise<number> {
    const librarianList = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, USER_ROLES.LIBRARIAN), isNull(users.deletedAt)))
      .limit(1000);

    if (librarianList.length === 0) {
      return 0;
    }

    const relationships = librarianList.map(librarian => ({
      creatorId: librarian.id,
      memberId,
      status: CREATOR_MEMBER_STATUS.ACTIVE,
    }));

    const result = await this.db.insert(creatorMembers).values(relationships).onConflictDoNothing().returning();

    logger.info('User auto-followed all librarians', {
      memberId,
      librarianCount: result.length,
    });

    return result.length;
  }

  async addAllUsersToLibrarian(creatorId: string): Promise<number> {
    const allUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, USER_ROLES.USER), eq(users.isGuest, false), isNull(users.deletedAt)))
      .limit(1000);

    if (allUsers.length === 0) {
      return 0;
    }

    const relationships = allUsers.map(user => ({
      creatorId,
      memberId: user.id,
      status: CREATOR_MEMBER_STATUS.ACTIVE,
    }));

    const result = await this.db.insert(creatorMembers).values(relationships).onConflictDoNothing().returning();

    logger.info('All users now follow new librarian', {
      creatorId,
      userCount: result.length,
    });

    return result.length;
  }

  async findRelationship(creatorId: string, memberId: string): Promise<CreatorMember | null> {
    const [relationship] = await this.db
      .select()
      .from(creatorMembers)
      .where(
        and(
          eq(creatorMembers.creatorId, creatorId),
          eq(creatorMembers.memberId, memberId),
          isNull(creatorMembers.deletedAt)
        )
      )
      .limit(1);

    return relationship || null;
  }

  async getFollowedCreators(memberId: string): Promise<CreatorMember[]> {
    return this.db
      .select()
      .from(creatorMembers)
      .where(
        and(
          eq(creatorMembers.memberId, memberId),
          eq(creatorMembers.status, CREATOR_MEMBER_STATUS.ACTIVE),
          isNull(creatorMembers.deletedAt)
        )
      );
  }

  async getMembers(creatorId: string): Promise<CreatorMember[]> {
    return this.db
      .select()
      .from(creatorMembers)
      .where(
        and(
          eq(creatorMembers.creatorId, creatorId),
          eq(creatorMembers.status, CREATOR_MEMBER_STATUS.ACTIVE),
          isNull(creatorMembers.deletedAt)
        )
      );
  }

  async revokeRelationship(creatorId: string, memberId: string): Promise<void> {
    await this.db
      .update(creatorMembers)
      .set({ status: CREATOR_MEMBER_STATUS.REVOKED })
      .where(
        and(
          eq(creatorMembers.creatorId, creatorId),
          eq(creatorMembers.memberId, memberId),
          isNull(creatorMembers.deletedAt)
        )
      );

    logger.info('Creator-member relationship revoked', { creatorId, memberId });
  }

  async createInvitation(
    creatorId: string,
    token: string,
    options?: { maxUses?: number | null; expiresAt?: Date | null; email?: string | null }
  ): Promise<Invitation> {
    const [invitation] = await this.db
      .insert(invitations)
      .values({
        creatorId,
        token,
        maxUses: options?.maxUses ?? null,
        expiresAt: options?.expiresAt ?? null,
        email: options?.email ?? null,
      })
      .returning();

    logger.info('Invitation created', { creatorId, invitationId: invitation.id });
    return invitation;
  }

  async findInvitationByToken(token: string): Promise<Invitation | null> {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(and(eq(invitations.token, token), isNull(invitations.deletedAt)))
      .limit(1);

    return invitation || null;
  }

  async incrementInvitationUseCount(invitationId: string): Promise<void> {
    await this.db
      .update(invitations)
      .set({ useCount: sql`${invitations.useCount} + 1` })
      .where(and(eq(invitations.id, invitationId), isNull(invitations.deletedAt)));
  }

  async getCreatorInvitations(creatorId: string): Promise<Invitation[]> {
    return this.db
      .select()
      .from(invitations)
      .where(and(eq(invitations.creatorId, creatorId), isNull(invitations.deletedAt)))
      .orderBy(sql`${invitations.createdAt} DESC`);
  }

  async findInvitationById(invitationId: string): Promise<Invitation | null> {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, invitationId), isNull(invitations.deletedAt)))
      .limit(1);

    return invitation || null;
  }

  async deleteInvitation(invitationId: string): Promise<void> {
    await this.db.delete(invitations).where(eq(invitations.id, invitationId));

    logger.info('Invitation deleted', { invitationId });
  }

  /**
   * Atomically accept an invitation - prevents race conditions
   * All validation and creation happens within a single transaction
   */
  async acceptInvitationAtomically(token: string, memberId: string): Promise<AcceptInvitationResult> {
    try {
      return await this.db.transaction(async tx => {
        // Step 1: Find and lock the invitation (SELECT FOR UPDATE semantics via transaction)
        const [invitation] = await tx
          .select()
          .from(invitations)
          .where(and(eq(invitations.token, token), isNull(invitations.deletedAt)))
          .limit(1);

        if (!invitation) {
          logger.warn('Invitation not found during acceptance', { token: token.substring(0, 8) + '...' });
          return {
            success: false,
            error: 'NOT_FOUND' as const,
            errorMessage: 'Invitation not found',
          };
        }

        // Step 2: Check expiration
        if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
          logger.info('Invitation expired during acceptance', { invitationId: invitation.id });
          return {
            success: false,
            error: 'EXPIRED' as const,
            errorMessage: 'Invitation has expired',
          };
        }

        // Step 3: Check max uses (atomic check within transaction)
        if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) {
          logger.info('Invitation max uses reached during acceptance', {
            invitationId: invitation.id,
            useCount: invitation.useCount,
            maxUses: invitation.maxUses,
          });
          return {
            success: false,
            error: 'MAX_USES_REACHED' as const,
            errorMessage: 'Invitation has reached maximum uses',
          };
        }

        // Step 4: Check if already following (within transaction)
        const [existingRelationship] = await tx
          .select()
          .from(creatorMembers)
          .where(
            and(
              eq(creatorMembers.creatorId, invitation.creatorId),
              eq(creatorMembers.memberId, memberId),
              isNull(creatorMembers.deletedAt)
            )
          )
          .limit(1);

        if (existingRelationship) {
          logger.info('User already following creator', {
            creatorId: invitation.creatorId,
            memberId,
          });
          return {
            success: false,
            error: 'ALREADY_FOLLOWING' as const,
            errorMessage: 'Already following this creator',
          };
        }

        // Step 5: Create relationship (within transaction)
        const [relationship] = await tx
          .insert(creatorMembers)
          .values({
            creatorId: invitation.creatorId,
            memberId,
            status: CREATOR_MEMBER_STATUS.ACTIVE,
          })
          .returning();

        // Step 6: Increment use count (within transaction - atomic with all checks)
        await tx
          .update(invitations)
          .set({ useCount: sql`${invitations.useCount} + 1` })
          .where(and(eq(invitations.id, invitation.id), isNull(invitations.deletedAt)));

        logger.info('Invitation accepted atomically', {
          invitationId: invitation.id,
          creatorId: invitation.creatorId,
          memberId,
          newUseCount: invitation.useCount + 1,
        });

        return {
          success: true,
          relationship,
        };
      });
    } catch (error) {
      logger.error('Transaction failed during invitation acceptance', {
        token: token.substring(0, 8) + '...',
        memberId,
        error: serializeError(error),
      });
      return {
        success: false,
        error: 'TRANSACTION_FAILED' as const,
        errorMessage: error instanceof Error ? error.message : 'Transaction failed',
      };
    }
  }

  async getAccessibleCreatorIds(memberId: string): Promise<string[]> {
    const relationships = await this.db
      .select({ creatorId: creatorMembers.creatorId })
      .from(creatorMembers)
      .where(
        and(
          eq(creatorMembers.memberId, memberId),
          eq(creatorMembers.status, CREATOR_MEMBER_STATUS.ACTIVE),
          isNull(creatorMembers.deletedAt)
        )
      );

    return relationships.map(r => r.creatorId);
  }

  async getLibrarianIds(): Promise<string[]> {
    const librarians = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, USER_ROLES.LIBRARIAN), isNull(users.deletedAt)));

    return librarians.map(l => l.id);
  }

  async backfillSelfRelationships(): Promise<number> {
    const usersWithoutSelf = await this.db
      .select({ id: users.id })
      .from(users)
      .leftJoin(creatorMembers, and(eq(users.id, creatorMembers.creatorId), eq(users.id, creatorMembers.memberId)))
      .where(and(eq(users.isGuest, false), sql`${creatorMembers.id} IS NULL`, isNull(users.deletedAt)));

    if (usersWithoutSelf.length === 0) {
      return 0;
    }

    const relationships = usersWithoutSelf.map(u => ({
      creatorId: u.id,
      memberId: u.id,
      status: CREATOR_MEMBER_STATUS.ACTIVE,
    }));

    const result = await this.db.insert(creatorMembers).values(relationships).onConflictDoNothing().returning();

    logger.info('Backfilled self-relationships', { count: result.length });
    return result.length;
  }

  async backfillLibrarianRelationships(): Promise<number> {
    const librarianList = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, USER_ROLES.LIBRARIAN), isNull(users.deletedAt)));

    if (librarianList.length === 0) {
      return 0;
    }

    const regularUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, USER_ROLES.USER), eq(users.isGuest, false), isNull(users.deletedAt)));

    if (regularUsers.length === 0) {
      return 0;
    }

    const relationships: Array<{ creatorId: string; memberId: string; status: string }> = [];
    for (const librarian of librarianList) {
      for (const user of regularUsers) {
        relationships.push({
          creatorId: librarian.id,
          memberId: user.id,
          status: CREATOR_MEMBER_STATUS.ACTIVE,
        });
      }
    }

    const result = await this.db.insert(creatorMembers).values(relationships).onConflictDoNothing().returning();

    logger.info('Backfilled librarian relationships', {
      librarianCount: librarianList.length,
      userCount: regularUsers.length,
      relationshipsCreated: result.length,
    });

    return result.length;
  }
}
