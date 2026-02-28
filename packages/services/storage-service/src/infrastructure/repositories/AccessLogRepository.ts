import { eq, desc } from 'drizzle-orm';
import { fileAccessLogs } from '../../schema/storage-schema';
import type { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { createLogger } from '@aiponge/platform-core';

const logger = createLogger('access-log-repository');

export interface LogAccessParams {
  fileId: string;
  userId?: string;
  action: 'download' | 'stream' | 'view';
  ipAddress?: string;
  userAgent?: string;
  responseCode?: number;
  bytesTransferred?: number;
  durationMs?: number;
}

export class AccessLogRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async logAccess(params: LogAccessParams): Promise<void> {
    try {
      await this.db.insert(fileAccessLogs).values({
        fileId: params.fileId,
        userId: params.userId || null,
        action: params.action,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        responseCode: params.responseCode || null,
        bytesTransferred: params.bytesTransferred || null,
        durationMs: params.durationMs || null,
        accessedAt: new Date(),
      });

      logger.debug('Access logged', {
        fileId: params.fileId,
        action: params.action,
        userId: params.userId,
      });
    } catch (error) {
      logger.error('Failed to log access', {
        fileId: params.fileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getAccessLogs(fileId: string, limit = 100) {
    return this.db
      .select()
      .from(fileAccessLogs)
      .where(eq(fileAccessLogs.fileId, fileId))
      .orderBy(desc(fileAccessLogs.accessedAt))
      .limit(limit);
  }
}
