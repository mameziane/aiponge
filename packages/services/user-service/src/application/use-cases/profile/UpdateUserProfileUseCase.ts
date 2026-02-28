/**
 * Update User Profile Use Case - Profile Service
 * Handles comprehensive user profile updates with analytics recalculation
 */

import { IProfileRepository } from '@domains/profile';
import { UserProfile, UserProfileHelper } from '@domains/profile/entities/UserProfile';
import { getLogger } from '@config/service-urls';
import { ProfileNameUpdateHelper } from '../../services/ProfileNameUpdateHelper';
import { type ProfileVisibility } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('user-service-updateuserprofileusecase');

export interface UpdateUserProfileRequest {
  userId: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  coverArtworkUrl?: string;
  personalInfo?: {
    genderIdentity?: string;
    pronouns?: string;
    relationshipStatus?: string;
    occupation?: string;
    education?: string;
    languages?: string[];
    interests?: string[];
    hobbies?: string[];
  };
  locationInfo?: {
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    timezone?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    };
  };
  socialLinks?: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    facebook?: string;
    youtube?: string;
    tiktok?: string;
    custom?: Record<string, string>;
  };
  contactPreferences?: {
    allowDirectMessages?: boolean;
    allowFollowRequests?: boolean;
    allowTagging?: boolean;
    allowMentions?: boolean;
    allowComments?: boolean;
    marketingEmails?: boolean;
    newsletterSubscription?: boolean;
    eventNotifications?: boolean;
  };
  visibilitySettings?: {
    profileVisibility?: ProfileVisibility;
    showEmail?: boolean;
    showPhone?: boolean;
    showLocation?: boolean;
    showAge?: boolean;
    showBirthdate?: boolean;
    showLastSeen?: boolean;
    allowSearchEngineIndexing?: boolean;
    customVisibilityRules?: Record<string, string>;
  };
  tags?: string[];
  metadata?: {
    source?: string;
    migrationVersion?: string;
    customFields?: Record<string, unknown>;
    features?: string[];
    experiments?: Record<string, unknown>;
    analyticsId?: string;
  };
}

export interface UpdateUserProfileResponse {
  success: boolean;
  profile?: UserProfile;
  completionScore?: number;
  error?: string;
}

export class UpdateUserProfileUseCase {
  constructor(private readonly profileRepository: IProfileRepository) {}

