/**
 * User Profile Entity
 * Domain entity representing a user's profile
 */

export interface UserProfile {
  userId: string;
  displayName: string;
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
  };
  socialLinks?: Record<string, string>;
  contactPreferences?: Record<string, boolean>;
  visibilitySettings?: Record<string, unknown>;
  verificationInfo?: {
    isVerified: boolean;
    verificationBadges: string[];
    trustScore: number;
  };
  tags?: string[];
  metadata?: {
    source?: string;
    migrationVersion?: string;
    customFields?: Record<string, unknown>;
    features?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export class UserProfileHelper {
  static create(userId: string, displayName: string, options?: Partial<UserProfile>): UserProfile {
    return {
      userId,
      displayName,
      bio: options?.bio,
      avatar: options?.avatar,
      personalInfo: options?.personalInfo || {},
      socialLinks: options?.socialLinks || {},
      contactPreferences: options?.contactPreferences || {},
      visibilitySettings: options?.visibilitySettings || {},
      verificationInfo: options?.verificationInfo || {
        isVerified: false,
        verificationBadges: [],
        trustScore: 50,
      },
      tags: options?.tags || [],
      metadata: options?.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static updateSocialLinks(profile: UserProfile, socialLinks: Record<string, string>): UserProfile {
    return {
      ...profile,
      socialLinks: { ...profile.socialLinks, ...socialLinks },
      updatedAt: new Date(),
    };
  }

  static updateContactPreferences(profile: UserProfile, preferences: Record<string, boolean>): UserProfile {
    return {
      ...profile,
      contactPreferences: { ...profile.contactPreferences, ...preferences },
      updatedAt: new Date(),
    };
  }

  static updatePrivacySettings(profile: UserProfile, settings: Record<string, unknown>): UserProfile {
    return {
      ...profile,
      visibilitySettings: { ...profile.visibilitySettings, ...settings },
      updatedAt: new Date(),
    };
  }

  static addInterest(profile: UserProfile, interest: string): UserProfile {
    const interests = profile.personalInfo?.interests || [];
    if (!interests.includes(interest)) {
      return {
        ...profile,
        personalInfo: {
          ...profile.personalInfo,
          interests: [...interests, interest],
        },
        updatedAt: new Date(),
      };
    }
    return profile;
  }

  static addTag(profile: UserProfile, tag: string): UserProfile {
    const tags = profile.tags || [];
    if (!tags.includes(tag)) {
      return {
        ...profile,
        tags: [...tags, tag],
        updatedAt: new Date(),
      };
    }
    return profile;
  }

  static calculateCompletionScore(profile: UserProfile): number {
    let score = 0;
    const weights = {
      displayName: 10,
      bio: 10,
      avatar: 10,
      personalInfo: 20,
      socialLinks: 15,
      contactPreferences: 10,
      visibilitySettings: 10,
      tags: 15,
    };

    if (profile.displayName) score += weights.displayName;
    if (profile.bio) score += weights.bio;
    if (profile.avatar) score += weights.avatar;
    if (profile.personalInfo && Object.keys(profile.personalInfo).length > 0) {
      score += weights.personalInfo;
    }
    if (profile.socialLinks && Object.keys(profile.socialLinks).length > 0) {
      score += weights.socialLinks;
    }
    if (profile.contactPreferences && Object.keys(profile.contactPreferences).length > 0) {
      score += weights.contactPreferences;
    }
    if (profile.visibilitySettings && Object.keys(profile.visibilitySettings).length > 0) {
      score += weights.visibilitySettings;
    }
    if (profile.tags && profile.tags.length > 0) score += weights.tags;

    return score;
  }

  static calculateIsComplete(profile: UserProfile): boolean {
    return UserProfileHelper.calculateCompletionScore(profile) >= 70;
  }

  static updateActivity(profile: UserProfile): UserProfile {
    return {
      ...profile,
      updatedAt: new Date(),
    };
  }
}
