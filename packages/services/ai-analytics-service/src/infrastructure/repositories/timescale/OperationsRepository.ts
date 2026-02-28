import type { Pool } from 'pg';
import { errorMessage } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('ai-analytics-service-operations-repository');

export class OperationsRepository {
  constructor(private readonly pool: Pool) {}

  async getDashboardData(
    dashboardType: 'overview' | 'providers' | 'costs' | 'health',
    timeRange: { start: Date; end: Date },
    filters?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    logger.warn('getDashboardData not implemented - returning empty object', {
      dashboardType,
      method: 'getDashboardData',
    });
    return {
      dashboardType,
      timeRange,
      data: {},
      message: 'Dashboard data aggregation not yet implemented',
    };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, unknown> }> {
    try {
      const result = await this.pool.query('SELECT NOW()');
      const responseTime = Date.now();

      return {
        status: 'healthy',
        details: {
          database: 'connected',
          responseTime: `${responseTime}ms`,
          poolSize: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingClients: this.pool.waitingCount,
        },
      };
    } catch (error) {
      logger.warn('Health check failed, reporting unhealthy', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: 'unhealthy',
        details: {
          database: 'disconnected',
          error: errorMessage(error),
        },
      };
    }
  }

  async cleanupOldData(retentionDays: number): Promise<{
    metricsDeleted: number;
    providerLogsDeleted: number;
    anomaliesDeleted: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const metricsResult = await client.query('DELETE FROM aia_system_metrics WHERE timestamp < $1', [cutoffDate]);

      const providerResult = await client.query('DELETE FROM aia_provider_usage_logs WHERE timestamp < $1', [
        cutoffDate,
      ]);

      await client.query('COMMIT');

      return {
        metricsDeleted: metricsResult.rowCount || 0,
        providerLogsDeleted: providerResult.rowCount || 0,
        anomaliesDeleted: 0,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteUserData(userId: string): Promise<{ deletedRecords: number }> {
    logger.info('GDPR: deleteUserData called', { userId });

    try {
      let totalDeleted = 0;

      const tablesToDelete = ['aia_provider_usage_logs', 'aia_user_activity_logs'];

      for (const tableName of tablesToDelete) {
        try {
          const result = await this.pool.query(`DELETE FROM ${tableName} WHERE user_id = $1::uuid`, [userId]);
          const deleted = result.rowCount || 0;
          totalDeleted += deleted;
          if (deleted > 0) {
            logger.info(`GDPR: Deleted ${deleted} rows from ${tableName}`, { userId });
          }
        } catch (tableError) {
          const errorMsg = tableError instanceof Error ? tableError.message : String(tableError);
          const errorCode = (tableError as Record<string, unknown>)?.code;

          const isSafeError =
            errorCode === '42P01' ||
            errorCode === '22P02' ||
            errorCode === '42703' ||
            errorMsg.includes('does not exist') ||
            errorMsg.includes('invalid input syntax');

          if (isSafeError) {
            logger.debug(`GDPR: Safe error for ${tableName}, continuing`, { userId, errorCode });
            continue;
          }

          logger.warn(`GDPR: Unexpected error deleting from ${tableName}`, {
            userId,
            error: errorMsg,
            errorCode,
          });
        }
      }

      try {
        const spansResult = await this.pool.query(
          `DELETE FROM aia_trace_spans WHERE correlation_id IN (SELECT correlation_id FROM aia_request_traces WHERE user_id = $1::uuid)`,
          [userId]
        );
        const deletedSpans = spansResult.rowCount || 0;
        totalDeleted += deletedSpans;
        if (deletedSpans > 0) {
          logger.info(`GDPR: Deleted ${deletedSpans} orphaned trace spans`, { userId });
        }
      } catch (spanError) {
        const errorMsg = spanError instanceof Error ? spanError.message : String(spanError);
        logger.warn('GDPR: Error deleting trace spans (non-critical)', { userId, error: errorMsg });
      }

      try {
        const tracesResult = await this.pool.query(`DELETE FROM aia_request_traces WHERE user_id = $1::uuid`, [userId]);
        const deletedTraces = tracesResult.rowCount || 0;
        totalDeleted += deletedTraces;
        if (deletedTraces > 0) {
          logger.info(`GDPR: Deleted ${deletedTraces} rows from aia_request_traces`, { userId });
        }
      } catch (traceError) {
        const errorMsg = traceError instanceof Error ? traceError.message : String(traceError);
        logger.warn('GDPR: Error deleting request traces (non-critical)', { userId, error: errorMsg });
      }

      logger.info('GDPR: User analytics data deletion completed', { userId, deletedRecords: totalDeleted });
      return { deletedRecords: totalDeleted };
    } catch (outerError) {
      logger.error('GDPR: Analytics deletion encountered error, returning success', {
        userId,
        error: outerError instanceof Error ? outerError.message : String(outerError),
      });
      return { deletedRecords: 0 };
    }
  }

  async exportUserData(userId: string): Promise<{ activityLogs: { eventType: string; timestamp: string }[] }> {
    try {
      const tableExists = await this.pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'aia_user_activity_logs'
        )`
      );

      if (!tableExists.rows[0]?.exists) {
        logger.info('GDPR: aia_user_activity_logs table does not exist, returning empty data', { userId });
        return { activityLogs: [] };
      }

      const result = await this.pool.query(
        'SELECT event_type, timestamp FROM aia_user_activity_logs WHERE user_id = $1 ORDER BY timestamp DESC',
        [userId]
      );

      const activityLogs = result.rows.map((row: { event_type: string; timestamp: Date }) => ({
        eventType: row.event_type || 'unknown',
        timestamp: row.timestamp?.toISOString() || new Date().toISOString(),
      }));

      logger.info('GDPR: User analytics data exported', { userId, recordCount: activityLogs.length });
      return { activityLogs };
    } catch (error) {
      logger.warn('GDPR: Failed to export user analytics data, table may not exist', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { activityLogs: [] };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Connection pool closed');
  }
}
