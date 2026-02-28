/**
 * Get File Metadata Use Case
 * Handles file metadata retrieval with access control
 */

import { IStorageRepository } from '../interfaces/IStorageRepository';
import { StorageError, StorageErrorCode } from '../errors';

export interface GetFileMetadataRequest {
  fileId: string;
  userId?: string;
}

export interface GetFileMetadataResponse {
  id: string;
  originalName: string;
  contentType?: string;
  size?: number;
  checksum?: string;
  isPublic: boolean;
  tags: string[];
  userId?: string;
  publicUrl?: string;
  storageLocation: {
    provider: string;
    path: string;
    bucket?: string;
  };
  uploadedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class GetFileMetadataUseCase {
  constructor(private _repository: IStorageRepository) {}

  async execute(request: GetFileMetadataRequest): Promise<GetFileMetadataResponse> {
    try {
      // Find file entity
      const fileEntity = await this._repository.findById(request.fileId);
      if (!fileEntity) {
        throw new StorageError('File not found', 404, StorageErrorCode.FILE_NOT_FOUND);
      }

      // Check access permissions
      if (!fileEntity.isAccessibleTo(request.userId)) {
        throw new StorageError('You do not have permission to access this file', 403, StorageErrorCode.ACCESS_DENIED);
      }

      // Check if file is expired
      if (fileEntity.isExpired()) {
        throw new StorageError('File has expired', 410, StorageErrorCode.FILE_EXPIRED);
      }

      return {
        id: fileEntity.id,
        originalName: fileEntity.originalName,
        contentType: fileEntity.metadata.contentType,
        size: fileEntity.metadata.size,
        checksum: fileEntity.metadata.checksum,
        isPublic: fileEntity.metadata.isPublic || false,
        tags: fileEntity.metadata.tags || [],
        userId: fileEntity.metadata.userId,
        publicUrl: fileEntity.storageLocation.publicUrl,
        storageLocation: {
          provider: fileEntity.storageLocation.provider,
          path: fileEntity.storageLocation.path,
          bucket: fileEntity.storageLocation.bucket,
        },
        uploadedAt: fileEntity.metadata.uploadedAt,
        expiresAt: fileEntity.metadata.expiresAt,
        createdAt: fileEntity.createdAt,
        updatedAt: fileEntity.updatedAt,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Unexpected error during metadata retrieval: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        StorageErrorCode.METADATA_ERROR
      );
    }
  }
}
