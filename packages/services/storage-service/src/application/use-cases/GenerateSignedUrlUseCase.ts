/**
 * Generate Signed URL Use Case
 * Handles signed URL generation for temporary file access
 */

import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { StorageError, StorageErrorCode } from '../errors';

export interface GenerateSignedUrlRequest {
  fileId: string;
  userId?: string;
  expiresIn?: number; // seconds, default 3600 (1 hour)
  operation?: 'read' | 'write';
}

export interface GenerateSignedUrlResponse {
  signedUrl: string;
  expiresAt: Date;
}

export class GenerateSignedUrlUseCase {
  constructor(
    private _storageProvider: IStorageProvider,
    private _repository: IStorageRepository
  ) {}

  async execute(request: GenerateSignedUrlRequest): Promise<GenerateSignedUrlResponse> {
    try {
      // Check if provider supports signed URLs
      const providerInfo = this._storageProvider.getProviderInfo();
      if (!providerInfo.supportsSignedUrls) {
        throw new StorageError(
          `Storage provider ${providerInfo.name} does not support signed URLs`,
          501,
          StorageErrorCode.SIGNED_URLS_NOT_SUPPORTED
        );
      }

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

      // Generate signed URL
      const expiresIn = request.expiresIn || 3600; // Default 1 hour
      const signedUrl = await this._storageProvider.generateSignedUrl(
        fileEntity.storageLocation.path,
        expiresIn,
        request.operation || 'read'
      );

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        signedUrl,
        expiresAt,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Unexpected error during signed URL generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        StorageErrorCode.SIGNED_URL_ERROR
      );
    }
  }
}
