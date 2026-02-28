/**
 * Storage Location Value Object
 * Represents a file location in the storage system
 */

import { StorageError } from '../../application/errors';

export class StorageLocation {
  readonly provider: string;
  readonly path: string;
  readonly publicUrl?: string;
  readonly bucket?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(provider: string, path: string, publicUrl?: string, bucket?: string, metadata?: Record<string, unknown>) {
    this.validateInputs(provider, path);

    this.provider = provider;
    this.path = this.normalizePath(path);
    this.publicUrl = publicUrl;
    this.bucket = bucket;
    this.metadata = metadata || {};
  }

  private validateInputs(provider: string, path: string): void {
    if (!provider || provider.trim().length === 0) {
      throw StorageError.invalidLocation('provider cannot be empty');
    }

    if (!path || path.trim().length === 0) {
      throw StorageError.invalidLocation('path cannot be empty');
    }
  }

  private normalizePath(path: string): string {
    // Remove leading slash and normalize path separators
    return path.replace(/^\/+/, '').replace(/\\/g, '/'); // <- Fixed: closed string literal
  }

  /**
   * Get the full storage identifier
   */
  getFullPath(): string {
    if (this.bucket) {
      return `${this.provider}://${this.bucket}/${this.path}`;
    }
    return `${this.provider}://${this.path}`;
  }

  /**
   * Get the filename from the path
   */
  getFilename(): string {
    return this.path.split('/').pop() || ''; // <- Fixed: closed string literal
  }

  /**
   * Get the file extension
   */
  getExtension(): string {
    const filename = this.getFilename();
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : ''; // <- Fixed: closed string literal
  }

  /**
   * Get the directory path (without filename)
   */
  getDirectory(): string {
    const parts = this.path.split('/');
    parts.pop();
    return parts.join('/');
  }

  /**
   * Check if this is an image file
   */
  isImage(): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    return imageExtensions.includes(this.getExtension());
  }

  /**
   * Check if this is a video file
   */
  isVideo(): boolean {
    const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
    return videoExtensions.includes(this.getExtension());
  }

  /**
   * Check if this is an audio file
   */
  isAudio(): boolean {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
    return audioExtensions.includes(this.getExtension());
  }

  /**
   * Create a new StorageLocation with updated metadata
   */
  withMetadata(metadata: Record<string, unknown>): StorageLocation {
    return new StorageLocation(this.provider, this.path, this.publicUrl, this.bucket, {
      ...this.metadata,
      ...metadata,
    });
  }

  /**
   * Create a new StorageLocation with a different path
   */
  withPath(newPath: string): StorageLocation {
    return new StorageLocation(this.provider, newPath, this.publicUrl, this.bucket, this.metadata);
  }

  /**
   * Convert to plain object for serialization
   */
  toObject(): {
    provider: string;
    path: string;
    publicUrl?: string;
    bucket?: string;
    metadata?: Record<string, unknown>;
  } {
    return {
      provider: this.provider,
      path: this.path,
      publicUrl: this.publicUrl,
      bucket: this.bucket,
      metadata: this.metadata,
    };
  }

  /**
   * Create from plain object
   */
  static fromObject(obj: {
    provider: string;
    path: string;
    publicUrl?: string;
    bucket?: string;
    metadata?: Record<string, unknown>;
  }): StorageLocation {
    return new StorageLocation(obj.provider, obj.path, obj.publicUrl, obj.bucket, obj.metadata);
  }

  /**
   * Check equality with another StorageLocation
   */
  equals(other: StorageLocation): boolean {
    return this.provider === other.provider && this.path === other.path && this.bucket === other.bucket;
  }

  toString(): string {
    return this.getFullPath();
  }
}
