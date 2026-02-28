/**
 * Update User Use Case
 * Handles user profile and data updates
 */

import { IAuthRepository } from '@domains/auth';
import { User } from '@infrastructure/database/schemas/user-schema';
import { USER_ROLES, type UserRole, isValidRole } from '@aiponge/shared-contracts';
import bcrypt from 'bcryptjs';
import { getLogger } from '@config/service-urls';
import { markFileAsOrphaned } from '@aiponge/shared-contracts/storage';
import { ProfileNameUpdateHelper } from '../../services/ProfileNameUpdateHelper';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('update-user-use-case');

export interface UpdateUserRequest {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  bio?: string;
  avatar?: string;
}

interface PartialUserInfo {
  userId?: string;
  updatedAt?: string;
  passwordChangedAt?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  bio?: string;
  avatar?: string;
  preferences?: unknown;
}

export interface UpdateUserResponse {
  success: boolean;
  user?: User | PartialUserInfo;
  error?: string;
}

export class UpdateUserUseCase {
  constructor(private authRepository: IAuthRepository) {}

  async execute(request: UpdateUserRequest): Promise<UpdateUserResponse> {
    try {
      const { userId, ...updates } = request;

      if (!userId) {
        return { success: false, error: 'User ID is required' };
      }

      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      let profile: Record<string, string | undefined> & Record<string, unknown> = {};
      try {
        profile = typeof user.profile === 'string' ? JSON.parse(user.profile) : (user.profile as Record<string, string | undefined> & Record<string, unknown>) || {};
      } catch {
        profile = {};
      }

      // Mark old avatar as orphaned if a new one is being set
      if (updates.avatar && profile.avatarUrl && updates.avatar !== profile.avatarUrl) {
        try {
          const orphanResult = await markFileAsOrphaned(profile.avatarUrl);
          if (orphanResult.success) {
            logger.info('Marked old avatar as orphaned', {
              userId,
              oldAvatar: profile.avatarUrl,
              newAvatar: updates.avatar,
              marked: orphanResult.marked,
            });
          } else {
            logger.warn('Failed to mark old avatar as orphaned', {
              oldAvatar: profile.avatarUrl,
              error: orphanResult.error,
            });
          }
        } catch (orphanError) {
          logger.warn('Error calling orphan marking service', {
            error: orphanError instanceof Error ? orphanError.message : String(orphanError),
          });
        }
      }

      const nameUpdateResult = await ProfileNameUpdateHelper.updateAndSync({
        userId,
        firstName: updates.firstName,
        lastName: updates.lastName,
        currentDisplayName: profile.displayName,
        currentFirstName: profile.firstName,
        currentLastName: profile.lastName,
      });

      const updatedProfile = {
        ...profile,
        firstName: updates.firstName || profile.firstName,
        lastName: updates.lastName || profile.lastName,
        displayName: nameUpdateResult.newDisplayName || profile.displayName,
        avatarUrl: updates.avatar || profile.avatarUrl,
        bio: updates.bio || profile.bio,
      };

      const updateData: Partial<Pick<User, 'profile' | 'email'>> = { profile: updatedProfile };
      if (updates.email && updates.email !== user.email) {
        updateData.email = updates.email.toLowerCase();
      }

      const updatedUser = await this.authRepository.updateUser(userId, updateData);

      return {
        success: true,
        user: updatedUser,
      };
    } catch (error) {
      logger.error('Failed to update user', { error: serializeError(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update user',
      };
    }
  }
}

export class UpdateUserSettingsUseCase {
  constructor(private authRepository: IAuthRepository) {}

  async execute(userId: string, settings: Record<string, unknown>): Promise<UpdateUserResponse> {
    const startTime = Date.now();
    try {
      logger.debug('UpdateUserSettingsUseCase - START', { userId, settings, startTime });

      if (!userId) {
        logger.error('UpdateUserSettingsUseCase - User ID is required');
        return { success: false, error: 'User ID is required' };
      }

      if (!settings || Object.keys(settings).length === 0) {
        logger.error('UpdateUserSettingsUseCase - No settings provided');
        return { success: false, error: 'No settings provided' };
      }

      logger.debug('UpdateUserSettingsUseCase - Before findUserById', { elapsed: Date.now() - startTime });
      const user = await this.authRepository.findUserById(userId);
      logger.debug('UpdateUserSettingsUseCase - After findUserById', {
        found: !!user,
        elapsed: Date.now() - startTime,
      });

      if (!user) {
        logger.error('UpdateUserSettingsUseCase - User not found', { userId });
        return { success: false, error: 'User not found' };
      }

      logger.debug('UpdateUserSettingsUseCase - Current user preferences (raw)', {
        preferences: user.preferences,
        type: typeof user.preferences,
      });

      let preferences: Record<string, unknown> = {};
      try {
        preferences = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences || {};
      } catch {
        preferences = {};
      }

      const mergedPreferences = { ...preferences, ...settings };
      logger.debug('UpdateUserSettingsUseCase - Merged preferences', {
        original: preferences,
        incoming: settings,
        merged: mergedPreferences,
      });

      logger.debug('UpdateUserSettingsUseCase - Before updateUser', { elapsed: Date.now() - startTime });
      const updatedUser = await this.authRepository.updateUser(userId, {
        preferences: mergedPreferences,
      });
      logger.debug('UpdateUserSettingsUseCase - After updateUser', {
        success: !!updatedUser,
        elapsed: Date.now() - startTime,
      });

      logger.debug('UpdateUserSettingsUseCase - Updated user preferences', {
        preferences: updatedUser.preferences,
        type: typeof updatedUser.preferences,
      });
      logger.debug('UpdateUserSettingsUseCase - COMPLETE - Returning success', { elapsed: Date.now() - startTime });

      return {
        success: true,
        user: updatedUser,
      };
    } catch (error) {
      logger.error('UpdateUserSettingsUseCase - EXCEPTION CAUGHT', {
        error: serializeError(error),
      });
      logger.debug('UpdateUserSettingsUseCase - ERROR', { elapsed: Date.now() - startTime });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update user settings',
      };
    }
  }
}

export class ChangePasswordUseCase {
  constructor(private authRepository: IAuthRepository) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<UpdateUserResponse> {
    try {
      if (currentPassword.length < 6 || newPassword.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters',
        };
      }

      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!passwordValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await this.authRepository.updateUser(userId, { passwordHash });

      return {
        success: true,
        user: {
          userId,
          passwordChangedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to change password',
      };
    }
  }
}

export class UpdateUserRoleUseCase {
  constructor(private authRepository: IAuthRepository) {}

  async execute(userId: string, role: UserRole): Promise<UpdateUserResponse> {
    try {
      // Only allow updating to USER role (not admin/librarian)
      // Note: Role changes for regular users should only be between user types
      // Paid/free status is handled by subscription tier, not role
      if (!isValidRole(role) || role === USER_ROLES.ADMIN || role === USER_ROLES.LIBRARIAN) {
        return {
          success: false,
          error: 'Invalid role specified. Cannot assign privileged roles via this endpoint.',
        };
      }

      const updatedUser = await this.authRepository.updateUser(userId, { role });

      return {
        success: true,
        user: updatedUser,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to update user role',
      };
    }
  }
}
