/**
 * Delete File Use Case
 * Handles file deletion operations with access control
 */

import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { StorageError, StorageErrorCode } from '../errors';
import { getLogger } from '../../config/service-urls';
import { getAuditService, getCorrelationContext } from '@aiponge/platform-core';

const logger = getLogger('delete-file-use-case');

export interface DeleteFileRequest {
  fileId: string;
  userId?: string;
}

export interface DeleteFileResponse {
  success: boolean;
  message: string;
}

export class DeleteFileUseCase {
  constructor(
    private _storageProvider: IStorageProvider,
    private _repository: IStorageRepository
  ) {}

  async execute(request: DeleteFileRequest): Promise<DeleteFileResponse> {
    try {
      // Find file entity
      const fileEntity = await this._repository.findById(request.fileId);
      if (!fileEntity) {
        throw new StorageError('File not found', 404, StorageErrorCode.FILE_NOT_FOUND);
      }

      // Check access permissions
      if (!fileEntity.isAccessibleTo(request.userId)) {
        throw new StorageError('You do not have permission to delete this file', 403, StorageErrorCode.ACCESS_DENIED);
      }

      // Delete from storage provider
      const deleteResult = await this._storageProvider.delete(fileEntity.storageLocation.path);

      if (!deleteResult.success) {
        logger.warn('Failed to delete file from storage', {
          module: 'delete_file_use_case',
          operation: 'execute',
          fileId: request.fileId,
          error: deleteResult.error,
          phase: 'storage_deletion_failed',
        });
        // Continue with database deletion even if storage deletion fails
      }

      // Delete from repository
      const repositoryResult = await this._repository.delete(request.fileId);

      if (!repositoryResult) {
        throw new StorageError('Failed to delete file from database', 500, StorageErrorCode.DELETE_FAILED);
      }

      getAuditService().log({
        userId: request.userId,
        targetType: 'file',
        targetId: request.fileId,
        action: 'delete',
        serviceName: 'storage-service',
        correlationId: getCorrelationContext()?.correlationId,
      });

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Unexpected error during file deletion: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        StorageErrorCode.DELETE_ERROR
      );
    }
  }
}
