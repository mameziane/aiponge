/**
 * Google Cloud Storage Provider
 * Implements file storage using Google Cloud Storage
 */

import {
  IStorageProvider,
  UploadOptions,
  UploadResult,
  DownloadResult,
  FileMetadata,
  StorageProviderInfo,
} from '../../application/interfaces/IStorageProvider';
import { StorageLocation } from '../../domains/value-objects/StorageLocation';
import { getLogger } from '../../config/service-urls';
import { StorageError } from '../../application/errors';

const logger = getLogger('storage-service-gcsstorageprovider');

export interface GCSConfig {
  projectId: string;
  bucketName: string;
  keyFilename?: string;
  credentials?: Record<string, unknown>;
  cdnDomain?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GCSBucket = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GCSStorage = any;

export class GCSStorageProvider implements IStorageProvider {
  private storage: GCSStorage;
  private bucket: GCSBucket;
  private config: GCSConfig;
  private isInitialized: boolean = false;

  constructor(config: GCSConfig) {
    this.config = config;
  }

  private async initializeGCS() {
    if (this.isInitialized) return;

    try {
      // @ts-expect-error - GCS SDK is an optional peer dependency
      const { Storage } = await import('@google-cloud/storage');

      const storageOptions: Record<string, unknown> = {
        projectId: this.config.projectId,
      };

      if (this.config.keyFilename) {
        storageOptions.keyFilename = this.config.keyFilename;
      } else if (this.config.credentials) {
        storageOptions.credentials = this.config.credentials;
      }

      this.storage = new Storage(storageOptions);
      this.bucket = this.storage.bucket(this.config.bucketName);
      this.isInitialized = true;

      logger.info('Initialized for bucket: {}', { data0: this.config.bucketName });
    } catch (error) {
      logger.error('Failed to initialize GCS client:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw StorageError.serviceUnavailable(
        'Google Cloud Storage SDK not available. Install @google-cloud/storage',
        error instanceof Error ? error : undefined
      );
    }
  }

  async upload(file: Buffer, path: string, options?: UploadOptions): Promise<UploadResult> {
    await this.initializeGCS();

    try {
      const gcsFile = this.bucket.file(path);

      const uploadOptions: Record<string, unknown> = {
        metadata: {
          contentType: options?.contentType,
          cacheControl: options?.cacheControl,
          metadata: options?.metadata,
        },
      };

      if (options?.isPublic) {
        uploadOptions.public = true;
      }

      await gcsFile.save(file, uploadOptions);

      const publicUrl = this.generatePublicUrl(path);
      const location = new StorageLocation('gcs', path, publicUrl, this.config.bucketName);

      return {
        success: true,
        location,
        publicUrl,
      };
    } catch (error) {
      logger.error('Upload failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GCS upload failed',
      };
    }
  }

  async download(path: string): Promise<DownloadResult> {
    await this.initializeGCS();

    try {
      const gcsFile = this.bucket.file(path);
      const [data] = await gcsFile.download();
      const [metadata] = await gcsFile.getMetadata();

      return {
        success: true,
        data,
        contentType: metadata.contentType,
        size: parseInt(metadata.size) || data.length,
      };
    } catch (error) {
      logger.error('Download failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GCS download failed',
      };
    }
  }

  async delete(path: string): Promise<{ success: boolean; error?: string }> {
    await this.initializeGCS();

    try {
      const gcsFile = this.bucket.file(path);
      await gcsFile.delete();
      return { success: true };
    } catch (error) {
      logger.error('Delete failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GCS delete failed',
      };
    }
  }

  async exists(path: string): Promise<boolean> {
    await this.initializeGCS();

    try {
      const gcsFile = this.bucket.file(path);
      const [exists] = await gcsFile.exists();
      return exists;
    } catch {
      return false;
    }
  }

  async generateSignedUrl(
    path: string,
    expiresIn: number = 3600,
    operation: 'read' | 'write' = 'read'
  ): Promise<string> {
    await this.initializeGCS();

    try {
      const gcsFile = this.bucket.file(path);
      const options = {
        version: 'v4' as const,
        action: operation === 'read' ? ('read' as const) : ('write' as const),
        expires: Date.now() + expiresIn * 1000,
      };

      const [signedUrl] = await gcsFile.getSignedUrl(options);
      return signedUrl;
    } catch (error) {
      logger.error('Signed URL generation failed:', { error: error instanceof Error ? error.message : String(error) });
      return this.generatePublicUrl(path);
    }
  }

  async getMetadata(path: string): Promise<FileMetadata | null> {
    await this.initializeGCS();

    try {
      const gcsFile = this.bucket.file(path);
      const [metadata] = await gcsFile.getMetadata();

      return {
        size: parseInt(metadata.size) || 0,
        lastModified: new Date(metadata.timeCreated),
        contentType: metadata.contentType,
        checksum: metadata.md5Hash,
      };
    } catch (error) {
      logger.error('Get metadata failed:', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    await this.initializeGCS();

    try {
      const [files] = await this.bucket.getFiles({ prefix });
      return files.map((file: { name: string }) => file.name);
    } catch (error) {
      logger.error('List files failed:', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  getPublicUrl(path: string): string | null {
    if (this.config.cdnDomain) {
      return `${this.config.cdnDomain}/${path}`;
    }
    return this.generatePublicUrl(path);
  }

  getProviderInfo(): StorageProviderInfo {
    return {
      name: 'gcs',
      supportsSignedUrls: true,
      supportsStreaming: true,
      supportsPublicUrls: true,
    };
  }

  async initialize(): Promise<void> {
    await this.initializeGCS();
  }

  async cleanup(): Promise<void> {
    this.storage = null;
    this.bucket = null;
    this.isInitialized = false;
    logger.info('Cleanup completed');
  }

  private generatePublicUrl(path: string): string {
    return `https://storage.googleapis.com/${this.config.bucketName}/${path}`;
  }
}
