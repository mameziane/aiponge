/**
 * StorageServiceClient - HTTP client for storage service integration
 *
 * Migrated from music-service to ai-content-service for centralized image generation.
 * Uses @aiponge/platform-core for logging and local service-urls.ts for service discovery.
 */

import {
  createLogger,
  withServiceResilience,
  type HttpClient,
  DomainError,
} from '@aiponge/platform-core';
import { createServiceClient } from '../../config/service-urls';
import { Readable } from 'stream';

const logger = createLogger('ai-content-storage-service-client');

export interface StorageUploadRequest {
  fileName: string;
  contentType: string;
  fileSize?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  folder?: string;
  isPublic?: boolean;
  expiresAt?: Date;
}

export interface StorageUploadResponse {
  success: boolean;
  fileId?: string;
  uploadUrl?: string;
  publicUrl?: string;
  cdnUrl?: string;
  error?: string;
}

export interface StorageDownloadRequest {
  fileId: string;
  expiresIn?: number;
  disposition?: 'inline' | 'attachment';
}

export interface StorageDownloadResponse {
  success: boolean;
  downloadUrl?: string;
  expiresAt?: Date;
  error?: string;
}

export interface FileMetadata {
  fileId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  folder?: string;
  isPublic: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  uploadedAt: Date;
  lastAccessed?: Date;
  downloadCount: number;
  cdnUrl?: string;
  publicUrl?: string;
}

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  usedStorage: number;
  availableStorage: number;
  monthlyBandwidth: number;
  filesThisMonth: number;
  storageByType: Record<string, { count: number; size: number }>;
  topFiles: Array<{
    fileId: string;
    fileName: string;
    downloadCount: number;
    fileSize: number;
  }>;
}

export class StorageServiceClient {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;

  constructor() {
    const { httpClient, baseUrl } = createServiceClient('storage-service', { type: 'internal', timeout: 120000 });
    this.httpClient = httpClient;
    this.baseUrl = baseUrl;
    logger.debug('StorageServiceClient initialized', { baseUrl });
  }

  async uploadImage(request: StorageUploadRequest, fileData?: Buffer | Readable): Promise<StorageUploadResponse> {
    return withServiceResilience(
      'storage-service',
      'uploadImage',
      async () => {
        try {
          logger.info('Uploading image file', {
            fileName: request.fileName,
            contentType: request.contentType,
          });

          const uploadData = await this.httpClient.post<{
            success: boolean;
            fileId?: string;
            uploadUrl?: string;
            publicUrl?: string;
            cdnUrl?: string;
            error?: string;
          }>('/api/images/upload/prepare', {
            fileName: request.fileName,
            contentType: request.contentType,
            fileSize: request.fileSize,
            metadata: {
              ...request.metadata,
              service: 'ai-content-service',
              fileType: 'image',
            },
            tags: request.tags || ['image', 'ai-generated'],
            folder: request.folder || 'images',
            isPublic: request.isPublic || false,
            expiresAt: request.expiresAt,
          });

          if (!uploadData.success) {
            return {
              success: false,
              error: uploadData.error || 'Failed to prepare upload',
            };
          }

          const { fileId, uploadUrl, publicUrl, cdnUrl } = uploadData;

          if (fileData && uploadUrl) {
            await this.uploadToPresignedUrl(uploadUrl, fileData, request.contentType);
            await this.confirmUpload(fileId!);
            logger.info('Image file uploaded successfully', { fileId });
          }

          return {
            success: true,
            fileId,
            uploadUrl,
            publicUrl,
            cdnUrl,
          };
        } catch (error) {
          logger.error('Upload image error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image upload failed',
          };
        }
      },
      'internal-service'
    );
  }

