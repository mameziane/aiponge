import type { Job } from 'bullmq';
import { createLogger, serializeError } from '@aiponge/platform-core';
import { AuthError } from '../../application/errors/errors';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { GuestMigrationService } from '../../application/services/GuestMigrationService';
import { usrGuestDataMigrations } from '../database/schemas/subscription-schema';
import { eq } from 'drizzle-orm';

const logger = createLogger('migration-retry-job');

export interface MigrationRetryJobData {
  triggeredAt: string;
}

export async function processMigrationRetryJob(job: Job<MigrationRetryJobData>): Promise<void> {
  logger.info('Processing migration retry job', {
    jobId: job.id,
    triggeredAt: job.data.triggeredAt,
  });

  const stats = { processed: 0, succeeded: 0, failed: 0 };

  try {
    const db = getDatabase();
    const guestMigrationService = new GuestMigrationService(db);

    const pendingMigrations = await db
      .select({
        guestUserId: usrGuestDataMigrations.guestUserId,
        newUserId: usrGuestDataMigrations.newUserId,
      })
      .from(usrGuestDataMigrations)
      .where(eq(usrGuestDataMigrations.status, 'completed_with_errors'))
      .limit(10);

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations to retry', { jobId: job.id });
      return;
    }

    for (const migration of pendingMigrations) {
      stats.processed++;
      try {
        const result = await guestMigrationService.retryMigrationCleanup(migration.guestUserId);
        if (result.success) {
          stats.succeeded++;
        } else {
          stats.failed++;
        }
      } catch (error) {
        stats.failed++;
        logger.error('Migration retry threw error', {
          guestUserId: migration.guestUserId,
          error: serializeError(error),
        });
      }
    }

    logger.info('Migration retry job completed', {
      jobId: job.id,
      ...stats,
    });

    if (stats.failed > 0) {
      throw AuthError.internalError(`${stats.failed} migration(s) failed during retry`);
    }
  } catch (error) {
    logger.error('Migration retry job failed', {
      jobId: job.id,
      stats,
      error: serializeError(error),
    });
    throw error;
  }
}
