import { BaseScheduler, SchedulerExecutionResult, SchedulerRegistry, QueueManager } from '@aiponge/platform-core';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { CreditRepository } from '../repositories/credit';
import type { OrphanedReservationCleanupJobData } from '../jobs/orphanedReservationCleanupProcessor';

const CLEANUP_THRESHOLD_MINUTES = 30;

export const ORPHANED_RESERVATION_CLEANUP_QUEUE = 'orphaned-reservation-cleanup';

export class OrphanedReservationCleanupScheduler extends BaseScheduler {
  get name(): string {
    return 'orphaned-reservation-cleanup';
  }

  get serviceName(): string {
    return 'user-service';
  }

  constructor() {
    super({
      cronExpression: '*/10 * * * *',
      enabled: true,
      maxRetries: 1,
      timeoutMs: 60000,
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const now = new Date();
    const correlationId = `orphaned-cleanup-${now.getTime()}`;

    const jobData: OrphanedReservationCleanupJobData = {
      triggeredAt: now.toISOString(),
    };

    if (QueueManager.isInitialized()) {
      const jobId = await QueueManager.enqueue<OrphanedReservationCleanupJobData>(
        ORPHANED_RESERVATION_CLEANUP_QUEUE,
        'cleanup-orphaned-reservations',
        jobData,
        { jobId: correlationId }
      );

      if (jobId) {
        return {
          success: true,
          message: `Enqueued orphaned reservation cleanup job ${jobId}`,
          data: { jobId, correlationId, mode: 'distributed' },
          durationMs: 0,
        };
      }

      this.logger.warn('Failed to enqueue, falling back to direct execution');
    }

    const db = getDatabase();
    const creditRepository = new CreditRepository(db);
    const refundedCount = await creditRepository.cleanupOrphanedReservations(CLEANUP_THRESHOLD_MINUTES);

    return {
      success: true,
      message:
        refundedCount > 0
          ? `Cleaned up ${refundedCount} orphaned credit reservation(s) older than ${CLEANUP_THRESHOLD_MINUTES} minutes`
          : 'No orphaned reservations found',
      data: { refundedCount, thresholdMinutes: CLEANUP_THRESHOLD_MINUTES, mode: 'direct' },
      durationMs: 0,
      noOp: refundedCount === 0,
    };
  }
}

export const orphanedReservationCleanupScheduler = new OrphanedReservationCleanupScheduler();
SchedulerRegistry.register(orphanedReservationCleanupScheduler);
