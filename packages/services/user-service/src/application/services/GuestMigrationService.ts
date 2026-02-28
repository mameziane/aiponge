/**
 * Guest Migration Service
 * Handles transferring all guest user data to a newly registered account
 * Uses transactional updates to ensure data integrity
 */

import { and, eq, sql, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '../../config/service-urls';
import { users } from '../../infrastructure/database/schemas/user-schema';
import {
  usrInsights,
  usrReflections,
  usrProfiles,
  usrProfileThemeFrequencies,
  usrProfileMetrics,
  usrProfileAnalytics,
  usrUserPatterns,
  usrReminders,
  usrExpoPushTokens,
  usrConsentRecords,
  libBookGenerationRequests,
} from '../../infrastructure/database/schemas/profile-schema';
import { libBooks } from '../../infrastructure/database/schemas/library-schema';
import {
  usrSubscriptions,
  usrUsageLimits,
  usrGuestConversionState,
  usrGuestDataMigrations,
  usrSubscriptionEvents,
} from '../../infrastructure/database/schemas/subscription-schema';
import { userCredits, creditTransactions, creditOrders } from '../../infrastructure/database/schemas/user-schema';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('guest-migration-service');

export interface GuestMigrationResult {
  success: boolean;
  migrationId?: string;
  stats: {
    booksMigrated: number;
    chaptersMigrated: number;
    entriesMigrated: number;
    insightsMigrated: number;
    tracksMigrated: number;
    albumsMigrated: number;
  };
  error?: string;
}

export class GuestMigrationService {
  constructor(private readonly db: DatabaseConnection) {}

  async migrateGuestData(guestUserId: string, newUserId: string): Promise<GuestMigrationResult> {
    const stats = {
      booksMigrated: 0,
      chaptersMigrated: 0,
      entriesMigrated: 0,
      insightsMigrated: 0,
      tracksMigrated: 0,
      albumsMigrated: 0,
    };

    try {
      logger.info('Starting guest data migration', { guestUserId, newUserId });

      const [guestUser] = await this.db.select().from(users).where(eq(users.id, guestUserId));

      if (!guestUser) {
        logger.warn('Guest user not found, skipping migration', { guestUserId });
        return { success: true, stats };
      }

      if (!guestUser.isGuest) {
        logger.warn('User is not a guest, skipping migration', { guestUserId });
        return { success: true, stats };
      }

      const [migrationRecord] = await this.db
        .insert(usrGuestDataMigrations)
        .values({
          guestUserId,
          newUserId,
          status: 'in_progress',
          startedAt: new Date(),
        })
        .returning();

      try {
        const txResult = await this.db.transaction(async tx => {
          const migratedTables: string[] = [];

          const libBooksResult = await tx
            .update(libBooks)
            .set({ userId: newUserId, updatedAt: new Date() })
            .where(eq(libBooks.userId, guestUserId))
            .returning();
          stats.booksMigrated = libBooksResult.length;
          if (libBooksResult.length > 0) migratedTables.push('lib_books');

          const insightResult = await tx
            .update(usrInsights)
            .set({ userId: newUserId })
            .where(eq(usrInsights.userId, guestUserId))
            .returning();
          stats.insightsMigrated = insightResult.length;
          if (insightResult.length > 0) migratedTables.push('usr_insights');

          await tx.update(usrReflections).set({ userId: newUserId }).where(eq(usrReflections.userId, guestUserId));

          await tx
            .update(usrUserPatterns)
            .set({ userId: newUserId, updatedAt: new Date() })
            .where(eq(usrUserPatterns.userId, guestUserId));

          await tx
            .update(usrProfileThemeFrequencies)
            .set({ userId: newUserId })
            .where(eq(usrProfileThemeFrequencies.userId, guestUserId));

          await tx
            .update(usrProfileMetrics)
            .set({ userId: newUserId })
            .where(eq(usrProfileMetrics.userId, guestUserId));

          await tx
            .update(usrProfileAnalytics)
            .set({ userId: newUserId })
            .where(eq(usrProfileAnalytics.userId, guestUserId));

          await tx
            .update(libBookGenerationRequests)
            .set({ userId: newUserId })
            .where(eq(libBookGenerationRequests.userId, guestUserId));

          await tx
            .update(usrReminders)
            .set({ userId: newUserId, updatedAt: new Date() })
            .where(eq(usrReminders.userId, guestUserId));

          await tx
            .update(usrExpoPushTokens)
            .set({ userId: newUserId, updatedAt: new Date() })
            .where(eq(usrExpoPushTokens.userId, guestUserId));

          await tx
            .update(usrConsentRecords)
            .set({ userId: newUserId })
            .where(eq(usrConsentRecords.userId, guestUserId));

          await tx
            .update(usrSubscriptionEvents)
            .set({ userId: newUserId })
            .where(eq(usrSubscriptionEvents.userId, guestUserId));

          const [guestCredits] = await tx.select().from(userCredits).where(eq(userCredits.userId, guestUserId));

          if (guestCredits && (guestCredits.currentBalance > 0 || guestCredits.totalSpent > 0)) {
            const [newUserCredits] = await tx.select().from(userCredits).where(eq(userCredits.userId, newUserId));

            if (newUserCredits) {
              await tx
                .update(userCredits)
                .set({
                  currentBalance: newUserCredits.currentBalance + guestCredits.currentBalance,
                  totalSpent: newUserCredits.totalSpent + guestCredits.totalSpent,
                  updatedAt: new Date(),
                })
                .where(eq(userCredits.userId, newUserId));
            }
            migratedTables.push('usr_user_credits');
          }

          await tx
            .update(creditTransactions)
            .set({ userId: newUserId })
            .where(eq(creditTransactions.userId, guestUserId));

          await tx.update(creditOrders).set({ userId: newUserId }).where(eq(creditOrders.userId, guestUserId));

          const [guestUsage] = await tx
            .select()
            .from(usrUsageLimits)
            .where(eq(usrUsageLimits.userId, guestUserId))
            .orderBy(sql`${usrUsageLimits.createdAt} DESC`)
            .limit(1);

          if (guestUsage) {
            const [newUserUsage] = await tx
              .select()
              .from(usrUsageLimits)
              .where(eq(usrUsageLimits.userId, newUserId))
              .orderBy(sql`${usrUsageLimits.createdAt} DESC`)
              .limit(1);

            if (newUserUsage && newUserUsage.month === guestUsage.month) {
              await tx
                .update(usrUsageLimits)
                .set({
                  songsGenerated: newUserUsage.songsGenerated + guestUsage.songsGenerated,
                  lyricsGenerated: newUserUsage.lyricsGenerated + guestUsage.lyricsGenerated,
                  insightsGenerated: newUserUsage.insightsGenerated + guestUsage.insightsGenerated,
                  updatedAt: new Date(),
                })
                .where(eq(usrUsageLimits.id, newUserUsage.id));
            }
            migratedTables.push('usr_usage_limits');
          }

          await tx
            .update(usrGuestConversionState)
            .set({ converted: true, convertedAt: new Date() })
            .where(eq(usrGuestConversionState.userId, guestUserId));

          const musicMigrations = await this.migrateMusicTables(guestUserId, newUserId, tx);
          stats.tracksMigrated = musicMigrations.tracksMigrated;
          stats.albumsMigrated = musicMigrations.albumsMigrated;
          const musicMigrationErrors = musicMigrations.errors;
          const hasMusicErrors = musicMigrationErrors.length > 0;
          if (musicMigrations.tracksMigrated > 0) migratedTables.push('mus_tracks');
          if (musicMigrations.albumsMigrated > 0) migratedTables.push('mus_albums');

          if (!hasMusicErrors) {
            await this.cleanupMusicConflicts(guestUserId, newUserId, tx);
          } else {
            logger.warn('Music migration completed with errors, skipping cleanup', {
              guestUserId,
              newUserId,
              errors: musicMigrationErrors,
            });
          }

          const finalStatus = hasMusicErrors ? 'completed_with_errors' : 'completed';

          const [guestProfile] = await tx
            .select({ onboardingInitialized: usrProfiles.onboardingInitialized })
            .from(usrProfiles)
            .where(eq(usrProfiles.userId, guestUserId));

          if (guestProfile?.onboardingInitialized) {
            await tx
              .update(usrProfiles)
              .set({ onboardingInitialized: true, lastUpdated: new Date() })
              .where(eq(usrProfiles.userId, newUserId));
            logger.info('Migrated onboarding status from guest to new user', {
              guestUserId,
              newUserId,
              onboardingInitialized: true,
            });
          }

          if (!hasMusicErrors) {
            await tx.delete(usrProfiles).where(eq(usrProfiles.userId, guestUserId));

            await tx.delete(usrSubscriptions).where(eq(usrSubscriptions.userId, guestUserId));

            await tx.delete(userCredits).where(eq(userCredits.userId, guestUserId));

            await tx
              .update(users)
              .set({
                status: 'migrated',
                metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{migratedTo}', ${JSON.stringify(newUserId)}::jsonb)`,
                updatedAt: new Date(),
              })
              .where(eq(users.id, guestUserId));
          } else {
            await tx
              .update(users)
              .set({
                status: 'migration_pending',
                metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{partialMigrationTo}', ${JSON.stringify(newUserId)}::jsonb)`,
                updatedAt: new Date(),
              })
              .where(eq(users.id, guestUserId));
          }

          await tx
            .update(usrGuestDataMigrations)
            .set({
              status: finalStatus,
              migratedTables,
              booksMigrated: stats.booksMigrated,
              chaptersMigrated: stats.chaptersMigrated,
              entriesMigrated: stats.entriesMigrated,
              errorMessage: hasMusicErrors ? musicMigrationErrors.join('; ') : null,
              completedAt: new Date(),
            })
            .where(eq(usrGuestDataMigrations.id, migrationRecord.id));

          return { migratedTables, finalStatus };
        });

        logger.info('Guest data migration completed', {
          status: txResult.finalStatus,
          guestUserId,
          newUserId,
          migrationId: migrationRecord.id,
          stats,
          migratedTables: txResult.migratedTables,
        });

        return {
          success: true,
          migrationId: migrationRecord.id,
          stats,
        };
      } catch (innerError) {
        await this.db
          .update(usrGuestDataMigrations)
          .set({
            status: 'failed',
            errorMessage: innerError instanceof Error ? innerError.message : String(innerError),
          })
          .where(eq(usrGuestDataMigrations.id, migrationRecord.id));

        throw innerError;
      }
    } catch (error) {
      logger.error('Guest data migration failed', {
        guestUserId,
        newUserId,
        error: serializeError(error),
      });

      return {
        success: false,
        stats,
        error: error instanceof Error ? error.message : 'Migration failed',
      };
    }
  }

  private async migrateMusicTables(
    guestUserId: string,
    newUserId: string,
    dbOrTx: DatabaseConnection = this.db
  ): Promise<{ tracksMigrated: number; albumsMigrated: number; errors: string[] }> {
    const errors: string[] = [];
    try {
      const albumsResult = await dbOrTx.execute(sql`
        UPDATE mus_albums 
        SET user_id = ${newUserId}, updated_at = NOW()
        WHERE user_id = ${guestUserId} AND visibility = ${CONTENT_VISIBILITY.PERSONAL}
      `);
      const albumsMigrated = (albumsResult as { rowCount?: number }).rowCount ?? 0;

      const tracksResult = await dbOrTx.execute(sql`
        UPDATE mus_tracks t
        SET user_id = ${newUserId}, updated_at = NOW()
        FROM mus_albums a
        WHERE t.album_id = a.id 
          AND t.user_id = ${guestUserId}
          AND a.visibility = ${CONTENT_VISIBILITY.PERSONAL}
      `);
      const tracksMigrated = (tracksResult as { rowCount?: number }).rowCount ?? 0;

      await dbOrTx.execute(sql`
        UPDATE mus_tracks 
        SET generated_by_user_id = ${newUserId}
        WHERE generated_by_user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_lyrics 
        SET created_by_user_id = ${newUserId}
        WHERE created_by_user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_album_requests 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_song_requests 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_favorite_tracks 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
        AND NOT EXISTS (
          SELECT 1 FROM mus_favorite_tracks f2 
          WHERE f2.user_id = ${newUserId} AND f2.track_id = mus_favorite_tracks.track_id
        )
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_recently_played 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_track_feedback 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
        AND NOT EXISTS (
          SELECT 1 FROM mus_track_feedback f2 
          WHERE f2.user_id = ${newUserId} AND f2.track_id = mus_track_feedback.track_id
        )
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_playlists 
        SET user_id = ${newUserId}, updated_at = NOW()
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_playlist_followers 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
        AND NOT EXISTS (
          SELECT 1 FROM mus_playlist_followers pf2 
          WHERE pf2.user_id = ${newUserId} AND pf2.playlist_id = mus_playlist_followers.playlist_id
        )
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_playlist_activities 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_favorite_albums 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
        AND NOT EXISTS (
          SELECT 1 FROM mus_favorite_albums fa2 
          WHERE fa2.user_id = ${newUserId} AND fa2.album_id = mus_favorite_albums.album_id
        )
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_followed_creators 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
        AND NOT EXISTS (
          SELECT 1 FROM mus_followed_creators fc2 
          WHERE fc2.user_id = ${newUserId} AND fc2.creator_id = mus_followed_creators.creator_id
        )
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_stream_sessions 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_stream_analytics 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_queue_items 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_likes 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
        AND NOT EXISTS (
          SELECT 1 FROM mus_likes l2 
          WHERE l2.user_id = ${newUserId} AND l2.track_id = mus_likes.track_id
        )
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_track_analytics 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_analytics 
        SET user_id = ${newUserId}
        WHERE user_id = ${guestUserId}
      `);

      await dbOrTx.execute(sql`
        UPDATE mus_playlist_tracks 
        SET added_by = ${newUserId}
        WHERE added_by = ${guestUserId}
      `);

      logger.info('Music tables migrated successfully', {
        guestUserId,
        newUserId,
        tracksMigrated,
        albumsMigrated,
        errorCount: errors.length,
      });

      return { tracksMigrated, albumsMigrated, errors };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      logger.error('Music tables migration failed', {
        guestUserId,
        newUserId,
        error: errorMsg,
      });
      return { tracksMigrated: 0, albumsMigrated: 0, errors };
    }
  }

  /**
   * Cleanup duplicate/conflict rows from music tables after successful migration.
   * This is separated from migration to allow cleanup only on full success.
   */
  private async cleanupMusicConflicts(
    guestUserId: string,
    newUserId: string,
    dbOrTx: DatabaseConnection = this.db
  ): Promise<void> {
    try {
      await dbOrTx.execute(sql`
        DELETE FROM mus_favorite_tracks 
        WHERE user_id = ${guestUserId}
        AND EXISTS (
          SELECT 1 FROM mus_favorite_tracks f2 
          WHERE f2.user_id = ${newUserId} AND f2.track_id = mus_favorite_tracks.track_id
        )
      `);

      await dbOrTx.execute(sql`
        DELETE FROM mus_track_feedback 
        WHERE user_id = ${guestUserId}
        AND EXISTS (
          SELECT 1 FROM mus_track_feedback f2 
          WHERE f2.user_id = ${newUserId} AND f2.track_id = mus_track_feedback.track_id
        )
      `);

      await dbOrTx.execute(sql`
        DELETE FROM mus_playlist_followers 
        WHERE user_id = ${guestUserId}
        AND EXISTS (
          SELECT 1 FROM mus_playlist_followers pf2 
          WHERE pf2.user_id = ${newUserId} AND pf2.playlist_id = mus_playlist_followers.playlist_id
        )
      `);

      await dbOrTx.execute(sql`
        DELETE FROM mus_favorite_albums 
        WHERE user_id = ${guestUserId}
        AND EXISTS (
          SELECT 1 FROM mus_favorite_albums fa2 
          WHERE fa2.user_id = ${newUserId} AND fa2.album_id = mus_favorite_albums.album_id
        )
      `);

      await dbOrTx.execute(sql`
        DELETE FROM mus_followed_creators 
        WHERE user_id = ${guestUserId}
        AND EXISTS (
          SELECT 1 FROM mus_followed_creators fc2 
          WHERE fc2.user_id = ${newUserId} AND fc2.creator_id = mus_followed_creators.creator_id
        )
      `);

      await dbOrTx.execute(sql`
        DELETE FROM mus_likes 
        WHERE user_id = ${guestUserId}
        AND EXISTS (
          SELECT 1 FROM mus_likes l2 
          WHERE l2.user_id = ${newUserId} AND l2.track_id = mus_likes.track_id
        )
      `);

      logger.info('Music conflict cleanup completed', {
        guestUserId,
        newUserId,
      });
    } catch (error) {
      logger.error('Music conflict cleanup failed', {
        guestUserId,
        newUserId,
        error: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Retry a partial migration that completed with errors.
   * This method can be called from a background job or admin interface
   * to complete cleanup for migrations that had errors.
   */
  async retryMigrationCleanup(guestUserId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const status = await this.getMigrationStatus(guestUserId);

    if (!status.needsRetry || !status.newUserId) {
      return {
        success: false,
        error: 'Migration does not need retry or new user ID not found',
      };
    }

    try {
      await this.cleanupMusicConflicts(guestUserId, status.newUserId);

      await this.db.delete(usrProfiles).where(eq(usrProfiles.userId, guestUserId));
      await this.db.delete(usrSubscriptions).where(eq(usrSubscriptions.userId, guestUserId));
      await this.db.delete(userCredits).where(eq(userCredits.userId, guestUserId));

      await this.db
        .update(users)
        .set({
          status: 'migrated',
          metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{migratedTo}', ${JSON.stringify(status.newUserId)}::jsonb)`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, guestUserId));

      await this.db
        .update(usrGuestDataMigrations)
        .set({
          status: 'completed',
          errorMessage: null,
          completedAt: new Date(),
        })
        .where(eq(usrGuestDataMigrations.guestUserId, guestUserId));

      logger.info('Migration cleanup retry completed successfully', {
        guestUserId,
        newUserId: status.newUserId,
      });

      return { success: true };
    } catch (error) {
      logger.error('Migration cleanup retry failed', {
        guestUserId,
        error: serializeError(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Retry failed',
      };
    }
  }

  /**
   * Find migrations that need retry for a given new user.
   * Used by login flow to auto-retry partial migrations.
   */
  async findPendingMigrationForUser(newUserId: string): Promise<{ guestUserId: string } | null> {
    const [migration] = await this.db
      .select({ guestUserId: usrGuestDataMigrations.guestUserId })
      .from(usrGuestDataMigrations)
      .where(
        and(eq(usrGuestDataMigrations.newUserId, newUserId), eq(usrGuestDataMigrations.status, 'completed_with_errors'))
      )
      .limit(1);

    return migration ?? null;
  }

  async getMigrationStatus(guestUserId: string): Promise<{
    migrated: boolean;
    status?: 'completed' | 'completed_with_errors' | 'pending' | 'failed';
    needsRetry?: boolean;
    newUserId?: string;
    migratedAt?: Date;
    errorMessage?: string;
  }> {
    const [migration] = await this.db
      .select()
      .from(usrGuestDataMigrations)
      .where(eq(usrGuestDataMigrations.guestUserId, guestUserId))
      .orderBy(sql`${usrGuestDataMigrations.createdAt} DESC`)
      .limit(1);

    if (!migration) {
      return { migrated: false };
    }

    if (migration.status === 'completed') {
      return {
        migrated: true,
        status: 'completed',
        needsRetry: false,
        newUserId: migration.newUserId,
        migratedAt: migration.completedAt ?? undefined,
      };
    }

    if (migration.status === 'completed_with_errors') {
      return {
        migrated: true,
        status: 'completed_with_errors',
        needsRetry: true,
        newUserId: migration.newUserId,
        migratedAt: migration.completedAt ?? undefined,
        errorMessage: migration.errorMessage ?? undefined,
      };
    }

    return {
      migrated: false,
      status: migration.status === 'failed' ? 'failed' : 'pending',
      needsRetry: migration.status === 'failed',
      errorMessage: migration.errorMessage ?? undefined,
    };
  }
}
