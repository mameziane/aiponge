/**
 * Assign Librarian Role Use Case
 * Promotes a user to librarian role and grants initial credit budget
 *
 * Librarians can:
 * - Manage shared library content
 * - Generate multi-language albums
 * - Use the dedicated librarian credit budget
 */

import { IAuthRepository } from '@domains/auth';
import { ICreditRepository } from '@domains/credits';
import { getLogger } from '@config/service-urls';
import { USER_ROLES } from '@aiponge/shared-contracts';
import { CreatorMemberRepository } from '@infrastructure/repositories/CreatorMemberRepository';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('assign-librarian-role-use-case');

const LIBRARIAN_INITIAL_CREDITS = 15000;

export interface AssignLibrarianRoleRequest {
  userId: string;
  assignedByUserId: string;
  reason?: string;
}

export interface AssignLibrarianRoleResponse {
  success: boolean;
  userId?: string;
  previousRole?: string;
  newRole?: string;
  creditsAdded?: number;
  newBalance?: number;
  error?: string;
}

export class AssignLibrarianRoleUseCase {
  constructor(
    private authRepository: IAuthRepository,
    private creditRepository: ICreditRepository
  ) {}

  async execute(request: AssignLibrarianRoleRequest): Promise<AssignLibrarianRoleResponse> {
    try {
      const { userId, assignedByUserId, reason } = request;

      logger.info('Assigning librarian role', { userId, assignedByUserId, reason });

      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const previousRole = user.role;

      if (previousRole === USER_ROLES.LIBRARIAN) {
        return {
          success: false,
          error: 'User is already a librarian',
          previousRole,
        };
      }

      if (previousRole === USER_ROLES.ADMIN) {
        return {
          success: false,
          error: 'Cannot change admin role to librarian',
          previousRole,
        };
      }

      let creditTransaction;
      try {
        creditTransaction = await this.creditRepository.refundCredits(
          userId,
          LIBRARIAN_INITIAL_CREDITS,
          `Librarian initial credit allocation (assigned by ${assignedByUserId})`,
          {
            type: 'librarian_allocation',
            previousRole,
            assignedByUserId,
            reason,
            timestamp: new Date().toISOString(),
          }
        );

        logger.info('Librarian credits allocated', {
          userId,
          creditsAdded: LIBRARIAN_INITIAL_CREDITS,
          transactionId: creditTransaction.id,
        });
      } catch (creditError) {
        logger.error('Failed to allocate librarian credits - aborting role assignment', {
          userId,
          error: creditError instanceof Error ? creditError.message : String(creditError),
        });
        return {
          success: false,
          error: 'Failed to allocate librarian credits. Role not changed.',
          previousRole,
        };
      }

      const updatedUser = await this.authRepository.updateUser(userId, {
        role: USER_ROLES.LIBRARIAN,
        isSystemAccount: true,
      });

      if (!updatedUser) {
        logger.error('Failed to update role after credits allocated - credits remain but role unchanged', { userId });
        return {
          success: false,
          error: 'Failed to update user role. Credits were allocated but role change failed.',
          previousRole,
        };
      }

      logger.info('User role updated to librarian with system account flag', { userId, previousRole });

      // Create creator-member relationships for new librarian (non-blocking)
      try {
        const creatorMemberRepo = new CreatorMemberRepository(getDatabase());

        // Self-relationship: librarian is their own creator
        await creatorMemberRepo.createSelfRelationship(userId);
        logger.info('Self-relationship created for new librarian', { userId });

        // All existing users should now follow this librarian
        const usersFollowing = await creatorMemberRepo.addAllUsersToLibrarian(userId);
        if (usersFollowing > 0) {
          logger.info('All users now follow new librarian', { userId, count: usersFollowing });
        }
      } catch (cmError) {
        logger.error('Creator-member setup failed for librarian (non-blocking)', {
          userId,
          error: cmError instanceof Error ? cmError.message : String(cmError),
        });
      }

      let newBalance = LIBRARIAN_INITIAL_CREDITS;
      try {
        const balance = await this.creditRepository.getBalance(userId);
        newBalance = balance?.currentBalance || LIBRARIAN_INITIAL_CREDITS;
      } catch (balanceError) {
        logger.warn('Could not fetch balance after credit allocation', {
          userId,
          error: balanceError instanceof Error ? balanceError.message : String(balanceError),
        });
      }

      return {
        success: true,
        userId,
        previousRole,
        newRole: USER_ROLES.LIBRARIAN,
        creditsAdded: LIBRARIAN_INITIAL_CREDITS,
        newBalance,
      };
    } catch (error) {
      logger.error('Failed to assign librarian role', {
        error: serializeError(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign librarian role',
      };
    }
  }
}
