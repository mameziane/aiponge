/**
 * StorageServiceClient - HTTP client for storage service integration
 *
 * Uses @aiponge/platform-core for logging and local service-urls.ts for service discovery.
 * This makes music-service independently deployable.
 */

import { createLogger, withServiceResilience, type HttpClient } from '@aiponge/platform-core';
import { createServiceClient } from '../../config/service-urls';
import { Readable } from 'stream';
import { PipelineError } from '../../application/errors';

const logger = createLogger('storage-service-client');

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

import type { IStorageServiceClient } from '../../domains/music-catalog/ports/IStorageServiceClient';

export class StorageServiceClient implements IStorageServiceClient {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;

  constructor() {
    const { httpClient, baseUrl } = createServiceClient('storage-service', { type: 'internal', timeout: 120000 });
    this.httpClient = httpClient;
    this.baseUrl = baseUrl;
    logger.info('Initialized', { module: 'storage_service_client', baseUrl });
  }

  async uploadAudio(request: StorageUploadRequest, fileData?: Buffer | Readable): Promise<StorageUploadResponse> {
    return withServiceResilience(
      'storage-service',
      'uploadAudio',
      async () => {
        try {
          logger.info('Uploading audio file', {
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
          }>('/api/audio/upload/prepare', {
            fileName: request.fileName,
            contentType: request.contentType,
            fileSize: request.fileSize,
            metadata: {
              ...request.metadata,
              service: 'music-service',
              fileType: 'audio',
            },
            tags: request.tags || ['audio', 'ai-generated'],
            folder: request.folder || 'music',
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
            logger.info('Audio file uploaded successfully', { fileId });
          }

          return {
            success: true,
            fileId,
            uploadUrl,
            publicUrl,
            cdnUrl,
          };
        } catch (error) {
          logger.error('Upload audio error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Audio upload failed',
          };
        }
      },
      'external-api'
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
            externalUrl: params.externalUrl,
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
      'ai-provider'
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
          }>('/api/audio/download/url', {
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

  async getStreamingUrl(
    fileId: string,
    options: {
      format?: 'mp3' | 'wav' | 'flac';
      bitrate?: number;
      expiresIn?: number;
    } = {}
  ): Promise<{
    success: boolean;
    streamingUrl?: string;
    expiresAt?: Date;
    error?: string;
  }> {
    return withServiceResilience(
      'storage-service',
      'getStreamingUrl',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success: boolean;
            streamingUrl?: string;
            expiresAt?: string;
            error?: string;
          }>('/api/audio/stream/url', {
            fileId,
            format: options.format || 'mp3',
            bitrate: options.bitrate || 320,
            expiresIn: options.expiresIn || 7200,
          });

          if (data.success) {
            return {
              success: true,
              streamingUrl: data.streamingUrl,
              expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
            };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to get streaming URL',
            };
          }
        } catch (error) {
          logger.error('Get streaming URL error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get streaming URL',
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

  async updateFileMetadata(
    fileId: string,
    updates: {
      fileName?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
      isPublic?: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    return withServiceResilience(
      'storage-service',
      'updateFileMetadata',
      async () => {
        try {
          const data = await this.httpClient.patch<{
            success: boolean;
            error?: string;
          }>(`/api/files/${fileId}/metadata`, updates);

          if (data.success) {
            logger.info('File metadata updated', { fileId });
            return { success: true };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to update file metadata',
            };
          }
        } catch (error) {
          logger.error('Update file metadata error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update file metadata',
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

  async listFiles(
    options: {
      folder?: string;
      tags?: string[];
      contentType?: string;
      isPublic?: boolean;
      limit?: number;
      offset?: number;
      sortBy?: 'uploadedAt' | 'fileName' | 'fileSize' | 'downloadCount';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    success: boolean;
    files?: FileMetadata[];
    totalCount?: number;
    hasMore?: boolean;
    error?: string;
  }> {
    return withServiceResilience(
      'storage-service',
      'listFiles',
      async () => {
        try {
          const queryParams = new URLSearchParams();
          if (options.folder) queryParams.append('folder', options.folder);
          if (options.tags) queryParams.append('tags', options.tags.join(','));
          if (options.contentType) queryParams.append('contentType', options.contentType);
          if (options.isPublic !== undefined) queryParams.append('isPublic', options.isPublic.toString());
          if (options.limit) queryParams.append('limit', options.limit.toString());
          if (options.offset) queryParams.append('offset', options.offset.toString());
          if (options.sortBy) queryParams.append('sortBy', options.sortBy);
          if (options.sortOrder) queryParams.append('sortOrder', options.sortOrder);

          const data = await this.httpClient.get<{
            success: boolean;
            files?: FileMetadata[];
            totalCount?: number;
            hasMore?: boolean;
            error?: string;
          }>(`/api/files?${queryParams.toString()}`);

          if (data.success) {
            return {
              success: true,
              files: data.files,
              totalCount: data.totalCount,
              hasMore: data.hasMore,
            };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to list files',
            };
          }
        } catch (error) {
          logger.error('List files error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list files',
          };
        }
      },
      'internal-service'
    );
  }

  async getStorageStats(): Promise<{
    success: boolean;
    stats?: StorageStats;
    error?: string;
  }> {
    return withServiceResilience(
      'storage-service',
      'getStorageStats',
      async () => {
        try {
          const data = await this.httpClient.get<{
            success: boolean;
            stats?: StorageStats;
            error?: string;
          }>('/api/storage/stats');

          if (data.success) {
            return {
              success: true,
              stats: data.stats,
            };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to get storage stats',
            };
          }
        } catch (error) {
          logger.error('Get storage stats error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get storage stats',
          };
        }
      },
      'internal-service'
    );
  }

  async cleanupExpiredFiles(): Promise<{
    success: boolean;
    deletedCount?: number;
    error?: string;
  }> {
    return withServiceResilience(
      'storage-service',
      'cleanupExpiredFiles',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success: boolean;
            deletedCount?: number;
            error?: string;
          }>('/api/storage/cleanup');

          if (data.success) {
            logger.info('Cleaned up expired files', { deletedCount: data.deletedCount });
            return {
              success: true,
              deletedCount: data.deletedCount,
            };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to cleanup expired files',
            };
          }
        } catch (error) {
          logger.error('Cleanup expired files error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cleanup expired files',
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
    } catch {
      return false;
    }
  }

  updateBaseUrl(_newBaseUrl: string): void {
    logger.warn('Base URL update not supported with environment-based service discovery');
  }

  private async uploadToPresignedUrl(
    uploadUrl: string,
    fileData: Buffer | Readable,
    contentType: string
  ): Promise<void> {
    try {
      // Convert Buffer/Readable to Uint8Array for fetch body compatibility
      const bodyData = Buffer.isBuffer(fileData) ? new Uint8Array(fileData) : fileData;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: bodyData,
        signal: AbortSignal.timeout(300000),
      });

      if (!response.ok) {
        throw PipelineError.generationFailed(`Upload failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Upload to presigned URL error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw PipelineError.serviceUnavailable('storage-service', error instanceof Error ? error : undefined);
    }
  }

  private async confirmUpload(fileId: string): Promise<void> {
    try {
      await this.httpClient.post(`/api/files/${fileId}/confirm`);
    } catch (error) {
      logger.error('Confirm upload error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw PipelineError.serviceUnavailable('storage-service', error instanceof Error ? error : undefined);
    }
  }
}
