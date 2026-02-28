/**
 * Import Backup Repository - Database-backed backup storage for profile imports
 * Provides durable backup storage that survives restarts and scales horizontally
 */

import { eq, lt, and, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { usrImportBackups } from '../database/schemas/profile-schema';
import { IImportBackupRepository, BackupData } from '../../application/use-cases/profile/ImportUserProfileUseCase';
import { getLogger } from '../../config/service-urls';
import { CONTENT_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('import-backup-repository');

export class ImportBackupRepository implements IImportBackupRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createBackup(id: string, userId: string, data: BackupData, expiresAt: Date): Promise<void> {
    await this.db.insert(usrImportBackups).values({
      id,
      userId,
      backupData: data,
      status: CONTENT_LIFECYCLE.ACTIVE,
      expiresAt,
    });

    logger.info('Backup stored in database', {
      module: 'import_backup_repository',
      operation: 'createBackup',
      backupId: id,
      userId,
      expiresAt: expiresAt.toISOString(),
    });
  }

  async getBackup(id: string): Promise<{ id: string; userId: string; backupData: BackupData; status: string } | null> {
    const [backup] = await this.db
      .select()
      .from(usrImportBackups)
      .where(and(eq(usrImportBackups.id, id), isNull(usrImportBackups.deletedAt)));

    if (!backup) {
      return null;
    }

    return {
      id: backup.id,
      userId: backup.userId,
      backupData: backup.backupData as BackupData,
      status: backup.status,
    };
  }

  async deleteBackup(id: string): Promise<boolean> {
    const result = await this.db.delete(usrImportBackups).where(eq(usrImportBackups.id, id)).returning();

    const deleted = result.length > 0;
    if (deleted) {
      logger.info('Backup deleted', {
        module: 'import_backup_repository',
        operation: 'deleteBackup',
        backupId: id,
      });
    }

    return deleted;
  }

  async cleanupExpiredBackups(): Promise<number> {
    const now = new Date();
    const result = await this.db.delete(usrImportBackups).where(lt(usrImportBackups.expiresAt, now)).returning();

    if (result.length > 0) {
      logger.info('Cleaned up expired backups', {
        module: 'import_backup_repository',
        operation: 'cleanupExpiredBackups',
        count: result.length,
      });
    }

    return result.length;
  }
}
