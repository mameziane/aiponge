/**
 * Cloudinary Storage Provider
 * Implements file storage using Cloudinary with image optimization
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
import { createHttpClient } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { StorageError } from '../../application/errors';

const logger = getLogger('storage-service-cloudinarystorageprovider');

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder?: string;
  useAutoOptimization?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CloudinarySDK = any;

export class CloudinaryStorageProvider implements IStorageProvider {
  private cloudinary: CloudinarySDK;
  private config: CloudinaryConfig;
  private isInitialized: boolean = false;
  private httpClient = createHttpClient({
    timeout: 30000,
    retries: 2,
    serviceName: 'storage-service',
  });

  constructor(config: CloudinaryConfig) {
    this.config = config;
  }

  private async initializeCloudinary() {
    if (this.isInitialized) return;

    try {
      // Dynamic import - cloudinary is an optional dependency
      // @ts-expect-error - cloudinary is an optional peer dependency
      const cloudinary = await import('cloudinary').catch(() => {
        throw StorageError.serviceUnavailable('Cloudinary SDK not installed. Run: npm install cloudinary');
      });

      cloudinary.v2.config({
        cloud_name: this.config.cloudName,
        api_key: this.config.apiKey,
        api_secret: this.config.apiSecret,
      });

      this.cloudinary = cloudinary.v2;
      this.isInitialized = true;
      logger.info('Initialized for cloud: {}', { data0: this.config.cloudName });
    } catch (error) {
      logger.error('Failed to initialize Cloudinary:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async upload(file: Buffer, path: string, options?: UploadOptions): Promise<UploadResult> {
    await this.initializeCloudinary();

    try {
      const base64File = `data:${options?.contentType || 'application/octet-stream'};base64,${file.toString('base64')}`;

      const uploadOptions: Record<string, unknown> = {
        public_id: path,
        folder: this.config.folder,
        resource_type: this.detectResourceType(options?.contentType),
        use_filename: true,
        unique_filename: false,
        overwrite: true,
      };

      if (this.config.useAutoOptimization && this.isImage(options?.contentType)) {
        uploadOptions.transformation = [{ quality: 'auto', fetch_format: 'auto' }];
      }

      if (options?.isPublic !== false) {
        uploadOptions.type = 'upload';
      }

      const result = await this.cloudinary.uploader.upload(base64File, uploadOptions);
      const location = new StorageLocation('cloudinary', result.public_id, result.secure_url);

      return {
        success: true,
        location,
        publicUrl: result.secure_url,
      };
    } catch (error) {
      logger.error('Upload failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cloudinary upload failed',
      };
    }
  }

  async download(path: string): Promise<DownloadResult> {
    try {
      // Generate URL and fetch the file with binary response
      const url = this.generatePublicUrl(path);
      const rawResponse = await this.httpClient.get(url, {
        responseType: 'arraybuffer',
      });
      const response = rawResponse as {
        success?: boolean;
        status?: number;
        statusText?: string;
        data?: ArrayBuffer;
        headers?: Record<string, string>;
      };

      if (!response.success) {
        throw StorageError.downloadFailed(
          `Cloudinary download failed - HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = Buffer.from(response.data as ArrayBuffer);

      return {
        success: true,
        data,
        contentType: response.headers?.['content-type'] || undefined,
        size: data.length,
      };
    } catch (error) {
      logger.error('Download failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cloudinary download failed',
      };
    }
  }

  async delete(path: string): Promise<{ success: boolean; error?: string }> {
    await this.initializeCloudinary();

    try {
      await this.cloudinary.uploader.destroy(path);
      return { success: true };
    } catch (error) {
      logger.error('Delete failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cloudinary delete failed',
      };
    }
  }

  async exists(path: string): Promise<boolean> {
    await this.initializeCloudinary();

    try {
      await this.cloudinary.api.resource(path);
      return true;
    } catch {
      return false;
    }
  }

  async generateSignedUrl(
    path: string,
    _expiresIn: number = 3600,
    operation: 'read' | 'write' = 'read'
  ): Promise<string> {
    if (operation === 'read') {
      return this.generatePublicUrl(path);
    }

    // For write operations, generate upload URL
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = this.cloudinary.utils.api_sign_request({ public_id: path, timestamp }, this.config.apiSecret);

    const uploadUrl =
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/upload` +
      `?api_key=${this.config.apiKey}&timestamp=${timestamp}&signature=${signature}`;
    return uploadUrl;
  }

  async getMetadata(path: string): Promise<FileMetadata | null> {
    await this.initializeCloudinary();

    try {
      const resource = await this.cloudinary.api.resource(path);
      return {
        size: resource.bytes,
        lastModified: new Date(resource.created_at),
        contentType: resource.resource_type === 'image' ? `image/${resource.format}` : undefined,
      };
    } catch (error) {
      logger.error('Get metadata failed:', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    await this.initializeCloudinary();

    try {
      const result = await this.cloudinary.api.resources({
        type: 'upload',
        prefix: prefix,
        max_results: 500,
      });

      return result.resources.map((resource: { public_id: string }) => resource.public_id);
    } catch (error) {
      logger.error('List files failed:', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  getPublicUrl(path: string): string {
    return this.generatePublicUrl(path);
  }

  getProviderInfo(): StorageProviderInfo {
    return {
      name: 'cloudinary',
      supportsSignedUrls: true,
      supportsStreaming: false,
      supportsPublicUrls: true,
    };
  }

  async initialize(): Promise<void> {
    await this.initializeCloudinary();
  }

  async cleanup(): Promise<void> {
    this.cloudinary = null;
    this.isInitialized = false;
    logger.info('Cleanup completed');
  }

  private generatePublicUrl(path: string): string {
    return `https://res.cloudinary.com/${this.config.cloudName}/image/upload/${path}`;
  }

  private detectResourceType(contentType?: string): string {
    if (!contentType) return 'auto';
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'video'; // Cloudinary treats audio as video
    return 'raw';
  }

  private isImage(contentType?: string): boolean {
    return contentType?.startsWith('image/') || false;
  }
}
