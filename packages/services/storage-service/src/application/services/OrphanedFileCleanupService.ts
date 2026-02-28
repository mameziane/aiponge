/**
 * Orphaned File Cleanup Service
 * Handles background cleanup of orphaned files after a grace period
 * Industry-standard approach used by Spotify, YouTube, etc.
 */

import { eq, and, lt, sql } from 'drizzle-orm';
import type { DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import * as schema from '../../schema/storage-schema';
import { getLogger } from '../../config/service-urls';
import { IStorageProvider } from '../interfaces/IStorageProvider';
import { STORAGE_FILE_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('orphaned-file-cleanup');

export interface CleanupConfig {
  gracePeriodHours: number;
  batchSize: number;
  dryRun?: boolean;
}

export interface CleanupResult {
  deletedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: string[];
}

export class OrphanedFileCleanupService {
  private readonly defaultConfig: CleanupConfig = {
    gracePeriodHours: 24,
    batchSize: 100,
    dryRun: false,
  };

  constructor(
    private _db: DatabaseConnection,
    private _storageProvider: IStorageProvider
  ) {}

  async markFileAsOrphaned(fileUrl: string, userId?: string): Promise<boolean> {
    try {
      const storagePath = this.extractStoragePath(fileUrl);
      if (!storagePath) {
        logger.warn('Could not extract storage path from URL', { fileUrl });
        return false;
      }

      const result = await this._db
        .update(schema.files)
        .set({
          status: STORAGE_FILE_LIFECYCLE.ORPHANED,
          orphanedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.files.storagePath, storagePath), eq(schema.files.status, STORAGE_FILE_LIFECYCLE.ACTIVE)))
        .returning({ id: schema.files.id });

      if (result.length > 0) {
        logger.info('Marked file as orphaned', { storagePath, userId, affectedRows: result.length });
        return true;
      }

      logger.warn('No file found to mark as orphaned', { storagePath, userId });
      return false;
    } catch (error) {
      logger.error('Failed to mark file as orphaned', {
        fileUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async cleanupOrphanedFiles(config?: Partial<CleanupConfig>): Promise<CleanupResult> {
    const cfg = { ...this.defaultConfig, ...config };
    const cutoffDate = new Date(Date.now() - cfg.gracePeriodHours * 60 * 60 * 1000);

    const result: CleanupResult = {
      deletedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    try {
      const orphanedFiles = await this._db
        .select({
          id: schema.files.id,
          storagePath: schema.files.storagePath,
          publicUrl: schema.files.publicUrl,
          orphanedAt: schema.files.orphanedAt,
          category: schema.files.category,
        })
        .from(schema.files)
        .where(and(eq(schema.files.status, STORAGE_FILE_LIFECYCLE.ORPHANED), lt(schema.files.orphanedAt, cutoffDate)))
        .limit(cfg.batchSize);

      logger.info('Found orphaned files for cleanup', {
        count: orphanedFiles.length,
        cutoffDate: cutoffDate.toISOString(),
        gracePeriodHours: cfg.gracePeriodHours,
      });

      for (const file of orphanedFiles) {
        if (cfg.dryRun) {
          logger.info('[DRY RUN] Would delete file', { id: file.id, path: file.storagePath });
          result.skippedCount++;
          continue;
        }

        try {
          const deleteResult = await this._storageProvider.delete(file.storagePath);

          if (deleteResult.success) {
            await this._db
              .update(schema.files)
              .set({ status: STORAGE_FILE_LIFECYCLE.DELETED, updatedAt: new Date() })
              .where(eq(schema.files.id, file.id));

            result.deletedCount++;
            logger.info('Deleted orphaned file', { id: file.id, path: file.storagePath });
          } else {
            result.failedCount++;
            result.errors.push(`Failed to delete ${file.storagePath}: ${deleteResult.error}`);
          }
        } catch (error) {
          result.failedCount++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Error deleting ${file.storagePath}: ${errorMsg}`);
          logger.error('Error deleting orphaned file', { id: file.id, error: errorMsg });
        }
      }

      logger.info('Cleanup completed', {
        deleted: result.deletedCount,
        failed: result.failedCount,
        skipped: result.skippedCount,
      });

      return result;
    } catch (error) {
      logger.error('Cleanup job failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getOrphanedFilesStats(): Promise<{
    totalOrphaned: number;
    readyForDeletion: number;
    withinGracePeriod: number;
  }> {
    const cutoffDate = new Date(Date.now() - this.defaultConfig.gracePeriodHours * 60 * 60 * 1000);

    const stats = await this._db
      .select({
        total: sql<number>`COUNT(*) FILTER (WHERE status = ${STORAGE_FILE_LIFECYCLE.ORPHANED})`,
        readyForDeletion: sql<number>`COUNT(*) FILTER (WHERE status = ${STORAGE_FILE_LIFECYCLE.ORPHANED} AND orphaned_at < ${cutoffDate})`,
        withinGracePeriod: sql<number>`COUNT(*) FILTER (WHERE status = ${STORAGE_FILE_LIFECYCLE.ORPHANED} AND orphaned_at >= ${cutoffDate})`,
      })
      .from(schema.files);

    return {
      totalOrphaned: Number(stats[0]?.total) || 0,
      readyForDeletion: Number(stats[0]?.readyForDeletion) || 0,
      withinGracePeriod: Number(stats[0]?.withinGracePeriod) || 0,
    };
  }

  private extractStoragePath(fileUrl: string): string | null {
    if (!fileUrl) return null;

    // Remove query strings and fragments first (handles presigned URLs, CDN links)
    const cleanUrl = fileUrl.split('?')[0].split('#')[0];

    try {
      // Case 1: Already a bare storage path (e.g., "user/avatars/file.jpg")
      if (!cleanUrl.startsWith('/') && !cleanUrl.startsWith('http')) {
        return cleanUrl;
      }

      // Case 2: Relative URL (e.g., "/uploads/user/avatars/file.jpg")
      if (cleanUrl.startsWith('/uploads/')) {
        return cleanUrl.replace('/uploads/', '');
      }

      // Case 3: Absolute URL (e.g., "https://domain/uploads/user/avatars/file.jpg")
      if (cleanUrl.includes('/uploads/')) {
        const match = cleanUrl.match(/\/uploads\/(.+)$/);
        return match ? match[1] : null;
      }

      // Case 4: Path starting with / but no /uploads prefix
      if (cleanUrl.startsWith('/')) {
        return cleanUrl.substring(1);
      }

      return cleanUrl;
    } catch {
      // Fallback: try to extract anything after /uploads/
      if (cleanUrl.includes('/uploads/')) {
        const match = cleanUrl.match(/\/uploads\/(.+)$/);
        return match ? match[1] : null;
      }
      return null;
    }
  }
}
