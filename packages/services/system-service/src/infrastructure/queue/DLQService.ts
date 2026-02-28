import { createLogger, type DLQHandler, type PrometheusMetrics, STANDARD_METRICS } from '@aiponge/platform-core';
import { eq, and, lt, sql } from 'drizzle-orm';
import { DLQ_STATUS } from '@aiponge/shared-contracts';

const logger = createLogger('dlq-service');

export class DLQService {
  private metrics: PrometheusMetrics | null = null;

  setMetricsInstance(metrics: PrometheusMetrics): void {
    this.metrics = metrics;
  }

  private async emitDepthGauges(): Promise<void> {
    if (!this.metrics) return;
    try {
      const depths = await this.getDepthByStatus();
      for (const [status, count] of Object.entries(depths)) {
        this.metrics.setGauge(STANDARD_METRICS.DLQ_ITEMS_TOTAL, count, { status });
      }
    } catch {
      // best-effort metric emission
    }
  }

  private getDb() {
    const { DatabaseConnectionFactory } = require('../database/DatabaseConnectionFactory');
    const dbFactory = DatabaseConnectionFactory.getInstance();
    return dbFactory.getConnection('system-service').db;
  }

  private getSchema() {
    return require('../../schema/system-schema').sysDeadLetterQueue;
  }

  createDLQHandler(): DLQHandler {
    return async data => {
      try {
        const db = this.getDb();
        const sysDeadLetterQueue = this.getSchema();

        await db.insert(sysDeadLetterQueue).values({
          queueName: data.queueName,
          jobId: data.jobId,
          jobName: data.jobName,
          payload: data.payload,
          errorMessage: data.errorMessage,
          errorStack: data.errorStack,
          attemptsMade: data.attemptsMade,
          maxAttempts: data.maxAttempts,
          status: 'failed',
        });

        logger.warn('Job moved to DLQ', {
          queueName: data.queueName,
          jobId: data.jobId,
          jobName: data.jobName,
          attemptsMade: data.attemptsMade,
        });

        this.emitDepthGauges();
      } catch (error) {
        logger.error('Failed to insert into DLQ (fire-and-forget)', {
          queueName: data.queueName,
          jobId: data.jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
  }

  async listItems(options?: {
    status?: string;
    queueName?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: unknown[]; total: number }> {
    try {
      const db = this.getDb();
      const sysDeadLetterQueue = this.getSchema();

      const conditions = [];
      if (options?.status) {
        conditions.push(eq(sysDeadLetterQueue.status, options.status));
      }
      if (options?.queueName) {
        conditions.push(eq(sysDeadLetterQueue.queueName, options.queueName));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const items = await db
        .select()
        .from(sysDeadLetterQueue)
        .where(whereClause)
        .orderBy(sql`${sysDeadLetterQueue.createdAt} DESC`)
        .limit(options?.limit || 50)
        .offset(options?.offset || 0);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sysDeadLetterQueue)
        .where(whereClause);

      return { items, total: countResult?.count || 0 };
    } catch (error) {
      logger.error('Failed to list DLQ items', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { items: [], total: 0 };
    }
  }

  async retryItem(
    dlqId: string,
    queueManager: {
      getQueue(
        name: string
      ): { add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown> } | undefined;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = this.getDb();
      const sysDeadLetterQueue = this.getSchema();

      const [entry] = await db.select().from(sysDeadLetterQueue).where(eq(sysDeadLetterQueue.id, dlqId));
      if (!entry) {
        return { success: false, error: 'DLQ entry not found' };
      }

      if (entry.status !== 'failed') {
        return { success: false, error: `Cannot retry entry with status "${entry.status}"` };
      }

      const queue = queueManager.getQueue(entry.queueName);
      if (!queue) {
        return { success: false, error: `Queue "${entry.queueName}" not registered` };
      }

      await queue.add(entry.jobName || 'dlq-retry', entry.payload, {
        attempts: entry.maxAttempts,
        backoff: { type: 'exponential', delay: 2000 },
      });

      await db
        .update(sysDeadLetterQueue)
        .set({ status: 'retried', retriedAt: new Date() })
        .where(eq(sysDeadLetterQueue.id, dlqId));

      logger.info('DLQ item retried', { dlqId, queueName: entry.queueName, jobName: entry.jobName });
      this.emitDepthGauges();
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retry DLQ item', { dlqId, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  async resolveItem(dlqId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = this.getDb();
      const sysDeadLetterQueue = this.getSchema();

      const [entry] = await db.select().from(sysDeadLetterQueue).where(eq(sysDeadLetterQueue.id, dlqId));
      if (!entry) {
        return { success: false, error: 'DLQ entry not found' };
      }

      await db
        .update(sysDeadLetterQueue)
        .set({ status: DLQ_STATUS.RESOLVED, resolvedAt: new Date() })
        .where(eq(sysDeadLetterQueue.id, dlqId));

      logger.info('DLQ item resolved', { dlqId, queueName: entry.queueName, jobName: entry.jobName });
      this.emitDepthGauges();
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to resolve DLQ item', { dlqId, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  async cleanupResolved(olderThanDays: number = 7): Promise<number> {
    try {
      const db = this.getDb();
      const sysDeadLetterQueue = this.getSchema();

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);

      const result = await db
        .delete(sysDeadLetterQueue)
        .where(and(eq(sysDeadLetterQueue.status, DLQ_STATUS.RESOLVED), lt(sysDeadLetterQueue.resolvedAt!, cutoff)))
        .returning({ id: sysDeadLetterQueue.id });

      const deleted = result.length;
      if (deleted > 0) {
        logger.info('DLQ resolved cleanup completed', { deleted, olderThanDays });
        this.metrics?.incrementCounter(STANDARD_METRICS.DLQ_ITEMS_CLEANED, { status: 'resolved' }, deleted);
        this.emitDepthGauges();
      }
      return deleted;
    } catch (error) {
      logger.error('Failed to cleanup resolved DLQ entries', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  async cleanupFailed(olderThanDays: number = 30): Promise<number> {
    try {
      const db = this.getDb();
      const sysDeadLetterQueue = this.getSchema();

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);

      const result = await db
        .delete(sysDeadLetterQueue)
        .where(and(eq(sysDeadLetterQueue.status, 'failed'), lt(sysDeadLetterQueue.createdAt, cutoff)))
        .returning({ id: sysDeadLetterQueue.id });

      const deleted = result.length;
      if (deleted > 0) {
        logger.info('DLQ failed cleanup completed', { deleted, olderThanDays });
        this.metrics?.incrementCounter(STANDARD_METRICS.DLQ_ITEMS_CLEANED, { status: 'failed' }, deleted);
        this.emitDepthGauges();
      }
      return deleted;
    } catch (error) {
      logger.error('Failed to cleanup failed DLQ entries', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  async getDepthByStatus(): Promise<Record<string, number>> {
    try {
      const db = this.getDb();
      const sysDeadLetterQueue = this.getSchema();

      const counts = await db
        .select({
          status: sysDeadLetterQueue.status,
          count: sql<number>`count(*)::int`,
        })
        .from(sysDeadLetterQueue)
        .groupBy(sysDeadLetterQueue.status);

      const result: Record<string, number> = {};
      for (const row of counts) {
        result[row.status] = row.count;
      }
      return result;
    } catch (error) {
      logger.error('Failed to get DLQ depth', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }
}

export const dlqService = new DLQService();
