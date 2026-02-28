import type { Job } from 'bullmq';
import { createLogger, serializeError } from '@aiponge/platform-core';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { CreditRepository } from '../repositories/credit';

const logger = createLogger('orphaned-reservation-cleanup-job');

const CLEANUP_THRESHOLD_MINUTES = 30;

export interface OrphanedReservationCleanupJobData {
  triggeredAt: string;
}

export async function processOrphanedReservationCleanupJob(job: Job<OrphanedReservationCleanupJobData>): Promise<void> {
  logger.info('Processing orphaned reservation cleanup job', {
    jobId: job.id,
    triggeredAt: job.data.triggeredAt,
  });

  try {
    const db = getDatabase();
    const creditRepository = new CreditRepository(db);

    const refundedCount = await creditRepository.cleanupOrphanedReservations(CLEANUP_THRESHOLD_MINUTES);

    logger.info('Orphaned reservation cleanup completed', {
      jobId: job.id,
      refundedCount,
      thresholdMinutes: CLEANUP_THRESHOLD_MINUTES,
    });
  } catch (error) {
    logger.error('Orphaned reservation cleanup job failed', {
      jobId: job.id,
      error: serializeError(error),
    });
    throw error;
  }
}
