/**
 * Profile Repository Interface
 */

import { Profile, NewProfile } from '@domains/profile/types';

export interface BasicProfile {
  userId: string;
  totalInsights: number;
  totalReflections: number;
  totalEntries: number;
  lastUpdated: Date;
  createdAt: Date;
}

export interface ProfileSummary {
  userId: string;
  topThemes?: Array<{ theme: string; count: number }>;
  growthMetrics?: {
    totalInsights: number;
    totalReflections: number;
    totalEntries: number;
  };
}

export interface PublicMemberStats {
  userId: string;
  totalInsights: number;
  totalReflections: number;
  totalEntries: number;
}

export interface IProfileRepository {
  createProfile(profile: NewProfile): Promise<Profile>;
  findProfileByUserId(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, data: Partial<Profile>): Promise<Profile>;

  getProfile(userId: string): Promise<BasicProfile | null>;
  getProfileSummary(userId: string): Promise<ProfileSummary | null>;
  incrementInsights(userId: string): Promise<void>;
  incrementReflections(userId: string): Promise<void>;
  incrementEntries(userId: string): Promise<void>;
  getPublicMemberStats(userId: string): Promise<PublicMemberStats | null>;
  getUserBasicInfo(userId: string): Promise<{ email?: string; profile?: { name?: string } } | null>;
}
