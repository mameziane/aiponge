/**
 * Export User Data Use Case (GDPR Article 20 - Right to Data Portability)
 * Generates a structured export of all user data in a commonly used format
 */

import { eq, and, isNull, or } from 'drizzle-orm';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger, getServiceUrl, createServiceHttpClient } from '@config/service-urls';
import { signUserIdHeader, serializeError } from '@aiponge/platform-core';
import { EncryptionService } from '@infrastructure/services';
import { AuthError } from '@application/errors';
import type { UserCredits, CreditTransaction, CreditOrder, CreditGift } from '@infrastructure/database/schemas/user-schema';
import type { ConsentRecord } from '@infrastructure/database/schemas/profile-schema';

const logger = getLogger('export-user-data-use-case');
const httpClient = createServiceHttpClient('internal');

export interface ExportUserDataDTO {
  userId: string;
  requestingUserId: string;
  format?: 'json' | 'csv';
  includeMusic?: boolean;
  includeAnalytics?: boolean;
}

export interface ExportedUserData {
  exportVersion: string;
  exportDate: string;
  userId: string;
  profile: {
    email: string;
    createdAt: string;
    preferences: Record<string, unknown>;
    deletedAt?: string;
  };
  credits: {
    balance: {
      currentBalance: number;
      totalSpent: number;
      startingBalance: number;
    };
    transactions: Array<{
      id: string;
      amount: number;
      type: string;
      status: string;
      description: string;
      createdAt: string;
      deletedAt?: string;
    }>;
    orders: Array<{
      id: string;
      productType: string;
      productId: string;
      creditsGranted: number;
      amountPaid: number;
      currency: string;
      status: string;
      createdAt: string;
      completedAt?: string;
      deletedAt?: string;
    }>;
    gifts: Array<{
      id: string;
      creditsAmount: number;
      recipientEmail: string;
      message?: string;
      status: string;
      direction: 'sent' | 'received';
      expiresAt: string;
      claimedAt?: string;
      createdAt: string;
      deletedAt?: string;
    }>;
  };
  library: {
    books: Array<{
      id: string;
      title: string;
      description?: string;
      createdAt: string;
      deletedAt?: string;
    }>;
    chapters: Array<{
      id: string;
      bookId: string;
      title: string;
      description?: string;
      sortOrder: number;
      createdAt: string;
      deletedAt?: string;
    }>;
    entries: Array<{
      id: string;
      content: string;
      type: string;
      moodContext?: string;
      createdAt: string;
      deletedAt?: string;
    }>;
  };
  reflections: Array<{
    id: string;
    challengeQuestion: string;
    userResponse: string;
    isBreakthrough: boolean;
    engagementLevel: number;
    createdAt: string;
    deletedAt?: string;
  }>;
  reminders: Array<{
    id: string;
    reminderType: string;
    title: string;
    enabled: boolean;
    timeOfDay: string;
    repeatType: string;
    daysOfWeek?: number[];
    createdAt: string;
    deletedAt?: string;
  }>;
  subscriptions: Array<{
    id: string;
    subscriptionTier: string;
    status: string;
    platform?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    createdAt: string;
    deletedAt?: string;
  }>;
  insights: Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    category?: string;
    createdAt: string;
    deletedAt?: string;
  }>;
  music?: {
    playlists: Array<{
      id: string;
      name: string;
      trackCount: number;
      createdAt: string;
    }>;
    favorites: Array<{
      trackId: string;
      addedAt: string;
    }>;
    generatedTracks: Array<{
      id: string;
      title: string;
      createdAt: string;
    }>;
  };
  files?: {
    metadata: Array<Record<string, unknown>>;
  };
  activity?: {
    activityLogs: Array<{
      eventType: string;
      timestamp: string;
    }>;
  };
  consents: Array<{
    purpose: string;
    consentGiven: boolean;
    policyVersion: string;
    source: string;
    withdrawnAt?: string;
    createdAt: string;
    deletedAt?: string;
  }>;
}

export interface ExportUserDataResult {
  success: boolean;
  data?: ExportedUserData;
  format: string;
  sizeBytes?: number;
  error?: string;
  timestamp: Date;
}

export class ExportUserDataUseCase {
  private encryptionService = EncryptionService.getInstance();

