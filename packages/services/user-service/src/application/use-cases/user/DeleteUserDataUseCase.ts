/**
 * Delete User Data Use Case (GDPR Article 17 - Right to Erasure)
 * Handles complete user data deletion across all services
 *
 * This use case ensures GDPR compliance by:
 * 1. Deleting all user data from user-service tables
 * 2. Notifying music-service to delete user data
 * 3. Notifying ai-analytics-service to delete user data
 * 4. Notifying storage-service to delete user files
 */

import { eq } from 'drizzle-orm';
import { IAuthRepository } from '@domains/auth';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger, getServiceUrl, createServiceHttpClient } from '@config/service-urls';
import { signUserIdHeader, serializeError } from '@aiponge/platform-core';
import { UserEventPublisher } from '../../../infrastructure/events/UserEventPublisher';
import { AuthError } from '@application/errors';
import type { UserRole } from '@aiponge/shared-contracts';

const logger = getLogger('delete-user-data-use-case');
const httpClient = createServiceHttpClient('internal');

export interface DeleteUserDataDTO {
  userId: string;
  requestingUserId: string;
  requestingUserRole: UserRole;
  confirmationToken?: string;
}

export interface DeletedRecordCounts {
  // Content tables
  entryImages: number;
  entries: number;
  insights: number;
  reflections: number;
  books: number;
  chapters: number;
  bookGenerationRequests: number;
  // Analytics tables
  userPatterns: number;
  userPersonas: number;
  profileAnalytics: number;
  themeFrequencies: number;
  profileMetrics: number;
  // Notification tables
  reminders: number;
  expoPushTokens: number;
  // Consent & privacy tables
  consentRecords: number;
  importBackups: number;
  riskFlags: number;
  // Subscription tables
  subscriptions: number;
  usageLimits: number;
  subscriptionEvents: number;
  guestConversionState: number;
  guestDataMigrations: number;
  // Credit tables
  creditGifts: number;
  creditTransactions: number;
  creditOrders: number;
  userCredits: number;
  // Auth tables
  userSessions: number;
  passwordResetTokens: number;
  smsVerificationCodes: number;
  tokenBlacklist: number;
  // Audit tables
  auditLogs: number;
  // Core tables
  profile: boolean;
  user: boolean;
}

export interface ExternalServiceDeletion {
  musicService: { success: boolean; error?: string };
  analyticsService: { success: boolean; error?: string };
  storageService: { success: boolean; error?: string };
  systemService: { success: boolean; error?: string };
}

export interface DeleteUserDataResult {
  success: boolean;
  deletedUserId: string;
  deletedRecords: DeletedRecordCounts;
  externalServices: ExternalServiceDeletion;
  gdprCompliant: boolean;
  timestamp: Date;
  auditTrail: {
    requestedAt: Date;
    completedAt: Date;
    requestingUserId: string;
  };
}

export class DeleteUserDataUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(dto: DeleteUserDataDTO): Promise<DeleteUserDataResult> {
    const requestedAt = new Date();
    logger.info('GDPR Article 17: Initiating complete data deletion for user', {
      userId: dto.userId,
      requestedAt: requestedAt.toISOString(),
    });

    if (dto.requestingUserId !== dto.userId) {
      logger.warn('Unauthorized deletion attempt', {
        requestingUserId: dto.requestingUserId,
        targetUserId: dto.userId,
      });
      throw AuthError.forbidden('Cannot delete other users data');
    }

    const user = await this.authRepository.findUserById(dto.userId);
    if (!user) {
      throw AuthError.userNotFound(dto.userId);
    }

    // System accounts cannot be deleted via GDPR flows
    if (user.isSystemAccount) {
      logger.warn('Cannot delete system account via GDPR flow', { userId: dto.userId });
      throw AuthError.forbidden('System accounts cannot be deleted via GDPR data deletion requests');
    }

    // Collect library asset URLs before deletion (illustrations are cascade-deleted with books)
    const libraryAssetUrls = await this.collectLibraryAssetUrls(dto.userId);
    logger.info('GDPR: Collected library asset URLs for deletion', {
      userId: dto.userId,
      illustrationCount: libraryAssetUrls.length,
    });

