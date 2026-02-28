/**
 * Storage Provider Factory
 * Creates appropriate storage providers based on configuration following Clean Architecture principles
 */

import { getUploadsPath } from '@aiponge/platform-core';
import { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { StorageError } from '../../application/errors';

const DEFAULT_UPLOADS_PATH = getUploadsPath();

// Cloud provider configurations
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface GCSConfig {
  projectId: string;
  bucketName: string;
}

export interface CDNConfig {
  cdnDomain: string;
  origin: string;
}

export type StorageProviderType = 'local' | 's3' | 'cloudinary' | 'gcs' | 'cdn';

export interface StorageConfiguration {
  provider: StorageProviderType;
  basePath?: string;
  baseUrl?: string;
  s3?: S3Config;
  cloudinary?: CloudinaryConfig;
  gcs?: GCSConfig;
  cdn?: CDNConfig;
}

export class StorageProviderFactory {
  private static instance: StorageProviderFactory;
  private defaultConfig: StorageConfiguration;

  constructor(defaultConfig?: StorageConfiguration) {
    this.defaultConfig = defaultConfig || {
      provider: 'local',
      basePath: DEFAULT_UPLOADS_PATH,
      baseUrl: '',
    };
  }

  static getInstance(defaultConfig?: StorageConfiguration): StorageProviderFactory {
    if (!StorageProviderFactory.instance) {
      StorageProviderFactory.instance = new StorageProviderFactory(defaultConfig);
    }
    return StorageProviderFactory.instance;
  }

  async createProvider(config?: Partial<StorageConfiguration>): Promise<IStorageProvider> {
    const effectiveConfig = { ...this.defaultConfig, ...config };

    switch (effectiveConfig.provider) {
      case 'local':
        return new LocalStorageProvider(
          effectiveConfig.basePath || DEFAULT_UPLOADS_PATH,
          effectiveConfig.baseUrl || ''
        );

      case 's3': {
        if (!effectiveConfig.s3) {
          throw StorageError.invalidProvider('s3', 'S3 configuration is required when using S3 provider');
        }
        const { S3StorageProvider } = await import('./S3StorageProvider');
        return new S3StorageProvider(effectiveConfig.s3);
      }

      case 'cloudinary': {
        if (!effectiveConfig.cloudinary) {
          throw StorageError.invalidProvider(
            'cloudinary',
            'Cloudinary configuration is required when using Cloudinary provider'
          );
        }
        const { CloudinaryStorageProvider } = await import('./CloudinaryStorageProvider');
        return new CloudinaryStorageProvider(effectiveConfig.cloudinary);
      }

      case 'gcs': {
        if (!effectiveConfig.gcs) {
          throw StorageError.invalidProvider('gcs', 'GCS configuration is required when using GCS provider');
        }
        const { GCSStorageProvider } = await import('./GCSStorageProvider');
        return new GCSStorageProvider(effectiveConfig.gcs);
      }

      case 'cdn': {
        if (!effectiveConfig.cdn) {
          throw StorageError.invalidProvider('cdn', 'CDN configuration is required when using CDN provider');
        }
        const { CDNStorageProvider } = await import('./CDNStorageProvider');
        return new CDNStorageProvider(effectiveConfig.cdn);
      }

      default:
        throw StorageError.invalidProvider(effectiveConfig.provider, 'Unsupported storage provider');
    }
  }

  async getDefaultProvider(): Promise<IStorageProvider> {
    return await this.createProvider();
  }

  updateDefaultConfig(config: Partial<StorageConfiguration>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  async createAndInitializeProvider(config?: Partial<StorageConfiguration>): Promise<IStorageProvider> {
    const provider = await this.createProvider(config);
    await provider.initialize?.();
    return provider;
  }

  getSupportedProviders(): StorageProviderType[] {
    return ['local', 's3', 'cloudinary', 'gcs', 'cdn'];
  }

  validateConfiguration(config: StorageConfiguration): boolean {
    try {
      switch (config.provider) {
        case 'local':
          return true;
        case 's3':
          return !!config.s3;
        case 'cloudinary':
          return !!config.cloudinary;
        case 'gcs':
          return !!config.gcs;
        case 'cdn':
          return !!config.cdn;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}

// Export a singleton instance
export const storageProviderFactory = StorageProviderFactory.getInstance();
