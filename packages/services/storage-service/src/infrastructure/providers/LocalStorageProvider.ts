/**
 * Local Storage Provider Implementation
 * Implements file storage on the local filesystem
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  IStorageProvider,
  UploadOptions,
  UploadResult,
  DownloadResult,
  FileMetadata,
} from '../../application/interfaces/IStorageProvider';
import { StorageLocation } from '../../domains/value-objects/StorageLocation';
import { getLogger } from '../../config/service-urls';
import { logAndTrackError } from '@aiponge/platform-core';

const logger = getLogger('storage-service-localstorageprovider');

export class LocalStorageProvider implements IStorageProvider {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(basePath: string = './uploads', baseUrl: string = '') {
    // <- Fixed: closed string literal
    this.basePath = path.resolve(basePath);
    this.baseUrl = baseUrl;
  }

  async upload(file: Buffer, filePath: string, options?: UploadOptions): Promise<UploadResult> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      const directory = path.dirname(fullPath);

      // Ensure directory exists
      await fs.mkdir(directory, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, file);

      // Calculate checksum
      const checksum = crypto.createHash('md5').update(file).digest('hex');

      // Create storage location
      const location = new StorageLocation('local', filePath, this.getPublicUrl(filePath), undefined, {
        checksum,
        size: file.length,
        contentType: options?.contentType,
      });

      return {
        success: true,
        location,
        publicUrl: this.getPublicUrl(filePath),
      };
    } catch (error) {
      const { error: wrappedError, correlationId } = logAndTrackError(
        error,
        'Local storage file upload operation failed',
        {
          basePath: this.basePath,
          filePath,
          fileSize: file.length,
          contentType: options?.contentType,
          operation: 'upload',
        },
        'LOCAL_STORAGE_UPLOAD_FAILURE',
        500
      );

      logger.error(`Local storage upload failed with correlation ${correlationId}`, {
        correlationId,
        filePath,
        basePath: this.basePath,
      });

      return {
        success: false,
        error: wrappedError instanceof Error ? wrappedError.message : String(wrappedError),
      };
    }
  }

  async download(filePath: string): Promise<DownloadResult> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      const data = await fs.readFile(fullPath);
      const stats = await fs.stat(fullPath);

      return {
        success: true,
        data,
        contentType: this.getContentType(filePath),
        size: stats.size,
      };
    } catch (error) {
      const { error: wrappedError, correlationId } = logAndTrackError(
        error,
        'Local storage file download operation failed',
        {
          basePath: this.basePath,
          filePath,
          operation: 'download',
        },
        'LOCAL_STORAGE_DOWNLOAD_FAILURE',
        500
      );

      logger.error(`Local storage download failed with correlation ${correlationId}`, {
        correlationId,
        filePath,
        basePath: this.basePath,
      });

      return {
        success: false,
        error: wrappedError instanceof Error ? wrappedError.message : String(wrappedError),
      };
    }
  }

  async delete(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fs.unlink(fullPath);
      return { success: true };
    } catch (error) {
      logger.error('Delete failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed', // <- Fixed: Error to error
      };
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async generateSignedUrl(
    filePath: string,
    expiresIn: number = 3600,
    operation: 'read' | 'write' = 'read'
  ): Promise<string> {
    // Local storage doesn't support true signed URLs
    // Return the public URL with a timestamp for basic security
    const publicUrl = this.getPublicUrl(filePath);
    const timestamp = Date.now() + expiresIn * 1000;
    return `${publicUrl}?expires=${timestamp}&op=${operation}&token=${this.generateToken(filePath, timestamp)}`;
  }

  async getMetadata(filePath: string): Promise<FileMetadata | null> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      const stats = await fs.stat(fullPath);

      // Try to read checksum from extended attributes or calculate it
      let checksum: string | undefined;
      try {
        const data = await fs.readFile(fullPath);
        checksum = crypto.createHash('md5').update(data).digest('hex');
      } catch {
        // Ignore checksum calculation errors
      }

      return {
        size: stats.size,
        lastModified: stats.mtime,
        contentType: this.getContentType(filePath),
        checksum,
      };
    } catch (error) {
      logger.error('Get metadata failed:', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    try {
      const dirPath = path.join(this.basePath, prefix);
      const files = await this.getAllFiles(dirPath, prefix);
      return files;
    } catch (error) {
      logger.error('List files failed:', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  private async getAllFiles(dirPath: string, _prefix: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.basePath, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath, _prefix);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      // Directory doesn't exist or access denied
    }

    return files;
  }

  getPublicUrl(filePath: string): string {
    // Ensure path starts with /uploads/ for web URLs (matching API Gateway routing)
    // filePath comes in as "artwork/file.png" or "music/file.mp3"
    const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    const webPath = `/uploads/${normalizedPath}`;
    return this.baseUrl ? `${this.baseUrl}${webPath}` : webPath;
  }

  getProviderInfo() {
    return {
      name: 'local',
      supportsSignedUrls: false, // Not true signed URLs
      supportsStreaming: true,
      supportsPublicUrls: true,
    };
  }

  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.basePath);
    logger.warn('Initialized with base path: {}', { data0: this.basePath });
  }

  async cleanup(): Promise<void> {
    logger.warn('Cleanup completed');
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        const { error: wrappedError, correlationId } = logAndTrackError(
          mkdirError,
          'Local storage directory creation failed - storage may be unavailable',
          {
            dirPath,
            basePath: this.basePath,
            operation: 'ensure_directory',
          },
          'LOCAL_STORAGE_DIRECTORY_CREATION_FAILURE',
          500
        );

        logger.error(`Directory creation failed with correlation ${correlationId}`, {
          correlationId,
          dirPath,
        });

        throw wrappedError;
      }
    }
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.html': 'text/html',
      '.xml': 'application/xml',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  private generateToken(filePath: string, timestamp: number): string {
    const secret = process.env.STORAGE_SECRET;
    if (!secret) {
      logger.warn('STORAGE_SECRET not set - using fallback for development', {
        hint: 'Set STORAGE_SECRET for production use',
      });
      const fallback = 'dev-fallback-' + process.env.REPL_ID?.substring(0, 8);
      return crypto.createHmac('sha256', fallback).update(`${filePath}:${timestamp}`).digest('hex');
    }
    return crypto.createHmac('sha256', secret).update(`${filePath}:${timestamp}`).digest('hex');
  }
}
