import {
  BaseScheduler,
  SchedulerExecutionResult,
  SchedulerRegistry,
  QueueManager,
  serializeError,
} from '@aiponge/platform-core';
import { GuestMigrationService } from '../../application/services/GuestMigrationService';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { usrGuestDataMigrations } from '../database/schemas/subscription-schema';
import { eq } from 'drizzle-orm';
import type { MigrationRetryJobData } from '../jobs/migrationRetryProcessor';

export const MIGRATION_RETRY_QUEUE = 'migration-retry';

export class MigrationRetryScheduler extends BaseScheduler {
  get name(): string {
    return 'migration-retry';
  }

  get serviceName(): string {
    return 'user-service';
  }

  constructor() {
    super({
      cronExpression: '0 */4 * * *',
      enabled: true,
      maxRetries: 1,
      timeoutMs: 300000,
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const now = new Date();
    const correlationId = `migration-retry-${now.getTime()}`;

    const jobData: MigrationRetryJobData = {
      triggeredAt: now.toISOString(),
    };

    if (QueueManager.isInitialized()) {
      const jobId = await QueueManager.enqueue<MigrationRetryJobData>(
        MIGRATION_RETRY_QUEUE,
        'retry-failed-migrations',
        jobData,
        { jobId: correlationId }
      );

      if (jobId) {
        return {
          success: true,
          message: `Enqueued migration retry job ${jobId}`,
          data: { jobId, correlationId, mode: 'distributed' },
          durationMs: 0,
        };
      }

      this.logger.warn('Failed to enqueue, falling back to direct execution');
    }

    const stats = { processed: 0, succeeded: 0, failed: 0 };

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
      return {
        success: true,
        message: 'No pending migrations to retry',
        data: { ...stats, mode: 'direct' },
        durationMs: 0,
        noOp: true,
      };
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
        this.logger.error('Migration retry threw error', {
          guestUserId: migration.guestUserId,
          error: serializeError(error),
        });
      }
    }

    return {
      success: stats.failed === 0,
      message: `Processed ${stats.processed} migrations: ${stats.succeeded} succeeded, ${stats.failed} failed`,
      data: { ...stats, mode: 'direct' },
      durationMs: 0,
    };
  }
}

export const migrationRetryScheduler = new MigrationRetryScheduler();
SchedulerRegistry.register(migrationRetryScheduler);
