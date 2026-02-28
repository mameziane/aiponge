/**
 * Consolidated Storage Provider Interface
 * Infrastructure abstraction for all storage operations following Clean Architecture principles
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

export interface StorageResult {
  success: boolean;
  location: StorageLocation;
  error?: string;
}

export interface StorageProviderInfo {
  name: string;
  supportsSignedUrls: boolean;
  supportsStreaming: boolean;
  supportsPublicUrls: boolean;
}

/**
 * Primary Storage Provider Interface
 * Defines the contract for all storage implementations
 */
export interface IStorageProvider {
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
  getProviderInfo(): StorageProviderInfo;

  /**
   * Initialize the provider
   */
  initialize(): Promise<void>;

  /**
   * Cleanup resources
   */
  cleanup(): Promise<void>;
}

/**
 * Extended File Storage Provider Interface
 * Includes additional file-specific operations
 */
export interface IFileStorageProvider extends IStorageProvider {
  /**
   * Validate file access for a user
   */
  validateFileAccess(_fileId: string, _userId: number): Promise<boolean>;

  /**
   * Upload file with validation rules
   */
  uploadWithValidation(_file: Buffer, _location: StorageLocation, _validationRules?: unknown): Promise<StorageResult>;
}
