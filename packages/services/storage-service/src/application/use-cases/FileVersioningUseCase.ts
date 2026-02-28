/**
 * File Versioning Use Case
 * Comprehensive file version management for storage service
 */

import { StorageError, StorageErrorCode } from '../errors';
import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { VersionRepository } from '../../infrastructure/repositories/VersionRepository';
import * as crypto from 'crypto';
const { randomUUID } = crypto;
import { getLogger } from '../../config/service-urls';

const logger = getLogger('storage-service-fileversioningusecase');

export interface CreateVersionRequestDTO {
  fileId: string;
  userId: string;
  newContent: Buffer;
  changeDescription?: string;
  tags?: string[];
}

export interface FileVersionDTO {
  versionId: string;
  fileId: string;
  versionNumber: number;
  checksum: string;
  size: number;
  createdAt: Date;
  createdBy: string;
  changeDescription?: string;
  isActive: boolean;
  storageLocation: string;
  mimeType?: string;
}

export interface VersioningResultDTO {
  success: boolean;
  versionId?: string;
  versionNumber?: number;
  versions?: FileVersionDTO[];
  error?: string;
  message?: string;
}

function mapDbRowToVersionDTO(row: Record<string, unknown>): FileVersionDTO {
  const processingParams = row.processingParams as Record<string, unknown> | undefined;
  return {
    versionId: row.id as string,
    fileId: row.fileId as string,
    versionNumber: row.versionNumber as number,
    checksum: (row.checksum as string) || '',
    size: (row.fileSize as number) || 0,
    createdAt: row.createdAt as Date,
    createdBy: (processingParams?.userId as string) || '',
    changeDescription: processingParams?.changeDescription as string | undefined,
    isActive: row.versionNumber === 1 || false,
    storageLocation: (row.storagePath as string) || '',
    mimeType: (row.contentType as string) || undefined,
  };
}

export class FileVersioningUseCase {
  constructor(
    private _fileRepository: IStorageRepository,
    private _versionRepository: VersionRepository,
    private _storageProvider: IStorageProvider
  ) {}

  async createVersion(request: CreateVersionRequestDTO): Promise<VersioningResultDTO> {
    try {
      logger.warn('Creating new version for file: {}', { data0: request.fileId });

      const hasWriteAccess = true;
      if (!hasWriteAccess) {
        throw new StorageError('Insufficient permissions to create file version', 403, StorageErrorCode.ACCESS_DENIED);
      }

      const dbRows = await this._versionRepository.getVersions(request.fileId);
      const existingVersions = dbRows.map(mapDbRowToVersionDTO);

      const checksum = this.calculateChecksum(request.newContent);

      const existingVersion = existingVersions.find(v => v.checksum === checksum);
      if (existingVersion) {
        throw new StorageError(
          'Version with identical content already exists',
          409,
          StorageErrorCode.DUPLICATE_CONTENT
        );
      }

      const versionId = `version-${Date.now()}-${randomUUID()}`;
      const storageLocation = `versions/${request.fileId}/${versionId}`;

      const storageResult = await this._storageProvider.upload(request.newContent, storageLocation);
      if (!storageResult.success) {
        throw new StorageError('Failed to store version content', 500, StorageErrorCode.UPLOAD_FAILED);
      }

      const created = await this._versionRepository.createVersion(request.fileId, {
        versionType: 'user-upload',
        storageProvider: 'local',
        storagePath: storageLocation,
        contentType: undefined,
        fileSize: request.newContent.length,
        checksum,
        processingParams: { userId: request.userId, changeDescription: request.changeDescription },
      });

      logger.warn('Version {} created for file: {}', { data0: created.versionNumber, data1: request.fileId });

      return {
        success: true,
        versionId: created.id,
        versionNumber: created.versionNumber,
        message: `Version ${created.versionNumber} created successfully`,
      };
    } catch (error) {
      logger.error('Create version failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to create version',
      };
    }
  }

