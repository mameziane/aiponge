/**
 * Pattern Repository Implementation
 * Handles storage and retrieval of user patterns and theme frequencies
 *
 * SECURITY: All content is encrypted at rest using AES-256-GCM
 * via the EncryptionService. Content is decrypted on retrieval.
 */

import { eq, sql, and, desc, gte, lte, inArray, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  usrUserPatterns,
  usrProfileThemeFrequencies,
  usrProfileMetrics,
  UserPattern,
  NewUserPattern,
  ThemeFrequency,
  NewThemeFrequency,
} from '../database/schemas/profile-schema';
import { libBooks, libEntries } from '../database/schemas/library-schema';
import { encryptionService } from '../services/EncryptionService';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('pattern-repository');

export interface EntryForAnalysis {
  id: string;
  userId: string;
  content: string;
  type: string;
  moodContext: string | null;
  sentiment: string | null;
  emotionalIntensity: number | null;
  tags: string[];
  createdAt: Date;
}

export interface PatternInsight {
  patternType: 'emotional' | 'temporal' | 'thematic' | 'behavioral';
  patternName: string;
  description: string;
  frequency: number;
  strength: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  relatedThemes: string[];
  triggerFactors: string[];
}

export interface IPatternRepository {
  getUserEntries(userId: string, fromDate?: Date, toDate?: Date): Promise<EntryForAnalysis[]>;
  getUserPatterns(userId: string, activeOnly?: boolean): Promise<UserPattern[]>;
  getPatternsByType(userId: string, patternType: string): Promise<UserPattern[]>;
  upsertPattern(pattern: NewUserPattern): Promise<UserPattern>;
  updatePatternStrength(patternId: string, strength: number, trend: string): Promise<void>;
  deactivatePattern(patternId: string): Promise<void>;
  getThemeFrequencies(userId: string): Promise<ThemeFrequency[]>;
  upsertThemeFrequency(userId: string, theme: string): Promise<ThemeFrequency>;
  getAllUsersWithEntries(minEntries?: number): Promise<string[]>;
  upsertMetrics(userId: string, period: string, insightCount: number, uniqueThemes: string[]): Promise<unknown>;
}

