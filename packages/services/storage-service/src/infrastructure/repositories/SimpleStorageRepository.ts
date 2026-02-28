/**
 * Simple In-Memory Storage Repository
 * Minimal implementation to replace ProductionStorageRepository
 */

import { FileEntity } from '../../domains/entities/FileEntity';
import { IStorageRepository } from '../../application/interfaces/IStorageRepository';
import { StorageError } from '../../application/errors';
import { STORAGE_FILE_LIFECYCLE, type StorageFileLifecycleStatus } from '@aiponge/shared-contracts';

export class SimpleStorageRepository implements IStorageRepository {
  private files: Map<string, FileEntity> = new Map();
  private fileStatus: Map<string, { status: StorageFileLifecycleStatus; orphanedAt?: Date }> = new Map();

  async save(file: FileEntity): Promise<void> {
    this.files.set(file.id, file);
    this.fileStatus.set(file.id, { status: STORAGE_FILE_LIFECYCLE.ACTIVE });
  }

  async findById(id: string): Promise<FileEntity | null> {
    return this.files.get(id) || null;
  }

  async findAll(_filters?: Record<string, unknown>): Promise<FileEntity[]> {
    return Array.from(this.files.values());
  }

  async delete(id: string): Promise<boolean> {
    return this.files.delete(id);
  }

  async update(id: string, updates: Partial<FileEntity>): Promise<FileEntity> {
    const existing = this.files.get(id);
    if (!existing) {
      throw StorageError.fileNotFound(id);
    }
    // Create a new FileEntity with updated values
    const updated = new FileEntity(
      existing.id,
      updates.filename || existing.filename,
      updates.storageLocation || existing.storageLocation,
      { ...existing.metadata, ...updates.metadata },
      existing.createdAt,
      updates.updatedAt || new Date()
    );
    this.files.set(id, updated);
    return updated;
  }

  async exists(id: string): Promise<boolean> {
    return this.files.has(id);
  }

  async count(_filters?: Record<string, unknown>): Promise<number> {
    return this.files.size;
  }

  async close(): Promise<void> {
    this.files.clear();
  }

  async getStats(): Promise<Record<string, unknown>> {
    return {
      totalFiles: this.files.size,
      totalSize: 0,
    };
  }

  // Additional required methods
  async findByPath(path: string): Promise<FileEntity | null> {
    for (const file of this.files.values()) {
      if (file.storageLocation.path === path) {
        return file;
      }
    }
    return null;
  }

  async findByUserId(userId: string): Promise<FileEntity[]> {
    return Array.from(this.files.values()).filter(file => file.metadata.userId === userId);
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<boolean> {
    const existing = this.files.get(id);
    if (!existing) {
      return false;
    }
    const updated = new FileEntity(
      existing.id,
      existing.filename,
      existing.storageLocation,
      { ...existing.metadata, ...metadata },
      existing.createdAt,
      new Date()
    );
    this.files.set(id, updated);
    return true;
  }

  async findExpired(): Promise<FileEntity[]> {
    const now = new Date();
    return Array.from(this.files.values()).filter(file => file.metadata.expiresAt && file.metadata.expiresAt < now);
  }

  async search(filters: {
    userId?: string;
    contentType?: string;
    tags?: string[];
    isPublic?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<FileEntity[]> {
    let results = Array.from(this.files.values());

    if (filters.userId) {
      results = results.filter(file => file.metadata.userId === filters.userId);
    }

    if (filters.isPublic !== undefined) {
      results = results.filter(file => file.metadata.isPublic === filters.isPublic);
    }

    if (filters.offset) {
      results = results.slice(filters.offset);
    }

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  async markFileAsOrphaned(storagePath: string): Promise<boolean> {
    for (const file of this.files.values()) {
      if (file.storageLocation.path === storagePath) {
        const status = this.fileStatus.get(file.id);
        if (!status || status.status !== STORAGE_FILE_LIFECYCLE.ACTIVE) {
          return false;
        }
        this.fileStatus.set(file.id, { status: STORAGE_FILE_LIFECYCLE.ORPHANED, orphanedAt: new Date() });
        return true;
      }
    }
    return false;
  }
}