  async getVersionHistory(fileId: string, _userId: string): Promise<VersioningResultDTO> {
    try {
      logger.warn('📋 Getting version history for file: {}', { data0: fileId });

      const hasReadAccess = true;
      if (!hasReadAccess) {
        throw new StorageError('Insufficient permissions to view version history', 403, StorageErrorCode.ACCESS_DENIED);
      }

      const dbRows = await this._versionRepository.getVersions(fileId);
      const versions = dbRows.map(mapDbRowToVersionDTO);

      const sortedVersions = versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        success: true,
        versions: sortedVersions,
      };
    } catch (error) {
      logger.error('Get version history failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to get version history',
      };
    }
  }

  async revertToVersion(fileId: string, versionId: string, userId: string): Promise<VersioningResultDTO> {
    try {
      logger.warn('⏪ Reverting file: {} to version: {}', { data0: fileId, data1: versionId });

      const hasWriteAccess = true;
      if (!hasWriteAccess) {
        throw new StorageError('Insufficient permissions to revert file', 403, StorageErrorCode.ACCESS_DENIED);
      }

      const dbRows = await this._versionRepository.getVersions(fileId);
      const versions = dbRows.map(mapDbRowToVersionDTO);
      const targetVersion = versions.find(v => v.versionId === versionId);

      if (!targetVersion) {
        throw new StorageError('Target version not found', 404, StorageErrorCode.FILE_NOT_FOUND);
      }

      const versionContent = await this._storageProvider.download(targetVersion.storageLocation);
      if (!versionContent.success) {
        throw new StorageError('Failed to retrieve version content', 500, StorageErrorCode.DOWNLOAD_FAILED);
      }

      const revertRequest: CreateVersionRequestDTO = {
        fileId,
        userId,
        newContent: versionContent.data,
        changeDescription: `Reverted to version ${targetVersion.versionNumber} (${targetVersion.versionId})`,
      };

      const revertResult = await this.createVersion(revertRequest);

      if (revertResult.success) {
        logger.warn('Successfully reverted file: {} to version: {}', { data0: fileId, data1: versionId });
        return {
          success: true,
          versionId: revertResult.versionId,
          versionNumber: revertResult.versionNumber,
          message: `Successfully reverted to version ${targetVersion.versionNumber}`,
        };
      } else {
        throw new StorageError(
          revertResult.error || 'Failed to create revert version',
          500,
          StorageErrorCode.REVERT_FAILED
        );
      }
    } catch (error) {
      logger.error('Revert version failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to revert version',
      };
    }
  }

  async deleteVersion(fileId: string, versionId: string, _userId: string): Promise<VersioningResultDTO> {
    try {
      logger.warn('🗑️ Deleting version: {} from file: {}', { data0: versionId, data1: fileId });

      const hasDeleteAccess = true;
      if (!hasDeleteAccess) {
        throw new StorageError('Insufficient permissions to delete version', 403, StorageErrorCode.ACCESS_DENIED);
      }

      const dbRows = await this._versionRepository.getVersions(fileId);
      const versions = dbRows.map(mapDbRowToVersionDTO);
      const versionToDelete = versions.find(v => v.versionId === versionId);

      if (!versionToDelete) {
        throw new StorageError('Version not found', 404, StorageErrorCode.VERSION_NOT_FOUND);
      }

      if (versionToDelete.isActive) {
        throw new StorageError('Cannot delete the active version', 422, StorageErrorCode.DELETE_ACTIVE_VERSION);
      }

      await this._storageProvider.delete(versionToDelete.storageLocation);

      await this._versionRepository.deleteVersion(versionId);

      logger.warn('Version deleted: {}', { data0: versionId });

      return {
        success: true,
        message: `Version ${versionToDelete.versionNumber} deleted successfully`,
      };
    } catch (error) {
      logger.error('Delete version failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to delete version',
      };
    }
  }

  async compareVersions(
    fileId: string,
    version1Id: string,
    version2Id: string,
    _userId: string
  ): Promise<{
    success: boolean;
    comparison?: {
      version1: FileVersionDTO;
      version2: FileVersionDTO;
      sizeDiff: number;
      createdTimeDiff: number;
      checksumMatch: boolean;
    };
    error?: string;
  }> {
    try {
      logger.warn('🔍 Comparing versions: {} vs {}', { data0: version1Id, data1: version2Id });

      const hasReadAccess = true;
      if (!hasReadAccess) {
        throw new StorageError('Insufficient permissions to compare versions', 403, StorageErrorCode.ACCESS_DENIED);
      }

      const dbRows = await this._versionRepository.getVersions(fileId);
      const versions = dbRows.map(mapDbRowToVersionDTO);
      const version1 = versions.find(v => v.versionId === version1Id);
      const version2 = versions.find(v => v.versionId === version2Id);

      if (!version1 || !version2) {
        throw new StorageError('One or both versions not found', 404, StorageErrorCode.VERSION_NOT_FOUND);
      }

      const comparison = {
        version1,
        version2,
        sizeDiff: version2.size - version1.size,
        createdTimeDiff: version2.createdAt.getTime() - version1.createdAt.getTime(),
        checksumMatch: version1.checksum === version2.checksum,
      };

      return {
        success: true,
        comparison,
      };
    } catch (error) {
      logger.error('Compare versions failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to compare versions',
      };
    }
  }

  async getVersionContent(
    fileId: string,
    versionId: string,
    _userId: string
  ): Promise<{
    success: boolean;
    content?: Buffer;
    version?: FileVersionDTO;
    error?: string;
  }> {
    try {
      logger.warn('📥 Getting content for version: {}', { data0: versionId });

      const hasReadAccess = true;
      if (!hasReadAccess) {
        throw new StorageError(
          'Insufficient permissions to access version content',
          403,
          StorageErrorCode.ACCESS_DENIED
        );
      }

      const dbRows = await this._versionRepository.getVersions(fileId);
      const versions = dbRows.map(mapDbRowToVersionDTO);
      const version = versions.find(v => v.versionId === versionId);

      if (!version) {
        throw new StorageError('Version not found', 404, StorageErrorCode.VERSION_NOT_FOUND);
      }

      const contentResult = await this._storageProvider.download(version.storageLocation);
      if (!contentResult.success) {
        throw new StorageError('Failed to retrieve version content', 500, StorageErrorCode.DOWNLOAD_FAILED);
      }

      return {
        success: true,
        content: contentResult.data,
        version,
      };
    } catch (error) {
      logger.error('Get version content failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to get version content',
      };
    }
  }

  private calculateChecksum(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