    // IMPORTANT: Delete external service data FIRST to maintain cross-service referential context
    // External services may need to look up entryId, lyricsId, chapterId references while cleaning up
    logger.info('GDPR: Phase 1 - Deleting external service data first', { userId: dto.userId });
    const externalServices = await this.deleteExternalServiceData(dto.userId, libraryAssetUrls);

    // Gate local deletion on external service success to ensure GDPR cascade integrity
    // If external services fail, we must NOT delete local data (makes retries impossible)
    const externalSuccess =
      externalServices.musicService.success &&
      externalServices.analyticsService.success &&
      externalServices.storageService.success &&
      externalServices.systemService.success;

    if (!externalSuccess) {
      const failedServices = [];
      if (!externalServices.musicService.success)
        failedServices.push(`music-service: ${externalServices.musicService.error}`);
      if (!externalServices.analyticsService.success)
        failedServices.push(`analytics-service: ${externalServices.analyticsService.error}`);
      if (!externalServices.storageService.success)
        failedServices.push(`storage-service: ${externalServices.storageService.error}`);
      if (!externalServices.systemService.success)
        failedServices.push(`system-service: ${externalServices.systemService.error}`);

      logger.error('GDPR: External service deletion failed - aborting local deletion to preserve retry capability', {
        userId: dto.userId,
        failedServices,
      });

      throw AuthError.internalError(
        `GDPR deletion incomplete: external services failed (${failedServices.join('; ')}). Local data preserved for retry.`
      );
    }

    // Only proceed with user-service data deletion if ALL external services succeeded
    logger.info('GDPR: Phase 2 - Deleting user-service data (all external services succeeded)', { userId: dto.userId });
    const deletedRecords = await this.deleteAllUserServiceData(dto.userId);

    const completedAt = new Date();
    const gdprCompliant =
      deletedRecords.user &&
      externalServices.musicService.success &&
      externalServices.analyticsService.success &&
      externalServices.storageService.success &&
      externalServices.systemService.success;

    const result: DeleteUserDataResult = {
      success: true,
      deletedUserId: dto.userId,
      deletedRecords,
      externalServices,
      gdprCompliant,
      timestamp: completedAt,
      auditTrail: {
        requestedAt,
        completedAt,
        requestingUserId: dto.requestingUserId,
      },
    };

    logger.info('GDPR Article 17: User data deletion completed', {
      userId: dto.userId,
      gdprCompliant,
      deletionDurationMs: completedAt.getTime() - requestedAt.getTime(),
    });

    UserEventPublisher.userDeleted(dto.userId);

