/**
 * Production Storage Provider
 * Real implementation replacing mock providers
 */

import {
  IStorageProvider,
  UploadOptions,
  UploadResult,
  DownloadResult,
} from '../../application/interfaces/IStorageProvider';
import { S3StorageProvider, S3Config } from './S3StorageProvider';
import { CloudinaryStorageProvider, CloudinaryConfig } from './CloudinaryStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { getLogger } from '../../config/service-urls';
import { StorageError } from '../../application/errors';

const logger = getLogger('storage-service-productionstorageprovider');

export interface ProductionStorageConfig {
  provider: 'local' | 's3' | 'cloudinary';
  s3Config?: S3Config;
  cloudinaryConfig?: CloudinaryConfig;
  localPath?: string;
}

export class ProductionStorageProvider implements IStorageProvider {
  private provider: IStorageProvider;

  constructor(config: ProductionStorageConfig) {
    this.initializeProvider(config);
  }

  private async initializeProvider(config: ProductionStorageConfig) {
    logger.warn('Initializing {} provider...', { data0: config.provider });

    try {
      switch (config.provider) {
        case 's3':
          if (!config.s3Config) {
            throw StorageError.invalidProvider('s3', 'S3 configuration is required when using S3 provider');
          }
          this.provider = new S3StorageProvider(config.s3Config);
          break;

        case 'cloudinary':
          if (!config.cloudinaryConfig) {
            throw StorageError.invalidProvider(
              'cloudinary',
              'Cloudinary configuration is required when using Cloudinary provider'
            );
          }
          this.provider = new CloudinaryStorageProvider(config.cloudinaryConfig);
          break;

        case 'local':
        default:
          logger.warn('Using local storage provider');
          this.provider = new LocalStorageProvider(config.localPath || './storage');
          break;
      }

      await this.provider.initialize?.();
      logger.warn('{} provider initialized successfully', { data0: config.provider });
    } catch (error) {
      logger.error('Failed to initialize ${config.provider}:', {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn('Falling back to local storage provider');
      this.provider = new LocalStorageProvider(config.localPath || './storage');
      await this.provider.initialize?.();
    }
  }

  async upload(file: Buffer, path: string, options?: UploadOptions): Promise<UploadResult> {
    logger.warn('Uploading file: {}', { data0: path });
    return await this.provider.upload(file, path, options);
  }

  async download(path: string): Promise<DownloadResult> {
    logger.warn('Downloading file: {}', { data0: path });
    return await this.provider.download(path);
  }

  async delete(path: string): Promise<{ success: boolean; error?: string }> {
    logger.warn('Deleting file: {}', { data0: path });
    return await this.provider.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return await this.provider.exists(path);
  }

  async generateSignedUrl(
    path: string,
    expiresIn: number = 3600,
    operation: 'read' | 'write' = 'read'
  ): Promise<string> {
    return await this.provider.generateSignedUrl(path, expiresIn, operation);
  }

  async getMetadata(path: string): Promise<{
    size: number;
    lastModified: Date;
    contentType?: string;
  } | null> {
    return await this.provider.getMetadata(path);
  }

  async listFiles(prefix: string): Promise<string[]> {
    return await this.provider.listFiles(prefix);
  }

  getPublicUrl(path: string): string | null {
    return this.provider.getPublicUrl(path);
  }

  getProviderInfo() {
    return this.provider.getProviderInfo();
  }

  async initialize(): Promise<void> {
    await this.provider.initialize?.();
  }

  async cleanup(): Promise<void> {
    await this.provider.cleanup?.();
  }
}
