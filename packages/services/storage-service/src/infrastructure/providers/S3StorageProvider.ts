/**
 * AWS S3 Storage Provider
 * Implements file storage using Amazon S3
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
import { logAndTrackError } from '@aiponge/platform-core';

const logger = getLogger('storage-service-s3storageprovider');

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  cdnDomain?: string;
}

interface S3CommandOutput {
  Body?:
    | Buffer
    | {
        transformToByteArray?(): Promise<Uint8Array>;
        getReader(): { read(): Promise<{ done: boolean; value: Uint8Array }> };
      };
  ContentType?: string;
  ContentLength?: number;
  LastModified?: Date;
  ETag?: string;
  Contents?: Array<{ Key?: string }>;
}

interface S3ClientInstance {
  send(command: unknown): Promise<S3CommandOutput>;
}

export class S3StorageProvider implements IStorageProvider {
  private s3Client: S3ClientInstance | null = null;
  private config: S3Config;
  private isInitialized: boolean = false;

  constructor(config: S3Config) {
    this.config = config;
  }

  private async initializeS3Client() {
    if (this.isInitialized) return;

    try {
      const { S3Client } = await import('@aws-sdk/client-s3');

      this.s3Client = new S3Client({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        endpoint: this.config.endpoint,
      }) as unknown as S3ClientInstance;

      this.isInitialized = true;
      logger.info('Initialized for bucket: {}', { data0: this.config.bucket });
    } catch (error) {
      const { error: wrappedError, correlationId } = logAndTrackError(
        error,
        'S3 client initialization failed - S3 storage operations unavailable',
        {
          bucket: this.config.bucket,
          region: this.config.region,
          endpoint: this.config.endpoint,
          hasCredentials: !!(this.config.accessKeyId && this.config.secretAccessKey),
        },
        'S3_STORAGE_PROVIDER_INIT_FAILURE',
        500 // Critical - storage provider cannot initialize
      );

      logger.error(`S3 initialization failed with correlation ${correlationId}`, {
        correlationId,
        bucket: this.config.bucket,
      });

      throw wrappedError;
    }
  }

  async upload(file: Buffer, path: string, options?: UploadOptions): Promise<UploadResult> {
    await this.initializeS3Client();

    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
        Body: file,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl,
        Metadata: options?.metadata,
        ACL: options?.isPublic ? 'public-read' : 'private',
      });

      await this.s3Client!.send(command);

      const publicUrl = this.generatePublicUrl(path);
      const location = new StorageLocation('s3', path, publicUrl, this.config.bucket);

      return {
        success: true,
        location,
        publicUrl,
      };
    } catch (error) {
      const { error: wrappedError, correlationId } = logAndTrackError(
        error,
        'S3 file upload operation failed',
        {
          bucket: this.config.bucket,
          path,
          fileSize: file.length,
          contentType: options?.contentType,
          isPublic: options?.isPublic,
          hasMetadata: !!options?.metadata,
        },
        'S3_STORAGE_UPLOAD_FAILURE',
        500
      );

      logger.error(`S3 upload failed with correlation ${correlationId}`, {
        correlationId,
        path,
        bucket: this.config.bucket,
      });

      return {
        success: false,
        error: wrappedError instanceof Error ? wrappedError.message : String(wrappedError),
      };
    }
  }

  async download(path: string): Promise<DownloadResult> {
    await this.initializeS3Client();

    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');

      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
      });

      const response = await this.s3Client!.send(command);

      if (response.Body) {
        let data: Buffer;

        if (response.Body instanceof Buffer) {
          data = response.Body;
        } else {
          const streamBody = response.Body as Exclude<typeof response.Body, Buffer>;
          if (streamBody.transformToByteArray) {
            const byteArray = await streamBody.transformToByteArray();
            data = Buffer.from(byteArray);
          } else {
            const chunks: Uint8Array[] = [];
            const reader = streamBody.getReader();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }

            data = Buffer.concat(chunks);
          }
        }

        return {
          success: true,
          data,
          contentType: response.ContentType,
          size: response.ContentLength || data.length,
        };
      }

      return {
        success: false,
        error: 'No data received from S3',
      };
    } catch (error) {
      const { error: wrappedError, correlationId } = logAndTrackError(
        error,
        'S3 file download operation failed',
        {
          bucket: this.config.bucket,
          path,
          operation: 'download',
        },
        'S3_STORAGE_DOWNLOAD_FAILURE',
        500
      );

      logger.error(`S3 download failed with correlation ${correlationId}`, {
        correlationId,
        path,
        bucket: this.config.bucket,
      });

      return {
        success: false,
        error: wrappedError instanceof Error ? wrappedError.message : String(wrappedError),
      };
    }
  }

  async delete(path: string): Promise<{ success: boolean; error?: string }> {
    await this.initializeS3Client();

    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
      });

      await this.s3Client!.send(command);
      return { success: true };
    } catch (error) {
      logger.error('Delete failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'S3 delete failed',
      };
    }
  }

  async exists(path: string): Promise<boolean> {
    await this.initializeS3Client();

    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
      });

      await this.s3Client!.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async generateSignedUrl(
    path: string,
    expiresIn: number = 3600,
    operation: 'read' | 'write' = 'read'
  ): Promise<string> {
    await this.initializeS3Client();

    try {
      const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const command =
        operation === 'write'
          ? new PutObjectCommand({ Bucket: this.config.bucket, Key: path })
          : new GetObjectCommand({ Bucket: this.config.bucket, Key: path });

      return await getSignedUrl(this.s3Client as unknown as Parameters<typeof getSignedUrl>[0], command, { expiresIn });
    } catch (error) {
      logger.error('Signed URL generation failed:', { error: error instanceof Error ? error.message : String(error) });
      return this.generatePublicUrl(path);
    }
  }

  async getMetadata(path: string): Promise<FileMetadata | null> {
    await this.initializeS3Client();

    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
      });

      const response = await this.s3Client!.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType,
        checksum: response.ETag?.replace(/"/g, ''),
      };
    } catch (error) {
      logger.error('Get metadata failed:', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    await this.initializeS3Client();

    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');

      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
      });

      const response = await this.s3Client!.send(command);
      return response.Contents?.map((obj: { Key?: string }) => obj.Key! as string).filter((key: string) => key) || [];
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
      name: 's3',
      supportsSignedUrls: true,
      supportsStreaming: true,
      supportsPublicUrls: true,
    };
  }

  async initialize(): Promise<void> {
    await this.initializeS3Client();
  }

  async cleanup(): Promise<void> {
    this.s3Client = null as unknown as S3ClientInstance;
    this.isInitialized = false;
    logger.info('Cleanup completed');
  }

  private generatePublicUrl(path: string): string {
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${path}`;
  }
}
