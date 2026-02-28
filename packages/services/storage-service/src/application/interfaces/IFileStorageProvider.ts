/**
 * File Storage Provider Interface
 * Infrastructure abstraction for storage operations
 */

import { StorageLocation } from '../../domains/value-objects/StorageLocation';

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  isPublic?: boolean;
  expiresIn?: number;
}

export interface UploadResult {
  success: boolean;
  location?: StorageLocation;
  publicUrl?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  data?: Buffer;
  stream?: import('stream').Readable;
  contentType?: string;
  size?: number;
  error?: string;
}

export interface FileMetadata {
  size: number;
  lastModified: Date;
  contentType?: string;
  checksum?: string;
}

export interface IFileStorageProvider {
  /**
   * Upload a file to storage
   */
  upload(_file: Buffer, _path: string, _options?: UploadOptions): Promise<UploadResult>;

  /**
   * Download a file from storage
   */
  download(_path: string): Promise<DownloadResult>;

  /**
   * Delete a file from storage
   */
  delete(_path: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Check if a file exists
   */
  exists(_path: string): Promise<boolean>;

  /**
   * Generate a signed URL for temporary access
   */
  generateSignedUrl(_path: string, _expiresIn?: number, _operation?: 'read' | 'write'): Promise<string>;

  /**
   * Get file metadata without downloading content
   */
  getMetadata(_path: string): Promise<FileMetadata | null>;

  /**
   * List files in a directory
   */
  listFiles(_prefix: string): Promise<string[]>;

  /**
   * Get the public URL for a file (if supported)
   */
  getPublicUrl(_path: string): string | null;

  /**
   * Get provider-specific information
   */
  getProviderInfo(): {
    name: string;
    supportsSignedUrls: boolean;
    supportsStreaming: boolean;
    supportsPublicUrls: boolean;
  };

  /**
   * Initialize the provider
   */
  initialize(): Promise<void>;

  /**
   * Cleanup resources
   */
  cleanup(): Promise<void>;
}
