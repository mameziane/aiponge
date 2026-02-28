/**
 * CDN Storage Provider
 * Implements file storage with CDN optimization
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
import { HttpUtils } from '../utils/HttpUtils';
import { getLogger } from '../../config/service-urls';
import { StorageError } from '../../application/errors';

const logger = getLogger('storage-service-cdnstorageprovider');

export interface CDNConfig {
  cdnDomain: string;
  origin: string;
  apiKey?: string;
  zone?: string;
  cacheSettings?: {
    browserTTL?: number;
    edgeTTL?: number;
    bypassOnCookie?: boolean;
  };
}

export class CDNStorageProvider implements IStorageProvider {
  private config: CDNConfig;

  constructor(config: CDNConfig) {
    this.config = config;
  }

  async upload(file: Buffer, path: string, options?: UploadOptions): Promise<UploadResult> {
    try {
      // For CDN, we typically upload to origin server
      // This is a basic implementation - in practice, you'd use the CDN provider's API

      const uploadUrl = `${this.config.origin}/${path}`;
      const response = await HttpUtils.storageRequest(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': options?.contentType || 'application/octet-stream',
          'Cache-Control': options?.cacheControl || 'public, max-age=31536000',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
          ...(options?.metadata && { 'X-Metadata': JSON.stringify(options.metadata) }),
        },
        body: file,
      });

      if (!response.ok) {
        throw StorageError.uploadFailed(`CDN upload failed: ${response.statusText}`);
      }

      const publicUrl = this.generatePublicUrl(path);
      const location = new StorageLocation('cdn', path, publicUrl, this.config.zone);

      return {
        success: true,
        location,
        publicUrl,
      };
    } catch (error) {
      logger.error('Upload failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CDN upload failed',
      };
    }
  }

  async download(path: string): Promise<DownloadResult> {
    try {
      const url = this.generatePublicUrl(path);
      const response = await HttpUtils.storageRequest(url, {
        method: 'GET',
        headers: {
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw StorageError.downloadFailed(`CDN download failed: ${response.statusText}`);
      }

      // For binary data downloads, get array buffer from response
      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      return {
        success: true,
        data,
        contentType: response.headers.get('content-type') || undefined,
        size: data.length,
      };
    } catch (error) {
      logger.error('Download failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CDN download failed',
      };
    }
  }

  async delete(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const deleteUrl = `${this.config.origin}/${path}`;
      const response = await HttpUtils.storageRequest(deleteUrl, {
        method: 'DELETE',
        headers: {
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw StorageError.deleteFailed(`CDN delete failed: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      logger.error('Delete failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CDN delete failed',
      };
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const url = this.generatePublicUrl(path);
      const response = await HttpUtils.storageRequest(url, {
        method: 'HEAD',
        headers: {
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async generateSignedUrl(
    path: string,
    expiresIn: number = 3600,
    operation: 'read' | 'write' = 'read'
  ): Promise<string> {
    // For CDN, signed URLs depend on the specific CDN provider
    // This is a basic implementation using HMAC signing

    if (!this.config.apiKey) {
      return this.generatePublicUrl(path);
    }

    try {
      const crypto = await import('crypto');
      const expiry = Math.floor(Date.now() / 1000) + expiresIn;
      const stringToSign = `${operation}:${path}:${expiry}`;
      const signature = crypto.createHmac('sha256', this.config.apiKey).update(stringToSign).digest('hex');

      return `${this.generatePublicUrl(path)}?expires=${expiry}&signature=${signature}&operation=${operation}`;
    } catch (error) {
      logger.error('Signed URL generation failed:', { error: error instanceof Error ? error.message : String(error) });
      return this.generatePublicUrl(path);
    }
  }

  async getMetadata(path: string): Promise<FileMetadata | null> {
    try {
      const url = this.generatePublicUrl(path);
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return null;
      }

      return {
        size: parseInt(response.headers.get('content-length') || '0'),
        lastModified: response.headers.get('last-modified')
          ? new Date(response.headers.get('last-modified')!)
          : new Date(),
        contentType: response.headers.get('content-type') || undefined,
      };
    } catch (error) {
      logger.error('Get metadata failed:', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  async listFiles(_prefix: string): Promise<string[]> {
    try {
      // CDN providers typically don't support listing
      // This would need to be implemented based on your CDN provider's API
      logger.warn('List files not supported by CDN provider');
      return [];
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
      name: 'cdn',
      supportsSignedUrls: !!this.config.apiKey,
      supportsStreaming: true,
      supportsPublicUrls: true,
    };
  }

  async initialize(): Promise<void> {
    // Test connectivity to CDN
    try {
      const testUrl = `${this.config.cdnDomain}/health`;
      await fetch(testUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      logger.info('Initialized for domain: {}', { data0: this.config.cdnDomain });
    } catch (error) {
      logger.warn('Could not verify CDN connectivity:', { data: error });
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleanup completed');
  }

  private generatePublicUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${this.config.cdnDomain}/${cleanPath}`;
  }
}