  async execute(dto: ExportUserDataDTO): Promise<ExportUserDataResult> {
    const startTime = Date.now();
    logger.info('GDPR Article 20: Starting user data export', { userId: dto.userId });

    if (dto.requestingUserId !== dto.userId) {
      logger.warn('Unauthorized export attempt', {
        requestingUserId: dto.requestingUserId,
        targetUserId: dto.userId,
      });
      throw AuthError.forbidden('Cannot export other users data');
    }

    try {
      const db = getDatabase();

      const { users, userCredits, creditTransactions, creditOrders, creditGifts } =
        await import('../../../infrastructure/database/schemas/user-schema');
      const { usrProfiles, usrInsights, usrConsentRecords, usrReflections, usrReminders } =
        await import('../../../infrastructure/database/schemas/profile-schema');
      const { libBooks, libChapters, libEntries } =
        await import('../../../infrastructure/database/schemas/library-schema');
      const { usrSubscriptions } = await import('../../../infrastructure/database/schemas/subscription-schema');

      const [user] = await db.select().from(users).where(eq(users.id, dto.userId));
      if (!user) {
        throw AuthError.userNotFound(dto.userId);
      }

      if (user.isSystemAccount) {
        logger.warn('Cannot export system account data via GDPR flow', { userId: dto.userId });
        throw AuthError.forbidden('System accounts cannot be exported via GDPR data portability requests');
      }

      const [profile] = await db.select().from(usrProfiles).where(eq(usrProfiles.userId, dto.userId));
      const books = await db.select().from(libBooks).where(eq(libBooks.userId, dto.userId));
      const bookIds = books.map(b => b.id);
      const { inArray } = await import('drizzle-orm');
      const chapters = await db.select().from(libChapters).where(eq(libChapters.userId, dto.userId));
      const entries =
        bookIds.length > 0 ? await db.select().from(libEntries).where(inArray(libEntries.bookId, bookIds)) : [];
      const insights = await db.select().from(usrInsights).where(eq(usrInsights.userId, dto.userId));

      const reflections = await db.select().from(usrReflections).where(eq(usrReflections.userId, dto.userId));
      const reminders = await db.select().from(usrReminders).where(eq(usrReminders.userId, dto.userId));
      const subscriptions = await db.select().from(usrSubscriptions).where(eq(usrSubscriptions.userId, dto.userId));

      let credits: UserCredits[] = [];
      try {
        credits = await db.select().from(userCredits).where(eq(userCredits.userId, dto.userId));
      } catch (error) {
        logger.warn('Credits table query failed', { userId: dto.userId, error: serializeError(error) });
      }

      let transactions: CreditTransaction[] = [];
      try {
        transactions = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, dto.userId));
      } catch (error) {
        logger.warn('Credit transactions query failed', { userId: dto.userId, error: serializeError(error) });
      }

      let orders: CreditOrder[] = [];
      try {
        orders = await db.select().from(creditOrders).where(eq(creditOrders.userId, dto.userId));
      } catch (error) {
        logger.warn('Credit orders query failed', { userId: dto.userId, error: serializeError(error) });
      }

      let gifts: CreditGift[] = [];
      try {
        gifts = await db
          .select()
          .from(creditGifts)
          .where(or(eq(creditGifts.senderId, dto.userId), eq(creditGifts.recipientId, dto.userId)));
      } catch (error) {
        logger.warn('Credit gifts query failed', { userId: dto.userId, error: serializeError(error) });
      }

      let consentRecords: ConsentRecord[] = [];
      try {
        consentRecords = await db.select().from(usrConsentRecords).where(eq(usrConsentRecords.userId, dto.userId));
      } catch (error) {
        logger.warn('Consent records table may not exist yet', {
          userId: dto.userId,
          error: serializeError(error),
        });
      }

      const decryptedEntries = entries.map(t => ({
        id: t.id,
        content: this.decryptContent(t.content),
        type: t.entryType || 'general',
        moodContext: t.moodContext || undefined,
        createdAt: t.createdAt?.toISOString() || new Date().toISOString(),
        deletedAt: t.deletedAt?.toISOString() || undefined,
      }));