export class PatternRepository implements IPatternRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private decryptContent(content: string): string {
    if (!content) return content;
    return encryptionService.decrypt(content);
  }

  async getUserEntries(userId: string, fromDate?: Date, toDate?: Date): Promise<EntryForAnalysis[]> {
    // First get all book IDs for this user
    const userBooks = await this.db
      .select({ id: libBooks.id })
      .from(libBooks)
      .where(and(eq(libBooks.userId, userId), isNull(libBooks.deletedAt)));

    if (userBooks.length === 0) {
      return [];
    }

    const bookIds = userBooks.map(b => b.id);

    const query = this.db
      .select({
        id: libEntries.id,
        userId: libBooks.userId,
        content: libEntries.content,
        type: libEntries.entryType,
        moodContext: libEntries.moodContext,
        sentiment: libEntries.sentiment,
        emotionalIntensity: libEntries.emotionalIntensity,
        tags: libEntries.tags,
        createdAt: libEntries.createdAt,
      })
      .from(libEntries)
      .innerJoin(libBooks, eq(libEntries.bookId, libBooks.id))
      .where(and(inArray(libEntries.bookId, bookIds), isNull(libEntries.deletedAt)))
      .orderBy(desc(libEntries.createdAt));

    const results = await query;

    return results
      .filter(t => {
        if (fromDate && t.createdAt < fromDate) return false;
        if (toDate && t.createdAt > toDate) return false;
        return true;
      })
      .map(t => ({
        ...t,
        content: this.decryptContent(t.content),
        tags: t.tags || [],
      }));
  }

  async getUserPatterns(userId: string, activeOnly = true): Promise<UserPattern[]> {
    const conditions = activeOnly
      ? and(eq(usrUserPatterns.userId, userId), eq(usrUserPatterns.isActive, true), isNull(usrUserPatterns.deletedAt))
      : and(eq(usrUserPatterns.userId, userId), isNull(usrUserPatterns.deletedAt));

    return this.db.select().from(usrUserPatterns).where(conditions).orderBy(desc(usrUserPatterns.strength));
  }

  async getPatternsByType(userId: string, patternType: string): Promise<UserPattern[]> {
    return this.db
      .select()
      .from(usrUserPatterns)
      .where(
        and(
          eq(usrUserPatterns.userId, userId),
          eq(usrUserPatterns.patternType, patternType),
          isNull(usrUserPatterns.deletedAt)
        )
      )
      .orderBy(desc(usrUserPatterns.strength));
  }

  async upsertPattern(pattern: NewUserPattern): Promise<UserPattern> {
    const existing = await this.db
      .select()
      .from(usrUserPatterns)
      .where(
        and(
          sql`${usrUserPatterns.userId} = ${pattern.userId} 
              AND ${usrUserPatterns.patternType} = ${pattern.patternType} 
              AND ${usrUserPatterns.patternName} = ${pattern.patternName}`,
          isNull(usrUserPatterns.deletedAt)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const incomingFreq = (pattern.frequency ?? 1) as number;
      const existingFreq = (existing[0].frequency ?? 1) as number;
      const newFrequency = Math.max(incomingFreq, existingFreq);

      const [updated] = await this.db
        .update(usrUserPatterns)
        .set({
          frequency: newFrequency,
          strength: pattern.strength,
          trend: pattern.trend,
          description: pattern.description,
          lastObserved: new Date(),
          relatedThemes: pattern.relatedThemes,
          triggerFactors: pattern.triggerFactors,
          evidenceEntryIds: pattern.evidenceEntryIds ?? existing[0].evidenceEntryIds,
          updatedAt: new Date(),
        })
        .where(and(eq(usrUserPatterns.id, existing[0].id), isNull(usrUserPatterns.deletedAt)))
        .returning();

      logger.debug('Pattern updated', {
        patternId: updated.id,
        patternName: pattern.patternName,
        previousFrequency: existingFreq,
        newFrequency: updated.frequency,
      });
      return updated;
    }

    const insertData: NewUserPattern = {
      ...pattern,
      frequency: pattern.frequency ?? 1,
      firstObserved: new Date(),
      lastObserved: new Date(),
      isActive: true,
    };

    const [created] = await this.db.insert(usrUserPatterns).values(insertData).returning();

    logger.info('New pattern detected', {
      userId: pattern.userId,
      patternType: pattern.patternType,
      patternName: pattern.patternName,
    });
    return created;
  }

  async updatePatternStrength(patternId: string, strength: number, trend: string): Promise<void> {
    await this.db
      .update(usrUserPatterns)
      .set({
        strength: strength.toString(),
        trend,
        lastObserved: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(usrUserPatterns.id, patternId), isNull(usrUserPatterns.deletedAt)));
  }

  async deactivatePattern(patternId: string): Promise<void> {
    await this.db
      .update(usrUserPatterns)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(usrUserPatterns.id, patternId), isNull(usrUserPatterns.deletedAt)));

    logger.info('Pattern deactivated', { patternId });
  }

  async getThemeFrequencies(userId: string): Promise<ThemeFrequency[]> {
    return this.db
      .select()
      .from(usrProfileThemeFrequencies)
      .where(eq(usrProfileThemeFrequencies.userId, userId))
      .orderBy(desc(usrProfileThemeFrequencies.count));
  }

  async upsertThemeFrequency(userId: string, theme: string): Promise<ThemeFrequency> {
    const normalizedTheme = theme.toLowerCase().trim();

    const existing = await this.db
      .select()
      .from(usrProfileThemeFrequencies)
      .where(and(eq(usrProfileThemeFrequencies.userId, userId), eq(usrProfileThemeFrequencies.theme, normalizedTheme)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await this.db
        .update(usrProfileThemeFrequencies)
        .set({
          count: (existing[0].count || 0) + 1,
          lastSeen: new Date(),
        })
        .where(eq(usrProfileThemeFrequencies.id, existing[0].id))
        .returning();

      return updated;
    }

    const insertData: NewThemeFrequency = {
      userId,
      theme: normalizedTheme,
      count: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
    };

    const [created] = await this.db.insert(usrProfileThemeFrequencies).values(insertData).returning();

    logger.debug('New theme tracked', { userId, theme: normalizedTheme });
    return created;
  }

  async getAllUsersWithEntries(minEntries = 5): Promise<string[]> {
    // Get users with entries via their books
    const results = await this.db
      .select({
        userId: libBooks.userId,
        count: sql<number>`count(${libEntries.id})`.as('count'),
      })
      .from(libBooks)
      .innerJoin(libEntries, eq(libEntries.bookId, libBooks.id))
      .where(and(isNull(libBooks.deletedAt), isNull(libEntries.deletedAt)))
      .groupBy(libBooks.userId)
      .having(sql`count(*) >= ${minEntries as number}`);

    return results.map(r => r.userId);
  }

  async upsertMetrics(userId: string, period: string, insightCount: number, uniqueThemes: string[]): Promise<unknown> {
    const existing = await this.db
      .select()
      .from(usrProfileMetrics)
      .where(and(eq(usrProfileMetrics.userId, userId), eq(usrProfileMetrics.period, period)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await this.db
        .update(usrProfileMetrics)
        .set({
          insightCount,
          uniqueThemes,
        })
        .where(eq(usrProfileMetrics.id, existing[0].id))
        .returning();

      logger.debug('Profile metrics updated', { userId, period, insightCount });
      return updated;
    }

    const [created] = await this.db
      .insert(usrProfileMetrics)
      .values({
        userId,
        period,
        insightCount,
        uniqueThemes,
      })
      .returning();

    logger.info('Profile metrics created', { userId, period, insightCount });
    return created;
  }
}
