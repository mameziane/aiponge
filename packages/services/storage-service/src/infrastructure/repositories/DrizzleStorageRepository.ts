/**
 * Drizzle Storage Repository
 * Production-ready Drizzle ORM implementation for file persistence
 * Uses dependency injection pattern with Neon HTTP Database
 */

import { eq, and, desc, isNotNull, isNull, lt } from 'drizzle-orm';
import { IStorageRepository } from '../../application/interfaces/IStorageRepository';
import { FileEntity, FileMetadata, FileLocation } from '../../domains/entities/FileEntity';
import * as schema from '../../schema/storage-schema';
import { errorMessage } from '@aiponge/platform-core';
import { STORAGE_FILE_LIFECYCLE } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from '../database/DatabaseConnectionFactory';

const logger = getLogger('drizzle-storage-repository');

export class DrizzleStorageRepository implements IStorageRepository {
  constructor(private _db: DatabaseConnection) {}

  async save(file: FileEntity): Promise<void> {
    try {
      const location = file.location;
      const metadata = file.metadata;

      await this._db
        .insert(schema.files)
        .values({
          id: file.id,
          originalName: file.filename,
          storageProvider: location.provider,
          storagePath: location.path || location.key,
          publicUrl: location.publicUrl || null,
          bucket: location.bucket || null,
          storageMetadata: location.metadata || {},
          contentType: metadata.contentType || metadata.mimeType || null,
          fileSize: metadata.size || null,
          checksum: metadata.checksum || null,
          uploadedAt: metadata.uploadedAt || null,
          lastModified: file.updatedAt || null,
          tags: metadata.tags || null,
          isPublic: metadata.isPublic || false,
          userId: metadata.userId || null,
          expiresAt: metadata.expiresAt || null,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        })
        .onConflictDoUpdate({
          target: schema.files.id,
          set: {
            originalName: file.filename,
            storageProvider: location.provider,
            storagePath: location.path || location.key,
            publicUrl: location.publicUrl || null,
            bucket: location.bucket || null,
            storageMetadata: location.metadata || {},
            contentType: metadata.contentType || metadata.mimeType || null,
            fileSize: metadata.size || null,
            checksum: metadata.checksum || null,
            uploadedAt: metadata.uploadedAt || null,
            lastModified: file.updatedAt || null,
            tags: metadata.tags || null,
            isPublic: metadata.isPublic || false,
            userId: metadata.userId || null,
            expiresAt: metadata.expiresAt || null,
            updatedAt: file.updatedAt,
          },
        });
    } catch (error) {
      logger.error('Failed to save file', {
        fileId: file.id,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async findById(id: string): Promise<FileEntity | null> {
    try {
      const [result] = await this._db
        .select()
        .from(schema.files)
        .where(and(eq(schema.files.id, id), isNull(schema.files.deletedAt)))
        .limit(1);

      if (!result) {
        return null;
      }

      return this.mapRowToFileEntity(result);
    } catch (error) {
      logger.error('Failed to find file by ID', {
        fileId: id,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async findByPath(path: string): Promise<FileEntity | null> {
    try {
      const [result] = await this._db
        .select()
        .from(schema.files)
        .where(and(eq(schema.files.storagePath, path), isNull(schema.files.deletedAt)))
        .limit(1);

      if (!result) {
        return null;
      }

      return this.mapRowToFileEntity(result);
    } catch (error) {
      logger.error('Failed to find file by path', {
        path,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<FileEntity[]> {
    try {
      const results = await this._db
        .select()
        .from(schema.files)
        .where(and(eq(schema.files.userId, userId), isNull(schema.files.deletedAt)))
        .orderBy(desc(schema.files.createdAt));

      return results.map(row => this.mapRowToFileEntity(row));
    } catch (error) {
      logger.error('Failed to find files by user', {
        userId,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this._db
        .update(schema.files)
        .set({ deletedAt: new Date(), status: STORAGE_FILE_LIFECYCLE.DELETED })
        .where(eq(schema.files.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to delete file', {
        fileId: id,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const [result] = await this._db
        .select({ id: schema.files.id })
        .from(schema.files)
        .where(and(eq(schema.files.id, id), isNull(schema.files.deletedAt)))
        .limit(1);

      return !!result;
    } catch (error) {
      logger.error('Failed to check file existence', {
        fileId: id,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async updateMetadata(id: string, metadata: Partial<FileMetadata>): Promise<boolean> {
    try {
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
        lastModified: new Date(),
      };

      if (metadata.contentType !== undefined || metadata.mimeType !== undefined) {
        updates.contentType = metadata.contentType || metadata.mimeType;
      }
      if (metadata.size !== undefined) {
        updates.fileSize = metadata.size;
      }
      if (metadata.checksum !== undefined) {
        updates.checksum = metadata.checksum;
      }
      if (metadata.tags !== undefined) {
        updates.tags = metadata.tags;
      }
      if (metadata.isPublic !== undefined) {
        updates.isPublic = metadata.isPublic;
      }
      if (metadata.userId !== undefined) {
        updates.userId = metadata.userId;
      }
      if (metadata.expiresAt !== undefined) {
        updates.expiresAt = metadata.expiresAt;
      }

      const result = await this._db
        .update(schema.files)
        .set(updates)
        .where(and(eq(schema.files.id, id), isNull(schema.files.deletedAt)))
        .returning();

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to update file metadata', {
        fileId: id,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async findExpired(): Promise<FileEntity[]> {
    try {
      const results = await this._db
        .select()
        .from(schema.files)
        .where(
          and(isNotNull(schema.files.expiresAt), lt(schema.files.expiresAt, new Date()), isNull(schema.files.deletedAt))
        );

      return results.map(row => this.mapRowToFileEntity(row));
    } catch (error) {
      logger.error('Failed to find expired files', {
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async search(filters: {
    userId?: string;
    contentType?: string;
    tags?: string[];
    isPublic?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<FileEntity[]> {
    try {
      const conditions = [];

      conditions.push(isNull(schema.files.deletedAt));

      if (filters.userId) {
        conditions.push(eq(schema.files.userId, filters.userId));
      }
      if (filters.contentType) {
        conditions.push(eq(schema.files.contentType, filters.contentType));
      }
      if (typeof filters.isPublic === 'boolean') {
        conditions.push(eq(schema.files.isPublic, filters.isPublic));
      }

      let query = this._db
        .select()
        .from(schema.files)
        .orderBy(desc(schema.files.createdAt))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const results = await query;
      return results.map(row => this.mapRowToFileEntity(row));
    } catch (error) {
      logger.error('Failed to search files', {
        filters,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  async markFileAsOrphaned(storagePath: string): Promise<boolean> {
    try {
      const result = await this._db
        .update(schema.files)
        .set({
          status: STORAGE_FILE_LIFECYCLE.ORPHANED,
          orphanedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.files.storagePath, storagePath),
            eq(schema.files.status, STORAGE_FILE_LIFECYCLE.ACTIVE),
            isNull(schema.files.deletedAt)
          )
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to mark file as orphaned', {
        storagePath,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  private mapRowToFileEntity(row: typeof schema.files.$inferSelect): FileEntity {
    const location: FileLocation = {
      provider: row.storageProvider as 'local' | 'aws' | 'gcp' | 'azure',
      path: row.storagePath,
      key: row.storagePath,
      bucket: row.bucket ?? 'default',
      publicUrl: row.publicUrl ?? undefined,
      metadata: (row.storageMetadata as Record<string, unknown>) || {},
    };

    const metadata: FileMetadata = {
      mimeType: row.contentType ?? 'application/octet-stream',
      contentType: row.contentType ?? undefined,
      size: row.fileSize ?? 0,
      checksum: row.checksum ?? undefined,
      uploadedAt: row.uploadedAt ? new Date(row.uploadedAt) : new Date(),
      uploadedBy: row.userId ?? 'system',
      tags: row.tags as string[] | undefined,
      isPublic: row.isPublic ?? false,
      userId: row.userId ?? undefined,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
    };

    return new FileEntity(
      row.id,
      row.originalName,
      location,
      metadata,
      row.createdAt ? new Date(row.createdAt) : new Date(),
      row.updatedAt ? new Date(row.updatedAt) : new Date()
    );
  }
}
