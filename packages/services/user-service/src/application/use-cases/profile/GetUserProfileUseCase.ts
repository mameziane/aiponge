/**
 * Get User Profile Use Case - Profile Service
 * Handles comprehensive user profile retrieval combining basic profile data with derived insights
 */

import { IProfileRepository } from '@domains/profile';
import { IEntryRepository } from '@domains/profile';
import { getLogger } from '@config/service-urls';
import { ProfileError } from '@application/errors';
import { PROFILE_VISIBILITY, USER_STATUS, type ProfileVisibility } from '@aiponge/shared-contracts';

const logger = getLogger('user-service-getuserprofileusecase');

interface PersonalInfo {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  location?: string;
  timezone?: string;
  language?: string;
}

interface SocialLinks {
  website?: string;
  twitter?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
}

interface ContactPreferences {
  allowDirectMessages: boolean;
  allowFollowRequests: boolean;
  allowTagging: boolean;
  allowMentions: boolean;
  allowComments: boolean;
  marketingEmails: boolean;
  newsletterSubscription: boolean;
  eventNotifications: boolean;
}

interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  showEmail: boolean;
  showPhone: boolean;
  showLocation: boolean;
  showAge: boolean;
  showBirthdate: boolean;
  showLastSeen: boolean;
  allowSearchEngineIndexing: boolean;
}

interface VerificationInfo {
  isVerified: boolean;
  verificationBadges: string[];
  trustScore: number;
  verifiedAt?: Date;
}

interface EntryPattern {
  type: string;
  name: string;
  frequency: number;
  confidence: number;
  examples?: string[];
}

interface GrowthMetrics {
  overallGrowth?: number;
  weeklyProgress?: number;
  monthlyProgress?: number;
  streakDays?: number;
  lastActivityDate?: Date;
}

export interface UserProfileResponse {
  id: string;
  userId: string;
  basicProfile: {
    displayName: string;
    bio?: string;
    avatar?: string;
    type: string;
    status: string;
    personalInfo: PersonalInfo;
    socialLinks: SocialLinks;
    contactPreferences: ContactPreferences;
    visibilitySettings: PrivacySettings;
    verificationInfo: VerificationInfo;
    isComplete: boolean;
    completionScore: number;
  };
  analytics: {
    totalInsights: number;
    totalReflections: number;
    totalEntries: number;
    dominantThemes: string[];
    entryPatterns: EntryPattern[];
    growthMetrics: GrowthMetrics;
  };
  lastUpdated: Date;
  createdAt: Date;
}

export interface GetUserProfileRequest {
  userId: string;
  includeAnalytics?: boolean;
  includePensiveData?: boolean;
}

export class GetUserProfileUseCase {
  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository
  ) {}

  async execute(request: GetUserProfileRequest): Promise<UserProfileResponse | null> {
    logger.info('🔍 Getting comprehensive profile for user: {}', { data0: request.userId });

    try {
      // Get basic profile data
      const basicProfile = await this.profileRepository.getProfile(request.userId);
      if (!basicProfile) {
        logger.info('Basic profile not found for user: {}', { data0: request.userId });
        return null;
      }

      // Get profile summary with analytics
      const profileSummary = await this.profileRepository.getProfileSummary(request.userId);

      // Get actual user info including displayName from user entity
      const userInfo = await this.profileRepository.getUserBasicInfo(request.userId);
      const displayName = userInfo?.profile?.name || `User ${request.userId.substring(0, 8)}`;

      // Build the response
      const response: UserProfileResponse = {
        id: basicProfile.userId,
        userId: basicProfile.userId,
        basicProfile: {
          displayName,
          type: 'standard',
          status: USER_STATUS.ACTIVE,
          personalInfo: {},
          socialLinks: {},
          contactPreferences: {
            allowDirectMessages: true,
            allowFollowRequests: true,
            allowTagging: true,
            allowMentions: true,
            allowComments: true,
            marketingEmails: false,
            newsletterSubscription: false,
            eventNotifications: true,
          },
          visibilitySettings: {
            profileVisibility: PROFILE_VISIBILITY.PUBLIC,
            showEmail: false,
            showPhone: false,
            showLocation: true,
            showAge: true,
            showBirthdate: false,
            showLastSeen: true,
            allowSearchEngineIndexing: true,
          },
          verificationInfo: {
            isVerified: false,
            verificationBadges: [],
            trustScore: 50,
          },
          isComplete: true,
          completionScore: 85,
        },
        analytics: {
          totalInsights: basicProfile.totalInsights || 0,
          totalReflections: basicProfile.totalReflections || 0,
          totalEntries: basicProfile.totalEntries || 0,
          dominantThemes: profileSummary?.topThemes?.map(t => t.theme) || [],
          entryPatterns: [],
          growthMetrics: {
            overallGrowth: profileSummary?.growthMetrics?.totalInsights || 0,
            weeklyProgress: 0,
            monthlyProgress: 0,
            streakDays: 0,
          },
        },
        lastUpdated: basicProfile.lastUpdated,
        createdAt: basicProfile.createdAt,
      };

      logger.info('Successfully retrieved comprehensive profile for user: {}', { data0: request.userId });
      return response;
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      logger.error('Failed to get user profile: {}', { data0: error });
      throw ProfileError.internalError('Failed to retrieve user profile', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Get simplified profile for quick access
   */
  async getBasicProfile(userId: string): Promise<{
    userId: string;
    totalInsights: number | null;
    totalReflections: number | null;
    totalEntries: number | null;
    lastUpdated: Date | null;
    createdAt: Date | null;
  } | null> {
    const basicProfile = await this.profileRepository.getProfile(userId);
    if (!basicProfile) {
      return null;
    }

    return {
      userId: basicProfile.userId,
      totalInsights: basicProfile.totalInsights,
      totalReflections: basicProfile.totalReflections,
      totalEntries: basicProfile.totalEntries,
      lastUpdated: basicProfile.lastUpdated,
      createdAt: basicProfile.createdAt,
    };
  }

  /**
   * Get profile with analytics aggregated from entries and insights
   */
  async getProfileWithAnalytics(userId: string): Promise<UserProfileResponse | null> {
    return this.execute({
      userId,
      includeAnalytics: true,
      includePensiveData: true,
    });
  }
}
