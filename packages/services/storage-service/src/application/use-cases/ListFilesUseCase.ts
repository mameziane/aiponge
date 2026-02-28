/**
 * List Files Use Case
 * Handles file listing operations with filtering and pagination
 */

import { IStorageRepository } from '../interfaces/IStorageRepository';
import { FileEntity } from '../../domains/entities/FileEntity';
import { StorageError, StorageErrorCode } from '../errors';

export interface ListFilesRequest {
  userId?: string;
  contentType?: string;
  tags?: string[];
  isPublic?: boolean;
  limit?: number;
  offset?: number;
  ownedOnly?: boolean;
}

export interface ListFilesResponse {
  files: Array<{
    id: string;
    originalName: string;
    contentType?: string;
    size?: number;
    isPublic: boolean;
    tags: string[];
    publicUrl?: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  hasMore: boolean;
}

export class ListFilesUseCase {
  constructor(private _repository: IStorageRepository) {}

  async execute(request: ListFilesRequest): Promise<ListFilesResponse> {
    try {
      const limit = Math.min(request.limit || 50, 100); // Max 100 items
      const offset = request.offset || 0;

      // Build search filters
      const filters: Parameters<IStorageRepository['search']>[0] = {
        limit: limit + 1, // Get one extra to check if there are more
        offset,
      };

      // Add content type filter
      if (request.contentType) {
        filters.contentType = request.contentType;
      }

      // Add tags filter
      if (request.tags && request.tags.length > 0) {
        filters.tags = request.tags;
      }

      // Add public/private filter
      if (typeof request.isPublic === 'boolean') {
        filters.isPublic = request.isPublic;
      }

      // Add user filter
      if (request.ownedOnly && request.userId) {
        filters.userId = request.userId;
      } else if (!request.ownedOnly && request.userId) {
        // If not owned only, include public files and user's files
        // This requires a more complex query - for now, we'll handle in post-processing
      }

      // Execute search
      const allFiles = await this._repository.search(filters);

      // Post-process access control if needed
      const accessibleFiles = this.filterAccessibleFiles(allFiles, request.userId, request.ownedOnly);

      // Check if there are more results
      const hasMore = accessibleFiles.length > limit;
      const files = hasMore ? accessibleFiles.slice(0, limit) : accessibleFiles;

      // Transform to response format
      const responseFiles = files.map(file => this.transformFileEntity(file));

      return {
        files: responseFiles,
        total: accessibleFiles.length,
        hasMore,
      };
    } catch (error) {
      throw new StorageError(
        `Unexpected error during file listing: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        StorageErrorCode.LIST_FILES_ERROR
      );
    }
  }

  private filterAccessibleFiles(files: FileEntity[], userId?: string, ownedOnly?: boolean): FileEntity[] {
    return files.filter(file => {
      // If owned only, check user ownership
      if (ownedOnly) {
        return userId && file.metadata.userId === userId;
      }

      // Otherwise, check if accessible (public or owned by user)
      return file.isAccessibleTo(userId);
    });
  }

  private transformFileEntity(file: FileEntity) {
    return {
      id: file.id,
      originalName: file.originalName,
      contentType: file.metadata.contentType,
      size: file.metadata.size,
      isPublic: file.metadata.isPublic || false,
      tags: file.metadata.tags || [],
      publicUrl: file.storageLocation.publicUrl,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }
}