      const decryptedInsights = insights.map(i => ({
        id: i.id,
        title: i.title,
        content: this.decryptContent(i.content),
        type: i.type,
        category: i.category || undefined,
        createdAt: i.createdAt?.toISOString() || new Date().toISOString(),
        deletedAt: i.deletedAt?.toISOString() || undefined,
      }));

      const creditBalance = credits.length > 0 ? credits[0] : null;

      const exportData: ExportedUserData = {
        exportVersion: '1.0',
        exportDate: new Date().toISOString(),
        userId: dto.userId,
        profile: {
          email: user.email,
          createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
          preferences:
            typeof user.preferences === 'string'
              ? (() => {
                  try {
                    return JSON.parse(user.preferences as string);
                  } catch {
                    return {};
                  }
                })()
              : user.preferences || {},
          deletedAt: user.deletedAt?.toISOString() || undefined,
        },
        credits: {
          balance: {
            currentBalance: creditBalance?.currentBalance ?? 0,
            totalSpent: creditBalance?.totalSpent ?? 0,
            startingBalance: creditBalance?.startingBalance ?? 0,
          },
          transactions: transactions.map(t => ({
            id: t.id,
            amount: t.amount,
            type: t.type,
            status: t.status,
            description: t.description,
            createdAt: t.createdAt?.toISOString() || new Date().toISOString(),
            deletedAt: t.deletedAt?.toISOString() || undefined,
          })),
          orders: orders.map(o => ({
            id: o.id,
            productType: o.productType,
            productId: o.productId,
            creditsGranted: o.creditsGranted,
            amountPaid: o.amountPaid,
            currency: o.currency,
            status: o.status,
            createdAt: o.createdAt?.toISOString() || new Date().toISOString(),
            completedAt: o.completedAt?.toISOString() || undefined,
            deletedAt: o.deletedAt?.toISOString() || undefined,
          })),
          gifts: gifts.map(g => ({
            id: g.id,
            creditsAmount: g.creditsAmount,
            recipientEmail: g.recipientEmail,
            message: g.message || undefined,
            status: g.status,
            direction: (g.senderId === dto.userId ? 'sent' : 'received') as 'sent' | 'received',
            expiresAt: g.expiresAt?.toISOString() || new Date().toISOString(),
            claimedAt: g.claimedAt?.toISOString() || undefined,
            createdAt: g.createdAt?.toISOString() || new Date().toISOString(),
            deletedAt: g.deletedAt?.toISOString() || undefined,
          })),
        },
        library: {
          books: books.map(b => ({
            id: b.id,
            title: b.title,
            description: b.description || undefined,
            createdAt: b.createdAt?.toISOString() || new Date().toISOString(),
            deletedAt: b.deletedAt?.toISOString() || undefined,
          })),
          chapters: chapters.map(c => ({
            id: c.id,
            bookId: c.bookId,
            title: c.title,
            description: c.description || undefined,
            sortOrder: c.sortOrder,
            createdAt: c.createdAt?.toISOString() || new Date().toISOString(),
            deletedAt: c.deletedAt?.toISOString() || undefined,
          })),
          entries: decryptedEntries,
        },
        reflections: reflections.map(r => ({
          id: r.id,
          challengeQuestion: r.challengeQuestion,
          userResponse: this.decryptContent(r.userResponse),
          isBreakthrough: r.isBreakthrough ?? false,
          engagementLevel: r.engagementLevel ?? 0,
          createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
          deletedAt: r.deletedAt?.toISOString() || undefined,
        })),
        reminders: reminders.map(r => ({
          id: r.id,
          reminderType: r.reminderType,
          title: r.title,
          enabled: r.enabled,
          timeOfDay: r.timeOfDay,
          repeatType: r.repeatType,
          daysOfWeek: r.daysOfWeek || undefined,
          createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
          deletedAt: r.deletedAt?.toISOString() || undefined,
        })),
        subscriptions: subscriptions.map(s => ({
          id: s.id,
          subscriptionTier: s.subscriptionTier,
          status: s.status,
          platform: s.platform || undefined,
          currentPeriodStart: s.currentPeriodStart?.toISOString() || undefined,
          currentPeriodEnd: s.currentPeriodEnd?.toISOString() || undefined,
          createdAt: s.createdAt?.toISOString() || new Date().toISOString(),
          deletedAt: s.deletedAt?.toISOString() || undefined,
        })),
        insights: decryptedInsights,
        consents: consentRecords.map(c => ({
          purpose: c.purpose,
          consentGiven: c.consentGiven,
          policyVersion: c.policyVersion,
          source: c.source,
          withdrawnAt: c.withdrawnAt?.toISOString() || undefined,
          createdAt: c.createdAt?.toISOString() || new Date().toISOString(),
          deletedAt: c.deletedAt?.toISOString() || undefined,
        })),
      };

