/**
 * FileVersion Entity - Storage Service Domain Model
 * Represents a version of a file for version control and history tracking
 */

import { StorageError } from '../../application/errors';
import { StorageLocation } from '../value-objects/StorageLocation';
import {
  FILE_VERSION_LIFECYCLE,
  FILE_VERSION_TRANSITIONS,
  canTransitionTo,
  type FileVersionLifecycleStatus,
} from '@aiponge/shared-contracts';

export type VersionStatus = FileVersionLifecycleStatus;

export interface VersionMetadata {
  versionNumber: number;
  versionTag?: string; // e.g., "v1.0", "draft", "final"
  checksum: string;
  size: number;
  mimeType: string;
  parentVersionId?: string;
  changeDescription?: string;
  isLatest: boolean;
}

export class FileVersion {
  constructor(
    public readonly id: string,
    public readonly fileId: string,
    public readonly userId: string, // User who created this version
    public readonly storageLocation: StorageLocation,
    public readonly metadata: VersionMetadata,
    public readonly status: VersionStatus = FILE_VERSION_LIFECYCLE.ACTIVE,
    public readonly createdAt: Date = new Date(),
    public readonly archivedAt?: Date,
    public readonly deletedAt?: Date
  ) {
    this.validateFileVersion();
  }

  private validateFileVersion(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw StorageError.validationError('id', 'cannot be empty');
    }

    if (!this.fileId || this.fileId.trim().length === 0) {
      throw StorageError.validationError('fileId', 'cannot be empty');
    }

    if (!this.userId || this.userId.trim().length === 0) {
      throw StorageError.validationError('userId', 'cannot be empty');
    }

    if (!this.storageLocation) {
      throw StorageError.validationError('storageLocation', 'is required');
    }

    if (!this.metadata) {
      throw StorageError.invalidMetadata('metadata', 'is required');
    }

    if (this.metadata.versionNumber < 1) {
      throw StorageError.invalidMetadata('versionNumber', 'must be greater than 0');
    }

    if (!this.metadata.checksum || this.metadata.checksum.trim().length === 0) {
      throw StorageError.invalidMetadata('checksum', 'cannot be empty');
    }

    if (this.metadata.size < 0) {
      throw StorageError.invalidMetadata('size', 'cannot be negative');
    }

    if (!this.metadata.mimeType || this.metadata.mimeType.trim().length === 0) {
      throw StorageError.invalidMetadata('mimeType', 'cannot be empty');
    }

    // Validate status-specific fields
    if (this.status === FILE_VERSION_LIFECYCLE.ARCHIVED && !this.archivedAt) {
      throw StorageError.validationError('archivedAt', 'is required when status is archived');
    }

