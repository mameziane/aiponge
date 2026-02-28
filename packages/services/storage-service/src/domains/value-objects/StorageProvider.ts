/**
 * Storage Provider Value Object
 * Represents different storage provider types
 */

import { StorageError } from '../../application/errors';

export type StorageProviderType = 'local' | 's3' | 'gcs' | 'cloudinary' | 'cdn';

export class StorageProvider {
  private static readonly VALID_PROVIDERS: StorageProviderType[] = ['local', 's3', 'gcs', 'cloudinary', 'cdn'];

  constructor(public readonly type: StorageProviderType) {
    if (!StorageProvider.VALID_PROVIDERS.includes(type)) {
      throw StorageError.invalidProvider(type, 'not a valid provider type');
    }
  }

  isLocal(): boolean {
    return this.type === 'local';
  }

  isCloud(): boolean {
    return ['s3', 'gcs', 'cloudinary'].includes(this.type);
  }

  isCDN(): boolean {
    return this.type === 'cdn';
  }

  supportsSignedUrls(): boolean {
    return ['s3', 'gcs', 'cloudinary'].includes(this.type);
  }

  supportsPublicUrls(): boolean {
    return true; // All providers support public URLs
  }

  supportsStreaming(): boolean {
    return ['local', 's3', 'gcs'].includes(this.type);
  }

  toString(): string {
    return this.type;
  }

  equals(other: StorageProvider): boolean {
    return this.type === other.type;
  }

  static fromString(type: string): StorageProvider {
    return new StorageProvider(type as StorageProviderType);
  }

  static getAvailableProviders(): StorageProviderType[] {
    return [...StorageProvider.VALID_PROVIDERS];
  }
}