      if (dto.includeMusic !== false) {
        try {
          const musicData = await this.fetchMusicData(dto.userId);
          if (musicData) {
            exportData.music = musicData;
          }
        } catch (error) {
          logger.warn('Failed to fetch music data for export', {
            userId: dto.userId,
            error: serializeError(error),
          });
        }
      }

      if (dto.includeAnalytics !== false) {
        try {
          const analyticsData = await this.fetchAnalyticsData(dto.userId);
          if (analyticsData) {
            exportData.activity = analyticsData;
          }
        } catch (error) {
          logger.warn('Failed to fetch analytics data for export', {
            userId: dto.userId,
            error: serializeError(error),
          });
        }
      }

      try {
        const storageData = await this.fetchStorageData(dto.userId);
        if (storageData) {
          exportData.files = storageData;
        }
      } catch (error) {
        logger.warn('Failed to fetch storage data for export', {
          userId: dto.userId,
          error: serializeError(error),
        });
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const sizeBytes = Buffer.byteLength(jsonString, 'utf8');

      logger.info('GDPR Article 20: User data export completed', {
        userId: dto.userId,
        durationMs: Date.now() - startTime,
        sizeBytes,
        entryCount: entries.length,
        insightCount: insights.length,
        reflectionCount: reflections.length,
        reminderCount: reminders.length,
        subscriptionCount: subscriptions.length,
        chapterCount: chapters.length,
      });

      return {
        success: true,
        data: exportData,
        format: dto.format || 'json',
        sizeBytes,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('GDPR Article 20: User data export failed', {
        userId: dto.userId,
        error: serializeError(error),
      });
      return {
        success: false,
        format: dto.format || 'json',
        error: error instanceof Error ? error.message : 'Export failed',
        timestamp: new Date(),
      };
    }
  }

  private decryptContent(content: string | null): string {
    if (!content) return '';
    if (content.startsWith('ENC:')) {
      try {
        return this.encryptionService.decrypt(content);
      } catch {
        return '[encrypted content - decryption failed]';
      }
    }
    return content;
  }

  private async fetchMusicData(userId: string): Promise<ExportedUserData['music'] | null> {
    const authHeaders = signUserIdHeader(userId);
    const musicServiceUrl = getServiceUrl('music-service');

    try {
      const response = await httpClient.getWithResponse(`${musicServiceUrl}/api/users/${userId}/export`, {
        headers: { ...authHeaders },
        timeout: 30000,
      });

      if (response.ok) {
        return (response.data as Record<string, unknown>).musicData as ExportedUserData['music'] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchAnalyticsData(userId: string): Promise<ExportedUserData['activity'] | null> {
    const authHeaders = signUserIdHeader(userId);
    const analyticsServiceUrl = getServiceUrl('ai-analytics-service');

    try {
      const response = await httpClient.getWithResponse(`${analyticsServiceUrl}/api/users/${userId}/export`, {
        headers: { ...authHeaders },
        timeout: 30000,
      });

      if (response.ok) {
        return (response.data as Record<string, unknown>).analyticsData as ExportedUserData['activity'] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchStorageData(userId: string): Promise<ExportedUserData['files'] | null> {
    const authHeaders = signUserIdHeader(userId);
    const storageServiceUrl = getServiceUrl('storage-service');

    try {
      const response = await httpClient.getWithResponse(`${storageServiceUrl}/api/users/${userId}/export`, {
        headers: { ...authHeaders },
        timeout: 30000,
      });

      if (response.ok) {
        return { metadata: ((response.data as Record<string, unknown>).metadata as Record<string, unknown>[]) || [] };
      }
      return null;
    } catch {
      return null;
    }
  }
}
