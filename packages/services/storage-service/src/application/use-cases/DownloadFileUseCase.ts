/**
 * Download File Use Case
 * Handles file download operations with access control
 */

import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { StorageError, StorageErrorCode } from '../errors';

export interface DownloadFileRequest {
  fileId?: string;
  filePath?: string;
  userId?: string;
}

export interface DownloadFileResponse {
  data: Buffer;
  contentType: string;
  originalName: string;
  size: number;
  lastModified?: Date;
  checksum?: string;
  isPublic: boolean; // Critical for cache control security
}

export class DownloadFileUseCase {
  constructor(
    private _storageProvider: IStorageProvider,
    private _repository: IStorageRepository
  ) {}

  async execute(request: DownloadFileRequest): Promise<DownloadFileResponse> {
    try {
      // Validate input
      if (!request.fileId && !request.filePath) {
        throw new StorageError('Either fileId or filePath is required', 400, StorageErrorCode.INVALID_REQUEST);
      }

      let fileEntity;
      let filePath: string;

      if (request.fileId) {
        // Find file by ID
        fileEntity = await this._repository.findById(request.fileId);
        if (!fileEntity) {
          throw new StorageError('File not found', 404, StorageErrorCode.FILE_NOT_FOUND);
        }
        filePath = fileEntity.storageLocation.path;
      } else {
        // Use direct path
        filePath = request.filePath!;
        fileEntity = await this._repository.findByPath(filePath);
      }

      // Check access permissions
      if (fileEntity && !fileEntity.isAccessibleTo(request.userId)) {
        throw new StorageError('You do not have permission to access this file', 403, StorageErrorCode.ACCESS_DENIED);
      }

      // Check if file is expired
      if (fileEntity && fileEntity.isExpired()) {
        throw new StorageError('File has expired', 410, StorageErrorCode.FILE_EXPIRED);
      }

      // Download from storage provider
      const downloadResult = await this._storageProvider.download(filePath);

      if (!downloadResult.success || !downloadResult.data) {
        throw new StorageError(
          `Failed to download file: ${downloadResult.error}`,
          500,
          StorageErrorCode.DOWNLOAD_FAILED
        );
      }

      // Get file metadata for caching headers (critical for CDN performance)
      let lastModified: Date | undefined;
      let checksum: string | undefined;

      try {
        const metadata = await this._storageProvider.getMetadata(filePath);
        if (metadata) {
          lastModified = metadata.lastModified;
          checksum = metadata.checksum;
        }
      } catch {
        // Metadata fetch failed - not critical, continue without caching headers
      }

      // Fallback to entity metadata if provider metadata unavailable
      if (!lastModified && fileEntity?.metadata.uploadedAt) {
        lastModified = fileEntity.metadata.uploadedAt;
      }

      return {
        data: downloadResult.data,
        contentType: downloadResult.contentType || fileEntity?.metadata.contentType || 'application/octet-stream',
        originalName: fileEntity?.originalName || 'download',
        size: downloadResult.size || downloadResult.data.length,
        lastModified, // Can be undefined if metadata unavailable (cache headers will be omitted)
        checksum,
        isPublic: fileEntity?.metadata.isPublic || false, // Default to private for security
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Unexpected error during file download: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        StorageErrorCode.DOWNLOAD_ERROR
      );
    }
  }
}
