/**
 * Update Profile Use Case - Profile Service
 * Handles general profile updates with simplified interface
 */

import { IProfileRepository } from '@domains/profile';
import { Profile } from '@infrastructure/database/schemas/profile-schema';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('update-profile-use-case');

export interface UpdateProfileRequest {
  userId: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string;
  preferences?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  interests?: string[];
  goals?: string[];
  location?: string;
  timezone?: string;
  language?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  profile?: Profile;
  error?: string;
}

export class UpdateProfileUseCase {
  constructor(private readonly profileRepository: IProfileRepository) {}

  async execute(request: UpdateProfileRequest): Promise<UpdateProfileResponse> {
    try {
      logger.info('Updating profile for user', { userId: request.userId });

      if (!request.userId) {
        return { success: false, error: 'User ID is required' };
      }

      let existingProfile = await this.profileRepository.findProfileByUserId(request.userId);

      if (!existingProfile) {
        existingProfile = await this.profileRepository.createProfile({
          userId: request.userId,
        });
      }

      await this.profileRepository.updateProfile(request.userId, request);

      const updatedProfile = await this.profileRepository.findProfileByUserId(request.userId);

      logger.info('Successfully updated profile for user', { userId: request.userId });

      return {
        success: true,
        profile: updatedProfile,
      };
    } catch (error) {
      logger.error('Failed to update profile', { error: serializeError(error) });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Profile update failed',
      };
    }
  }

  async updatePreferences(userId: string, preferences: Record<string, unknown>): Promise<UpdateProfileResponse> {
    return this.execute({ userId, preferences });
  }

  async updateSettings(userId: string, settings: Record<string, unknown>): Promise<UpdateProfileResponse> {
    return this.execute({ userId, settings });
  }

  async updateGoals(userId: string, goals: string[]): Promise<UpdateProfileResponse> {
    return this.execute({ userId, goals });
  }
}
