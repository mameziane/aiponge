/**
 * Profile Repository Implementation
 */

import { eq, desc, and, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  IProfileRepository,
  BasicProfile,
  ProfileSummary,
  PublicMemberStats,
} from '../../domains/profile/repositories/IProfileRepository';
import { usrProfileThemeFrequencies } from '../database/schemas/profile-schema';
import { Profile, NewProfile, usrProfiles } from '../database/schemas/profile-schema';
import { users } from '../database/schemas/user-schema';
import { getLogger } from '../../config/service-urls';
import { sql } from 'drizzle-orm';
import { ProfileError } from '../../application/errors/errors';

const logger = getLogger('profile-repository');

export class ProfileRepository implements IProfileRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createProfile(profileData: NewProfile): Promise<Profile> {
    const [profile] = await this.db.insert(usrProfiles).values(profileData).returning();
    logger.info('Profile created', { userId: profile.userId });
    return profile;
  }

  async findProfileByUserId(userId: string): Promise<Profile | null> {
    const [profile] = await this.db
      .select()
      .from(usrProfiles)
      .where(and(eq(usrProfiles.userId, userId), isNull(usrProfiles.deletedAt)));
    return profile || null;
  }

  async updateProfile(userId: string, data: Partial<Profile>): Promise<Profile> {
    const [profile] = await this.db
      .update(usrProfiles)
      .set({ ...data, lastUpdated: new Date() })
      .where(and(eq(usrProfiles.userId, userId), isNull(usrProfiles.deletedAt)))
      .returning();

    if (!profile) throw ProfileError.notFound('Profile', userId);
    return profile;
  }

  async incrementInsights(userId: string): Promise<void> {
    await this.db
      .update(usrProfiles)
      .set({
        totalInsights: sql`${usrProfiles.totalInsights} + 1`,
        lastUpdated: new Date(),
      })
      .where(and(eq(usrProfiles.userId, userId), isNull(usrProfiles.deletedAt)));
  }

  async incrementReflections(userId: string): Promise<void> {
    await this.db
      .update(usrProfiles)
      .set({
        totalReflections: sql`${usrProfiles.totalReflections} + 1`,
        lastUpdated: new Date(),
      })
      .where(and(eq(usrProfiles.userId, userId), isNull(usrProfiles.deletedAt)));
  }

  async incrementEntries(userId: string): Promise<void> {
    await this.db
      .update(usrProfiles)
      .set({
        totalEntries: sql`${usrProfiles.totalEntries} + 1`,
        lastUpdated: new Date(),
      })
      .where(and(eq(usrProfiles.userId, userId), isNull(usrProfiles.deletedAt)));
  }

  async getProfile(userId: string): Promise<BasicProfile | null> {
    const [profile] = await this.db
      .select()
      .from(usrProfiles)
      .where(and(eq(usrProfiles.userId, userId), isNull(usrProfiles.deletedAt)))
      .limit(1);

    if (!profile) return null;

    return {
      userId: profile.userId,
      totalInsights: profile.totalInsights,
      totalReflections: profile.totalReflections,
      totalEntries: profile.totalEntries,
      lastUpdated: profile.lastUpdated,
      createdAt: profile.createdAt,
    };
  }

  async getProfileSummary(userId: string): Promise<ProfileSummary | null> {
    const profile = await this.getProfile(userId);

    if (!profile) {
      return null;
    }

    const themeFrequencies = await this.db
      .select()
      .from(usrProfileThemeFrequencies)
      .where(eq(usrProfileThemeFrequencies.userId, userId))
      .orderBy(desc(usrProfileThemeFrequencies.count))
      .limit(10);

    const topThemes = themeFrequencies.map(tf => ({
      theme: tf.theme,
      count: tf.count,
    }));

    return {
      userId,
      topThemes,
      growthMetrics: {
        totalInsights: profile.totalInsights,
        totalReflections: profile.totalReflections,
        totalEntries: profile.totalEntries,
      },
    };
  }

  async getPublicMemberStats(userId: string): Promise<PublicMemberStats | null> {
    const profile = await this.findProfileByUserId(userId);

    if (!profile) return null;

    return {
      userId,
      totalInsights: profile.totalInsights,
      totalReflections: profile.totalReflections,
      totalEntries: profile.totalEntries,
    };
  }

  async getUserBasicInfo(userId: string): Promise<{ email?: string; profile?: { name?: string } } | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) return null;
    const userProfile = user.profile as Record<string, unknown> | null;
    return {
      email: user.email,
      profile: userProfile ? { name: (userProfile.name as string) ?? undefined } : undefined,
    };
  }
}