  async execute(request: UpdateUserProfileRequest): Promise<UpdateUserProfileResponse> {
    try {
      logger.info('📝 Updating user profile: {}', { data0: request.userId });

      // Get existing profile or create basic one
      let existingProfile = await this.profileRepository.getProfile(request.userId);
      if (!existingProfile) {
        existingProfile = await this.profileRepository.createProfile({
          userId: request.userId,
          totalInsights: 0,
          totalReflections: 0,
        });
      }

      // Build UserProfile entity for response (in-memory representation)
      const userProfile = UserProfileHelper.create(request.userId, request.displayName || `User ${request.userId}`, {
        bio: request.bio,
        personalInfo: request.personalInfo,
        visibilitySettings: request.visibilitySettings,
        metadata: request.metadata,
      });

      // Update social links if provided
      let updatedProfile = userProfile;
      if (request.socialLinks) {
        const filteredSocialLinks: Record<string, string> = {};
        Object.entries(request.socialLinks).forEach(([key, value]) => {
          if (typeof value === 'string') {
            filteredSocialLinks[key] = value;
          }
        });
        updatedProfile = UserProfileHelper.updateSocialLinks(updatedProfile, filteredSocialLinks);
      }

      // Update contact preferences if provided
      if (request.contactPreferences) {
        updatedProfile = UserProfileHelper.updateContactPreferences(updatedProfile, request.contactPreferences);
      }

      // Update privacy settings if provided
      if (request.visibilitySettings) {
        updatedProfile = UserProfileHelper.updatePrivacySettings(updatedProfile, request.visibilitySettings);
      }

      // Add interests
      if (request.personalInfo?.interests) {
        for (const interest of request.personalInfo.interests) {
          updatedProfile = UserProfileHelper.addInterest(updatedProfile, interest);
        }
      }

      // Add tags
      if (request.tags) {
        for (const tag of request.tags) {
          updatedProfile = UserProfileHelper.addTag(updatedProfile, tag);
        }
      }

      // Calculate new completion score
      const completionScore = UserProfileHelper.calculateCompletionScore(updatedProfile);
      const isComplete = UserProfileHelper.calculateIsComplete(updatedProfile);

      // Update activity
      updatedProfile = UserProfileHelper.updateActivity(updatedProfile);

      // NOTE: Extended profile fields are NOT persisted to database (schema limitation).
      // Only displayName is synced via ProfileNameUpdateHelper below.
      // To persist extended fields, the database schema would need to be expanded.
      logger.warn('Profile update: extended fields (bio, socialLinks, etc.) are in-memory only - not persisted', {
        userId: request.userId,
        hasExtendedFields: !!(request.bio || request.socialLinks || request.visibilitySettings),
      });

      logger.info('Successfully updated user profile: {} (completion: {}%)', {
        data0: request.userId,
        data1: completionScore,
      });

      if (request.displayName) {
        await ProfileNameUpdateHelper.updateAndSync({
          userId: request.userId,
          displayName: request.displayName,
        });
      }

      return {
        success: true,
        profile: updatedProfile,
        completionScore,
      };
    } catch (error) {
      logger.error('Failed to update user profile: {}', { data0: error });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Update specific profile sections
   */
  async updateBasicInfo(
    userId: string,
    basicInfo: { displayName?: string; bio?: string; avatar?: string }
  ): Promise<UpdateUserProfileResponse> {
    return this.execute({
      userId,
      ...basicInfo,
    });
  }

  async updatePersonalInfo(
    userId: string,
    personalInfo: UpdateUserProfileRequest['personalInfo']
  ): Promise<UpdateUserProfileResponse> {
    return this.execute({
      userId,
      personalInfo,
    });
  }

  async updatePrivacySettings(
    userId: string,
    visibilitySettings: UpdateUserProfileRequest['visibilitySettings']
  ): Promise<UpdateUserProfileResponse> {
    return this.execute({
      userId,
      visibilitySettings,
    });
  }

  async updateSocialLinks(
    userId: string,
    socialLinks: UpdateUserProfileRequest['socialLinks']
  ): Promise<UpdateUserProfileResponse> {
    return this.execute({
      userId,
      socialLinks,
    });
  }

  /**
   * Increment profile view count
   * NOTE: Not implemented - repository doesn't have view count column
   * To implement: Add viewCount column to usrProfiles table and repository method
   */
  async incrementViewCount(userId: string): Promise<void> {
    // NOT IMPLEMENTED: usrProfiles schema doesn't include viewCount column
    // This is a no-op that logs a warning - view counts are not tracked
    logger.warn('incrementViewCount not implemented - view count not tracked', {
      userId,
      method: 'incrementViewCount',
      reason: 'usrProfiles schema missing viewCount column',
    });
  }

  /**
   * Verify user profile
   * NOTE: Not implemented - verification system not yet built
   * To implement: Add verification table and integrate with identity verification service
   */
  async verifyProfile(
    userId: string,
    method: string,
    source?: string,
    badges: string[] = []
  ): Promise<UpdateUserProfileResponse> {
    // NOT IMPLEMENTED: Profile verification requires identity verification service integration
    // Returns success=false to indicate verification cannot be completed
    logger.warn('verifyProfile not implemented - verification system not built', {
      userId,
      method: 'verifyProfile',
      verificationMethod: method,
      reason: 'Identity verification service integration required',
    });

    return {
      success: false,
      error: 'Profile verification is not yet available',
    };
  }
}