  async downloadFromExternalUrl(params: {
    taskId: string;
    externalUrl: string;
    metadata?: Record<string, unknown>;
    destinationPath?: string;
  }): Promise<{
    success: boolean;
    filePath?: string;
    localPath?: string;
    size?: number;
    format?: string;
    fileId?: string;
    error?: string;
  }> {
    return withServiceResilience(
      'storage-service',
      'downloadFromExternalUrl',
      async () => {
        try {
          logger.info('Downloading from external URL', {
            taskId: params.taskId,
            externalUrl: params.externalUrl.substring(0, 60),
          });

          const data = await this.httpClient.post<{
            success: boolean;
            data?: {
              filePath?: string;
              localPath?: string;
              size?: number;
              format?: string;
              fileId?: string;
            };
            filePath?: string;
            error?: string;
          }>('/api/storage/download-external', {
            taskId: params.taskId,
            externalUrl: params.externalUrl,
            metadata: params.metadata,
            destinationPath: params.destinationPath,
          });

          if (!data.success) {
            return {
              success: false,
              error: data.error || 'Failed to download from external URL',
            };
          }

          const responseData = data.data;
          const filePath = responseData?.filePath || data.filePath;

          if (!filePath) {
            return {
              success: false,
              error: 'Invalid storage response structure - missing filePath',
            };
          }

          logger.info('External file downloaded successfully', {
            taskId: params.taskId,
            filePath,
          });

          return {
            success: true,
            filePath,
            localPath: responseData?.localPath,
            size: responseData?.size,
            format: responseData?.format,
            fileId: responseData?.fileId,
          };
        } catch (error) {
          logger.error('Download from external URL error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'External download failed',
          };
        }
      },
      'internal-service'
    );
  }

  async getDownloadUrl(request: StorageDownloadRequest): Promise<StorageDownloadResponse> {
    return withServiceResilience(
      'storage-service',
      'getDownloadUrl',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success: boolean;
            downloadUrl?: string;
            expiresAt?: string;
            error?: string;
          }>('/api/images/download/url', {
            fileId: request.fileId,
            expiresIn: request.expiresIn || 3600,
            disposition: request.disposition || 'attachment',
          });

          if (data.success) {
            return {
              success: true,
              downloadUrl: data.downloadUrl,
              expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
            };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to get download URL',
            };
          }
        } catch (error) {
          logger.error('Get download URL error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get download URL',
          };
        }
      },
      'internal-service'
    );
  }

  async getFileMetadata(fileId: string): Promise<{
    success: boolean;
    metadata?: FileMetadata;
    error?: string;
  }> {
    return withServiceResilience(
      'storage-service',
      'getFileMetadata',
      async () => {
        try {
          const data = await this.httpClient.get<{
            success: boolean;
            metadata?: FileMetadata;
            error?: string;
          }>(`/api/files/${fileId}/metadata`);

          if (data.success) {
            return {
              success: true,
              metadata: data.metadata,
            };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to get file metadata',
            };
          }
        } catch (error) {
          logger.error('Get file metadata error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get file metadata',
          };
        }
      },
      'internal-service'
    );
  }

  async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    return withServiceResilience(
      'storage-service',
      'deleteFile',
      async () => {
        try {
          const data = await this.httpClient.delete<{
            success: boolean;
            error?: string;
          }>(`/api/files/${fileId}`);

          if (data.success) {
            logger.info('File deleted', { fileId });
            return { success: true };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to delete file',
            };
          }
        } catch (error) {
          logger.error('Delete file error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete file',
          };
        }
      },
      'internal-service'
    );
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.getWithResponse<{ status?: string }>('/health');
      return response.ok && response.data.status === 'healthy';
    } catch (error) {
      logger.warn('Storage service health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async uploadToPresignedUrl(
    uploadUrl: string,
    fileData: Buffer | Readable,
    contentType: string
  ): Promise<void> {
    try {
      const bodyData = Buffer.isBuffer(fileData) ? new Uint8Array(fileData) : fileData;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: bodyData,
        signal: AbortSignal.timeout(300000),
      });

      if (!response.ok) {
        throw new DomainError(`Upload failed: ${response.status} ${response.statusText}`, 502);
      }
    } catch (error) {
      logger.error('Upload to presigned URL error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DomainError(`Storage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 502);
    }
  }

  private async confirmUpload(fileId: string): Promise<void> {
    try {
      await this.httpClient.post(`/api/files/${fileId}/confirm`);
    } catch (error) {
      logger.error('Confirm upload error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DomainError(`Storage confirm failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 502);
    }
  }
}
