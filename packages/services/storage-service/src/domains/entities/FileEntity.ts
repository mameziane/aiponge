/**
 * File Entity - Storage Service Domain Model
 * Represents a file in the storage system
 */

import { StorageError } from '../../application/errors';

export interface FileMetadata {
  size: number;
  mimeType: string;
  contentType?: string; // Optional alias for mimeType
  uploadedAt: Date;
  uploadedBy: string;
  tags?: string[];
  description?: string;
  isPublic: boolean;
  checksum?: string;
  userId?: string;
  expiresAt?: Date;
}

export interface FileLocation {
  bucket: string;
  key: string;
  provider: 'local' | 'aws' | 'gcp' | 'azure';
  region?: string;
  path?: string;
  publicUrl?: string;
  metadata?: Record<string, unknown>;
}

export class FileEntity {
  constructor(
    public readonly id: string,
    public readonly filename: string,
    public readonly location: FileLocation,
    public readonly metadata: FileMetadata,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {}

  get storageLocation(): FileLocation {
    return this.location;
  }

  get size(): number {
    return this.metadata.size;
  }

  get provider(): string {
    return this.location.provider;
  }

  get originalName(): string {
    return this.filename;
  }

  isAccessibleTo(userId: string): boolean {
    // Check if file is public or if user owns it
    return this.metadata.isPublic || this.metadata.uploadedBy === userId;
  }

  // Business methods
  isExpired(expirationDays: number = 365): boolean {
    const expirationDate = new Date(this.createdAt);
    expirationDate.setDate(expirationDate.getDate() + expirationDays);
    return new Date() > expirationDate;
  }

  updateMetadata(newMetadata: Partial<FileMetadata>): FileEntity {
    return new FileEntity(
      this.id,
      this.filename,
      this.location,
      { ...this.metadata, ...newMetadata },
      this.createdAt,
      new Date()
    );
  }

  generatePublicUrl(baseUrl: string): string {
    if (!this.metadata.isPublic) {
      throw StorageError.invalidFile('File is not public');
    }
    return `${baseUrl}/public/${this.location.bucket}/${this.location.key}`;
  }

  // Static factory methods
  static create(id: string, filename: string, location: FileLocation, metadata: FileMetadata): FileEntity {
    return new FileEntity(id, filename, location, metadata);
  }

  // Validation methods
  validateForUpload(): boolean {
    return !!(this.filename && this.location && this.metadata);
  }

  // File type helpers
  isImage(): boolean {
    return this.metadata.mimeType.startsWith('image/');
  }

  isVideo(): boolean {
    return this.metadata.mimeType.startsWith('video/');
  }

  isAudio(): boolean {
    return this.metadata.mimeType.startsWith('audio/');
  }

  isDocument(): boolean {
    const docTypes = ['application/pdf', 'application/msword', 'text/plain'];
    return docTypes.some(type => this.metadata.mimeType.includes(type));
  }
}