    if (this.status === FILE_VERSION_LIFECYCLE.DELETED && !this.deletedAt) {
      throw StorageError.validationError('deletedAt', 'is required when status is deleted');
    }
  }

  /**
   * Archive this version
   */
  archive(): FileVersion {
    if (!canTransitionTo(this.status, FILE_VERSION_LIFECYCLE.ARCHIVED, FILE_VERSION_TRANSITIONS)) {
      throw StorageError.invalidStateTransition(
        this.status,
        FILE_VERSION_LIFECYCLE.ARCHIVED,
        `cannot transition from '${this.status}'`
      );
    }

    return new FileVersion(
      this.id,
      this.fileId,
      this.userId,
      this.storageLocation,
      { ...this.metadata, isLatest: false },
      FILE_VERSION_LIFECYCLE.ARCHIVED,
      this.createdAt,
      new Date(),
      this.deletedAt
    );
  }

  /**
   * Mark version as deleted (soft delete)
   */
  markAsDeleted(): FileVersion {
    if (!canTransitionTo(this.status, FILE_VERSION_LIFECYCLE.DELETED, FILE_VERSION_TRANSITIONS)) {
      throw StorageError.invalidStateTransition(
        this.status,
        FILE_VERSION_LIFECYCLE.DELETED,
        `cannot transition from '${this.status}'`
      );
    }

    return new FileVersion(
      this.id,
      this.fileId,
      this.userId,
      this.storageLocation,
      { ...this.metadata, isLatest: false },
      FILE_VERSION_LIFECYCLE.DELETED,
      this.createdAt,
      this.archivedAt,
      new Date()
    );
  }

  /**
   * Restore archived version to active
   */
  restore(): FileVersion {
    if (!canTransitionTo(this.status, FILE_VERSION_LIFECYCLE.ACTIVE, FILE_VERSION_TRANSITIONS)) {
      throw StorageError.invalidStateTransition(
        this.status,
        FILE_VERSION_LIFECYCLE.ACTIVE,
        `cannot transition from '${this.status}'`
      );
    }

    return new FileVersion(
      this.id,
      this.fileId,
      this.userId,
      this.storageLocation,
      this.metadata,
      FILE_VERSION_LIFECYCLE.ACTIVE,
      this.createdAt,
      undefined,
      this.deletedAt
    );
  }

  /**
   * Mark as latest version
   */
  markAsLatest(): FileVersion {
    return new FileVersion(
      this.id,
      this.fileId,
      this.userId,
      this.storageLocation,
      { ...this.metadata, isLatest: true },
      this.status,
      this.createdAt,
      this.archivedAt,
      this.deletedAt
    );
  }

  /**
   * Remove latest flag
   */
  removeLatestFlag(): FileVersion {
    return new FileVersion(
      this.id,
      this.fileId,
      this.userId,
      this.storageLocation,
      { ...this.metadata, isLatest: false },
      this.status,
      this.createdAt,
      this.archivedAt,
      this.deletedAt
    );
  }

  /**
   * Update version metadata
   */
  updateMetadata(updates: Partial<VersionMetadata>): FileVersion {
    // Ensure we don't break required fields
    const updatedMetadata = {
      ...this.metadata,
      ...updates,
    };

    return new FileVersion(
      this.id,
      this.fileId,
      this.userId,
      this.storageLocation,
      updatedMetadata,
      this.status,
      this.createdAt,
      this.archivedAt,
      this.deletedAt
    );
  }

  /**
   * Check if version is active
   */
  isActive(): boolean {
    return this.status === FILE_VERSION_LIFECYCLE.ACTIVE;
  }

  /**
   * Check if version is archived
   */
  isArchived(): boolean {
    return this.status === FILE_VERSION_LIFECYCLE.ARCHIVED;
  }

  /**
   * Check if version is deleted
   */
  isDeleted(): boolean {
    return this.status === FILE_VERSION_LIFECYCLE.DELETED;
  }

  /**
   * Check if this is the latest version
   */
  isLatest(): boolean {
    return this.metadata.isLatest;
  }

  /**
   * Get file extension from storage location
   */
  getFileExtension(): string {
    return this.storageLocation.getExtension();
  }

  /**
   * Get filename from storage location
   */
  getFilename(): string {
    return this.storageLocation.getFilename();
  }

  /**
   * Check if this is an image file
   */
  isImage(): boolean {
    return this.metadata.mimeType.startsWith('image/');
  }

  /**
   * Check if this is a video file
   */
  isVideo(): boolean {
    return this.metadata.mimeType.startsWith('video/');
  }

  /**
   * Check if this is an audio file
   */
  isAudio(): boolean {
    return this.metadata.mimeType.startsWith('audio/');
  }

  /**
   * Check if this is a document file
   */
  isDocument(): boolean {
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    return docTypes.some(type => this.metadata.mimeType.includes(type));
  }

  /**
   * Get age of version in days
   */
  getAgeInDays(): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get human-readable file size
   */
  getHumanReadableSize(): string {
    const bytes = this.metadata.size;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(2);

    return `${size} ${sizes[i]}`;
  }

  /**
   * Compare checksums to detect changes
   */
  hasContentChanged(otherChecksum: string): boolean {
    return this.metadata.checksum !== otherChecksum;
  }

  /**
   * Check if version is newer than another version
   */
  isNewerThan(otherVersion: FileVersion): boolean {
    return this.metadata.versionNumber > otherVersion.metadata.versionNumber;
  }

  /**
   * Check if version is older than another version
   */
  isOlderThan(otherVersion: FileVersion): boolean {
    return this.metadata.versionNumber < otherVersion.metadata.versionNumber;
  }

  /**
   * Static factory method
   */
  static create(
    id: string,
    fileId: string,
    userId: string,
    storageLocation: StorageLocation,
    versionNumber: number,
    checksum: string,
    size: number,
    mimeType: string,
    options: {
      versionTag?: string;
      parentVersionId?: string;
      changeDescription?: string;
      isLatest?: boolean;
    } = {}
  ): FileVersion {
    const metadata: VersionMetadata = {
      versionNumber,
      versionTag: options.versionTag,
      checksum,
      size,
      mimeType,
      parentVersionId: options.parentVersionId,
      changeDescription: options.changeDescription,
      isLatest: options.isLatest ?? true,
    };

    return new FileVersion(id, fileId, userId, storageLocation, metadata);
  }

  /**
   * Create next version from current version
   */
  createNextVersion(
    newVersionId: string,
    newStorageLocation: StorageLocation,
    newChecksum: string,
    newSize: number,
    newMimeType: string,
    changeDescription?: string
  ): FileVersion {
    const nextVersionNumber = this.metadata.versionNumber + 1;

    return FileVersion.create(
      newVersionId,
      this.fileId,
      this.userId,
      newStorageLocation,
      nextVersionNumber,
      newChecksum,
      newSize,
      newMimeType,
      {
        parentVersionId: this.id,
        changeDescription,
        isLatest: true,
      }
    );
  }
}
