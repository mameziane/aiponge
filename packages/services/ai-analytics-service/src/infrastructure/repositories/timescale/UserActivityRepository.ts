import type { Pool } from 'pg';
import { errorMessage } from '@aiponge/platform-core';
import type { UserActivityRecord } from '../../../domains/repositories/IAnalyticsRepository';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('ai-analytics-service-user-activity-repository');

export class UserActivityRepository {
  constructor(private readonly pool: Pool) {}

  async getUserActivityLogs(filter: {
    userId?: string;
    action?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<
    Array<{
      id: number;
      timestamp: Date;
      userId: string;
      userType: string;
      sessionId: string | null;
      action: string;
      resource: string | null;
      workflowType: string | null;
      providerId: string | null;
      cost: number;
      processingTime: number | null;
      success: boolean;
      errorCode: string | null;
      metadata: Record<string, unknown> | null;
    }>
  > {
    try {
      let query = `
        SELECT 
          id, timestamp, user_id, user_type, session_id, action,
          resource, workflow_type, provider_id, cost,
          processing_time_ms, success, error_code, metadata
        FROM aia_user_activity_logs
        WHERE 1=1
      `;
      const values: (string | number | Date | boolean | null)[] = [];
      let paramIndex = 1;

      if (filter.userId) {
        query += ` AND user_id = $${paramIndex++}`;
        values.push(filter.userId);
      }
      if (filter.action) {
        query += ` AND action = $${paramIndex++}`;
        values.push(filter.action);
      }
      if (filter.startTime) {
        query += ` AND timestamp >= $${paramIndex++}`;
        values.push(filter.startTime);
      }
      if (filter.endTime) {
        query += ` AND timestamp <= $${paramIndex++}`;
        values.push(filter.endTime);
      }

      query += ` ORDER BY timestamp DESC LIMIT ${filter.limit || 100}`;

      const result = await this.pool.query(query, values);

      return result.rows.map(row => ({
        id: row.id,
        timestamp: new Date(row.timestamp),
        userId: row.user_id,
        userType: row.user_type,
        sessionId: row.session_id,
        action: row.action,
        resource: row.resource,
        workflowType: row.workflow_type,
        providerId: row.provider_id,
        cost: parseFloat(row.cost) || 0,
        processingTime: row.processing_time_ms,
        success: row.success,
        errorCode: row.error_code,
        metadata: row.metadata,
      }));
    } catch (error) {
      logger.error('Failed to get user activity logs', {
        error: error instanceof Error ? error.message : String(error),
        filter,
        method: 'getUserActivityLogs',
      });
      return [];
    }
  }

  async getUserActivitySummary(options: {
    startTime?: Date;
    endTime?: Date;
    groupBy?: 'action' | 'hour' | 'day';
  }): Promise<{
    totalActions: number;
    uniqueUsers: number;
    byAction: Record<string, number>;
    byHour: Record<string, number>;
    topUsers: Array<{ userId: string; actionCount: number }>;
  }> {
    try {
      const startTime = options.startTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endTime = options.endTime || new Date();

      const statsResult = await this.pool.query(
        `
        SELECT 
          COUNT(*) as total_actions,
          COUNT(DISTINCT user_id) as unique_users
        FROM aia_user_activity_logs
        WHERE timestamp >= $1 AND timestamp <= $2
      `,
        [startTime, endTime]
      );

      const byActionResult = await this.pool.query(
        `
        SELECT action, COUNT(*) as count
        FROM aia_user_activity_logs
        WHERE timestamp >= $1 AND timestamp <= $2
        GROUP BY action
        ORDER BY count DESC
        LIMIT 20
      `,
        [startTime, endTime]
      );

      const byHourResult = await this.pool.query(
        `
        SELECT 
          EXTRACT(HOUR FROM timestamp) as hour,
          COUNT(*) as count
        FROM aia_user_activity_logs
        WHERE timestamp >= $1 AND timestamp <= $2
        GROUP BY hour
        ORDER BY hour
      `,
        [startTime, endTime]
      );

      const topUsersResult = await this.pool.query(
        `
        SELECT user_id, COUNT(*) as action_count
        FROM aia_user_activity_logs
        WHERE timestamp >= $1 AND timestamp <= $2
        GROUP BY user_id
        ORDER BY action_count DESC
        LIMIT 10
      `,
        [startTime, endTime]
      );

      const byAction: Record<string, number> = {};
      for (const row of byActionResult.rows) {
        byAction[row.action] = parseInt(row.count) || 0;
      }

      const byHour: Record<string, number> = {};
      for (const row of byHourResult.rows) {
        byHour[String(row.hour)] = parseInt(row.count) || 0;
      }

      const topUsers = topUsersResult.rows.map(row => ({
        userId: row.user_id,
        actionCount: parseInt(row.action_count) || 0,
      }));

      return {
        totalActions: parseInt(statsResult.rows[0]?.total_actions) || 0,
        uniqueUsers: parseInt(statsResult.rows[0]?.unique_users) || 0,
        byAction,
        byHour,
        topUsers,
      };
    } catch (error) {
      logger.error('Failed to get user activity summary', {
        error: error instanceof Error ? error.message : String(error),
        method: 'getUserActivitySummary',
      });
      return {
        totalActions: 0,
        uniqueUsers: 0,
        byAction: {},
        byHour: {},
        topUsers: [],
      };
    }
  }

  async recordUserActivity(record: UserActivityRecord): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO aia_user_activity_logs (timestamp, user_id, user_type, session_id, action, resource, success, error_code, user_agent, ip_address, processing_time_ms, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          record.timestamp,
          record.userId,
          record.userType,
          record.sessionId,
          record.action,
          record.resource,
          record.success,
          record.errorCode,
          record.userAgent,
          record.ipAddress,
          record.processingTime,
          record.metadata || null,
        ]
      );
    } catch (error) {
      logger.warn('Failed to record user activity', { error: errorMessage(error), userId: record.userId });
    }
  }

  async getUserActivityByIp(ipAddress: string, since: Date): Promise<UserActivityRecord[]> {
    try {
      const result = await this.pool.query(
        `SELECT timestamp, user_id, user_type, session_id, action, resource, success, error_code, user_agent, ip_address, processing_time_ms, metadata
         FROM aia_user_activity_logs
         WHERE ip_address = $1 AND timestamp >= $2
         ORDER BY timestamp DESC
         LIMIT 500`,
        [ipAddress, since]
      );
      return result.rows.map(this.mapActivityRow);
    } catch (error) {
      logger.warn('Failed to query user activity by IP', { error: errorMessage(error) });
      return [];
    }
  }

  async getUserActivityByUserId(userId: string, since: Date): Promise<UserActivityRecord[]> {
    try {
      const result = await this.pool.query(
        `SELECT timestamp, user_id, user_type, session_id, action, resource, success, error_code, user_agent, ip_address, processing_time_ms, metadata
         FROM aia_user_activity_logs
         WHERE user_id = $1 AND timestamp >= $2
         ORDER BY timestamp DESC
         LIMIT 500`,
        [userId, since]
      );
      return result.rows.map(this.mapActivityRow);
    } catch (error) {
      logger.warn('Failed to query user activity by user', { error: errorMessage(error) });
      return [];
    }
  }

  private mapActivityRow(row: {
    timestamp: string | Date;
    user_id: string;
    user_type: string;
    session_id: string | null;
    action: string;
    resource: string | null;
    success: boolean;
    error_code: string | null;
    user_agent: string | null;
    ip_address: string | null;
    processing_time_ms: number | null;
    metadata: Record<string, unknown> | null;
  }): UserActivityRecord {
    return {
      timestamp: new Date(row.timestamp),
      userId: row.user_id,
      userType: row.user_type,
      sessionId: row.session_id,
      action: row.action,
      resource: row.resource,
      success: row.success,
      errorCode: row.error_code,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      processingTime: row.processing_time_ms,
      metadata: row.metadata,
    };
  }
}