    return result;
  }

  private async deleteAllUserServiceData(userId: string): Promise<DeletedRecordCounts> {
    const db = getDatabase();

    // Import all user-service schemas
    const {
      usrProfiles,
      usrInsights,
      usrReflections,
      libBookGenerationRequests,
      usrUserPatterns,
      usrUserPersonas,
      usrProfileAnalytics,
      usrProfileThemeFrequencies,
      usrProfileMetrics,
      usrReminders,
      usrExpoPushTokens,
      usrConsentRecords,
      usrImportBackups,
      usrRiskFlags,
    } = await import('../../../infrastructure/database/schemas/profile-schema');

    // Unified library schema (books, chapters, entries)
    const { libBooks, libChapters, libEntries } =
      await import('../../../infrastructure/database/schemas/library-schema');

    // Audit logs
    const { usrAuditLogs } = await import('../../../infrastructure/database/schemas/audit-schema');

    const { usrSubscriptions, usrUsageLimits, usrSubscriptionEvents, usrGuestConversionState, usrGuestDataMigrations } =
      await import('../../../infrastructure/database/schemas/subscription-schema');

    const {
      users,
      userCredits,
      creditTransactions,
      creditOrders,
      creditGifts,
      userSessions,
      passwordResetTokens,
      smsVerificationCodes,
      tokenBlacklist,
    } = await import('../../../infrastructure/database/schemas/user-schema');

    const counts: DeletedRecordCounts = {
      // Content tables
      entryImages: 0,
      entries: 0,
      insights: 0,
      reflections: 0,
      books: 0,
      chapters: 0,
      bookGenerationRequests: 0,
      // Analytics tables
      userPatterns: 0,
      userPersonas: 0,
      profileAnalytics: 0,
      themeFrequencies: 0,
      profileMetrics: 0,
      // Notification tables
      reminders: 0,
      expoPushTokens: 0,
      // Consent & privacy tables
      consentRecords: 0,
      importBackups: 0,
      riskFlags: 0,
      // Subscription tables
      subscriptions: 0,
      usageLimits: 0,
      subscriptionEvents: 0,
      guestConversionState: 0,
      guestDataMigrations: 0,
      // Credit tables
      creditGifts: 0,
      creditTransactions: 0,
      creditOrders: 0,
      userCredits: 0,
      // Auth tables
      userSessions: 0,
      passwordResetTokens: 0,
      smsVerificationCodes: 0,
      tokenBlacklist: 0,
      // Audit tables
      auditLogs: 0,
      // Core tables
      profile: false,
      user: false,
    };

    try {
      await db.transaction(async tx => {
        const deleteAndCount = async <T>(table: T, key: keyof DeletedRecordCounts): Promise<void> => {
          // IMPORTANT: Errors are NOT swallowed - they abort the transaction immediately
          // This ensures we catch schema mismatches (wrong column names) early
          // rather than failing silently and corrupting the transaction state
          logger.debug(`Deleting from ${String(key)}`, { userId });
          const tbl = table as unknown as typeof usrReflections;
          await tx.delete(tbl).where(eq(tbl.userId, userId));
          if (typeof counts[key] === 'number') {
            (counts as unknown as Record<string, number | boolean>)[key] = 1;
          } else {
            (counts as unknown as Record<string, number | boolean>)[key] = true;
          }
        };

        // ========================================
        // DELETION ORDER: Child tables first, parent tables last
        // Respects foreign key constraints
        // ========================================

        // 1. Content tables (children first)
        await deleteAndCount(usrReflections, 'reflections');
        await deleteAndCount(usrInsights, 'insights');

        // Unified library tables - delete entries and chapters first, then books
        // libEntries and libChapters cascade via bookId, libBooks uses userId
        const deleteLibraryAndCount = async (): Promise<void> => {
          // Delete entries first (FK: book_id, chapter_id)
          await tx
            .delete(libEntries)
            .where(
              eq(
                libEntries.bookId,
                tx.select({ id: libBooks.id }).from(libBooks).where(eq(libBooks.userId, userId)) as unknown as string
              )
            )
            .catch(err => {
              logger.warn('Failed to delete library entries during user deletion', {
                userId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          // Delete chapters (FK: book_id)
          await tx
            .delete(libChapters)
            .where(
              eq(
                libChapters.bookId,
                tx.select({ id: libBooks.id }).from(libBooks).where(eq(libBooks.userId, userId)) as unknown as string
              )
            )
            .catch(err => {
              logger.warn('Failed to delete library chapters during user deletion', {
                userId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          // Delete books (uses userId, cascades entries and chapters automatically)
          const result = await tx.delete(libBooks).where(eq(libBooks.userId, userId)).returning();
          counts.books = result.length;
          counts.entries = 1;
          counts.chapters = 1;
        };
        await deleteLibraryAndCount();

        await deleteAndCount(libBookGenerationRequests, 'bookGenerationRequests');

        // 2. Analytics tables
        await deleteAndCount(usrUserPatterns, 'userPatterns');
        await deleteAndCount(usrUserPersonas, 'userPersonas');
        await deleteAndCount(usrProfileAnalytics, 'profileAnalytics');
        await deleteAndCount(usrProfileThemeFrequencies, 'themeFrequencies');
        await deleteAndCount(usrProfileMetrics, 'profileMetrics');

        // 4. Notification tables
        await deleteAndCount(usrReminders, 'reminders');
        await deleteAndCount(usrExpoPushTokens, 'expoPushTokens');

        // 5. Consent & privacy tables
        await deleteAndCount(usrConsentRecords, 'consentRecords');
        await deleteAndCount(usrImportBackups, 'importBackups');
        await deleteAndCount(usrRiskFlags, 'riskFlags');
        // NOTE: usr_data_requests intentionally NOT deleted - required for GDPR audit trail

        // 6. Subscription tables
        await deleteAndCount(usrSubscriptionEvents, 'subscriptionEvents');
        await deleteAndCount(usrUsageLimits, 'usageLimits');
        await deleteAndCount(usrSubscriptions, 'subscriptions');
        await deleteAndCount(usrGuestConversionState, 'guestConversionState');
        try {
          await tx.delete(usrGuestDataMigrations).where(eq(usrGuestDataMigrations.newUserId, userId));
          counts.guestDataMigrations = 1;
        } catch (error) {
          logger.warn('Failed to delete guest data migrations', { userId, error });
        }

        // 7. Credit tables (children first)
        // NOTE: creditGifts uses senderId/recipientId, not userId
        // It will CASCADE when usr_accounts is deleted (FK: sender_id -> users.id with onDelete: cascade)
        // Manual delete for gifts where user is the sender
        try {
          await tx.delete(creditGifts).where(eq(creditGifts.senderId, userId));
          counts.creditGifts = 1;
        } catch (error) {
          logger.warn('Failed to delete credit gifts', { userId, error });
        }
        await deleteAndCount(creditTransactions, 'creditTransactions');
        await deleteAndCount(creditOrders, 'creditOrders');
        await deleteAndCount(userCredits, 'userCredits');

        // 8. Auth tables
        await deleteAndCount(userSessions, 'userSessions');
        await deleteAndCount(passwordResetTokens, 'passwordResetTokens');
        await deleteAndCount(smsVerificationCodes, 'smsVerificationCodes');
        await deleteAndCount(tokenBlacklist, 'tokenBlacklist');

        // 9. Audit logs (user activity audit trail - deleted for full GDPR erasure)
        await deleteAndCount(usrAuditLogs, 'auditLogs');

        try {
          await tx.delete(usrProfiles).where(eq(usrProfiles.userId, userId));
          counts.profile = true;
        } catch (error) {
          logger.warn('Failed to delete profile', { userId, error });
        }

        try {
          await tx.delete(users).where(eq(users.id, userId));
          counts.user = true;
        } catch (error) {
          logger.error('Failed to delete user record', { userId, error });
          throw error;
        }
      });

      logger.info('User service data deletion completed', { userId, counts });
    } catch (error) {
      logger.error('Transaction failed during user data deletion', { userId, error });
      throw error;
    }

    return counts;
  }

  /**
   * Collect all illustration URLs for user's books before deletion
   * These need to be sent to storage-service since they're in shared paths
   */
  private async collectLibraryAssetUrls(userId: string): Promise<string[]> {
    try {
      const db = getDatabase();
      const { libBooks } = await import('../../../infrastructure/database/schemas/library-schema');
      const { libIllustrations } = await import('../../../infrastructure/database/schemas/library-schema');

      // Get all illustration URLs for books owned by this user
      const illustrations = await db
        .select({ url: libIllustrations.url, artworkUrl: libIllustrations.artworkUrl })
        .from(libIllustrations)
        .innerJoin(libBooks, eq(libIllustrations.bookId, libBooks.id))
        .where(eq(libBooks.userId, userId));

      const urls: string[] = [];
      for (const ill of illustrations) {
        if (ill.url) urls.push(ill.url);
        if (ill.artworkUrl && ill.artworkUrl !== ill.url) urls.push(ill.artworkUrl);
      }

      return urls;
    } catch (error) {
      logger.warn('Failed to collect library asset URLs', {
        userId,
        error: serializeError(error),
      });
      return [];
    }
  }

  private async deleteExternalServiceData(
    userId: string,
    libraryAssetUrls: string[] = []
  ): Promise<ExternalServiceDeletion> {
    const results: ExternalServiceDeletion = {
      musicService: { success: false },
      analyticsService: { success: false },
      storageService: { success: false },
      systemService: { success: false },
    };

    const authHeaders = signUserIdHeader(userId);
    const musicServiceUrl = getServiceUrl('music-service');
    const analyticsServiceUrl = getServiceUrl('ai-analytics-service');
    const storageServiceUrl = getServiceUrl('storage-service');
    const systemServiceUrl = getServiceUrl('system-service');

    // Step 1: Delete from music-service first (returns asset URLs for storage cleanup)
    let assetUrls: { audio: string[]; artwork: string[] } = { audio: [], artwork: [] };
    try {
      const musicUrl = `${musicServiceUrl}/api/users/${userId}/data`;
      logger.info('GDPR: Step 1 - Deleting music service data', { userId, url: musicUrl });

      const musicResponse = await httpClient.deleteWithResponse(musicUrl, {
        headers: { ...authHeaders },
        timeout: 30000,
      });

      if (musicResponse.ok) {
        const musicData = musicResponse.data as Record<string, unknown>;
        results.musicService = { success: true };

        if (musicData.assetUrls) {
          assetUrls = musicData.assetUrls as typeof assetUrls;
          logger.info('GDPR: Extracted asset URLs from music-service', {
            userId,
            audioCount: assetUrls.audio?.length || 0,
            artworkCount: assetUrls.artwork?.length || 0,
          });
        }
      } else if (musicResponse.status === 404) {
        results.musicService = { success: true };
      } else {
        const errorData =
          typeof musicResponse.data === 'string' ? musicResponse.data : JSON.stringify(musicResponse.data);
        results.musicService = { success: false, error: `HTTP ${musicResponse.status}: ${errorData}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('GDPR: Music service deletion failed', { userId, error: serializeError(error) });
      results.musicService = { success: false, error: errorMessage };
    }

    // Step 2: Delete from analytics service (parallel with storage)
    const analyticsPromise = (async () => {
      try {
        const analyticsUrl = `${analyticsServiceUrl}/api/users/${userId}/data`;
        logger.info('GDPR: Step 2a - Deleting analytics service data', { userId });

        const response = await httpClient.deleteWithResponse(analyticsUrl, {
          headers: { ...authHeaders },
          timeout: 30000,
        });

        if (response.ok || response.status === 404) {
          return { success: true };
        }
        const errorData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return { success: false, error: `HTTP ${response.status}: ${errorData}` };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    })();

    // Step 3: Delete from storage service with specific asset URLs
    // Includes: music audio/artwork URLs + library illustration URLs (book covers, etc.)
    const allAssetUrls = [...assetUrls.audio, ...assetUrls.artwork, ...libraryAssetUrls];
    const storagePromise = (async () => {
      try {
        const storageUrl = `${storageServiceUrl}/api/users/${userId}/files`;
        logger.info('GDPR: Step 2b - Deleting storage service files', {
          userId,
          musicAssetUrls: assetUrls.audio.length + assetUrls.artwork.length,
          libraryAssetUrls: libraryAssetUrls.length,
          totalAdditionalUrls: allAssetUrls.length,
        });

        const response = await httpClient.deleteWithResponse(storageUrl, {
          headers: { ...authHeaders },
          data: { additionalAssetUrls: allAssetUrls },
          timeout: 30000,
        });

        if (response.ok || response.status === 404) {
          return { success: true };
        }
        const errorData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return { success: false, error: `HTTP ${response.status}: ${errorData}` };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    })();

    // Step 4: Delete from system-service (audit logs, notifications)
    const systemPromise = (async () => {
      try {
        const systemUrl = `${systemServiceUrl}/api/users/${userId}/data`;
        logger.info('GDPR: Step 2c - Deleting system service data', { userId });

        const response = await httpClient.deleteWithResponse(systemUrl, {
          headers: { ...authHeaders },
          timeout: 30000,
        });

        if (response.ok || response.status === 404) {
          return { success: true };
        }
        const errorData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return { success: false, error: `HTTP ${response.status}: ${errorData}` };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    })();

    // Wait for analytics, storage, and system to complete
    const [analyticsResult, storageResult, systemResult] = await Promise.all([
      analyticsPromise,
      storagePromise,
      systemPromise,
    ]);
    results.analyticsService = analyticsResult;
    results.storageService = storageResult;
    results.systemService = systemResult;

    logger.info('GDPR: External service deletion completed', {
      userId,
      musicSuccess: results.musicService.success,
      analyticsSuccess: results.analyticsService.success,
      storageSuccess: results.storageService.success,
      systemSuccess: results.systemService.success,
    });

    return results;
  }
}
