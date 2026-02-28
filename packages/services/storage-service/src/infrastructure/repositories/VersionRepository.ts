import { eq, desc, sql } from 'drizzle-orm';
import { fileVersions } from '../../schema/storage-schema';
import type { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { createLogger } from '@aiponge/platform-core';

const logger = createLogger('version-repository');

export interface CreateVersionData {
  versionType: string;
  storageProvider: string;
  storagePath: string;
  publicUrl?: string;
  contentType?: string;
  fileSize?: number;
  checksum?: string;
  processingParams?: Record<string, unknown>;
}

export class VersionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createVersion(fileId: string, data: CreateVersionData) {
    const maxResult = await this.db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${fileVersions.versionNumber}), 0)` })
      .from(fileVersions)
      .where(eq(fileVersions.fileId, fileId));

    const nextVersionNumber = (maxResult[0]?.maxVersion ?? 0) + 1;

    const [created] = await this.db
      .insert(fileVersions)
      .values({
        fileId,
        versionNumber: nextVersionNumber,
        versionType: data.versionType,
        storageProvider: data.storageProvider,
        storagePath: data.storagePath,
        publicUrl: data.publicUrl || null,
        contentType: data.contentType || null,
        fileSize: data.fileSize || null,
        checksum: data.checksum || null,
        processingParams: data.processingParams || {},
      })
      .returning();

    logger.info('Version created', { fileId, versionNumber: nextVersionNumber });
    return created;
  }

  async getVersions(fileId: string) {
    return this.db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, fileId))
      .orderBy(desc(fileVersions.versionNumber));
  }

  async deleteVersion(versionId: string) {
    await this.db.delete(fileVersions).where(eq(fileVersions.id, versionId));
    logger.info('Version deleted', { versionId });
  }

  async getLatestVersion(fileId: string) {
    const results = await this.db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, fileId))
      .orderBy(desc(fileVersions.versionNumber))
      .limit(1);

    return results[0] || null;
  }
}
