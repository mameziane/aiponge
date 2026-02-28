/**
 * Enhanced Storage Service
 * Main application service that orchestrates storage operations with advanced file management
 */

import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { StorageError } from '../errors';
import { type StorageAccessLevel, type ProcessingJobStatus } from '@aiponge/shared-contracts';

// Storage Use Cases
import {
  UploadFileUseCase,
  UploadFileRequest,
  UploadFileResponse,
  DownloadFileUseCase,
  DownloadFileRequest,
  DownloadFileResponse,
  DeleteFileUseCase,
  DeleteFileRequest,
  DeleteFileResponse,
  GenerateSignedUrlUseCase,
  GenerateSignedUrlRequest,
  GenerateSignedUrlResponse,
  ListFilesUseCase,
  ListFilesRequest,
  ListFilesResponse,
  GetFileMetadataUseCase,
  GetFileMetadataRequest,
  GetFileMetadataResponse,
  FileAccessControlUseCase,
  AccessControlResultDTO,
  FileVersioningUseCase,
  CreateVersionRequestDTO,
  VersioningResultDTO,
  BackgroundProcessingUseCase,
  QueueTaskRequestDTO,
  ProcessingResultDTO,
  ProcessingTaskDTO,
  INotificationService,
  ResumableUploadUseCase,
  ResumableUploadRequestDTO,
  ResumableUploadResultDTO,
} from '../use-cases';
import { FileSearchUseCase, FileSearchQueryDTO, SearchResultDTO } from '../use-cases/FileSearchUseCase';
import {
  DownloadExternalFileUseCase,
  DownloadExternalFileRequest,
  DownloadExternalFileResponse,
} from '../use-cases/DownloadExternalFileUseCase';
import { UnreferencedFileDetectionService, DetectionConfig, DetectionResult } from './UnreferencedFileDetectionService';
import { OrphanedFileCleanupService } from './OrphanedFileCleanupService';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { VersionRepository } from '../../infrastructure/repositories/VersionRepository';
import { ProcessingJobRepository } from '../../infrastructure/repositories/ProcessingJobRepository';

const logger = getLogger('storage-service-storageservice');

export class StorageService {
  // Core Storage Use Cases
  private uploadFileUseCase: UploadFileUseCase;
  private downloadFileUseCase: DownloadFileUseCase;
  private deleteFileUseCase: DeleteFileUseCase;
  private generateSignedUrlUseCase: GenerateSignedUrlUseCase;
  private listFilesUseCase: ListFilesUseCase;
  private getFileMetadataUseCase: GetFileMetadataUseCase;

  // Advanced File Management Use Cases
  private fileAccessControlUseCase: FileAccessControlUseCase;
  private fileVersioningUseCase: FileVersioningUseCase;
  private backgroundProcessingUseCase: BackgroundProcessingUseCase;
  private resumableUploadUseCase: ResumableUploadUseCase;
  private fileSearchUseCase: FileSearchUseCase;
  private downloadExternalFileUseCase: DownloadExternalFileUseCase;

  // Detection and cleanup services (optional, requires db)
  private unreferencedFileDetectionService?: UnreferencedFileDetectionService;
  private orphanedFileCleanupService?: OrphanedFileCleanupService;

  constructor(
    private storageProvider: IStorageProvider,
    private repository: IStorageRepository,
    private auditService?: unknown,
    private notificationService?: unknown,
    private db?: DatabaseConnection
  ) {
    // Initialize core storage use cases
    this.uploadFileUseCase = new UploadFileUseCase(storageProvider, repository);
    this.downloadFileUseCase = new DownloadFileUseCase(storageProvider, repository);
    this.deleteFileUseCase = new DeleteFileUseCase(storageProvider, repository);
    this.generateSignedUrlUseCase = new GenerateSignedUrlUseCase(storageProvider, repository);
    this.listFilesUseCase = new ListFilesUseCase(repository);
    this.getFileMetadataUseCase = new GetFileMetadataUseCase(repository);

    // Initialize advanced file management use cases
    this.fileAccessControlUseCase = new FileAccessControlUseCase(repository, auditService);
    this.fileVersioningUseCase = new FileVersioningUseCase(
      repository,
      db ? new VersionRepository(db) : (null as unknown as VersionRepository),
      storageProvider
    );
    this.backgroundProcessingUseCase = new BackgroundProcessingUseCase(
      repository,
      db ? new ProcessingJobRepository(db) : (null as unknown as ProcessingJobRepository),
      storageProvider,
      notificationService as INotificationService
    );
    this.resumableUploadUseCase = new ResumableUploadUseCase(repository, storageProvider, storageProvider);
    this.fileSearchUseCase = new FileSearchUseCase(repository, storageProvider);
    this.downloadExternalFileUseCase = new DownloadExternalFileUseCase(storageProvider, repository);

    // Initialize detection and cleanup services if db is provided
    if (db) {
      this.unreferencedFileDetectionService = new UnreferencedFileDetectionService(db);
      this.orphanedFileCleanupService = new OrphanedFileCleanupService(db, storageProvider);
    }
  }

  // File Operations
  async uploadFile(request: UploadFileRequest): Promise<UploadFileResponse> {
    return this.uploadFileUseCase.execute(request);
  }

  async downloadFile(request: DownloadFileRequest): Promise<DownloadFileResponse> {
    return this.downloadFileUseCase.execute(request);
  }

  async deleteFile(request: DeleteFileRequest): Promise<DeleteFileResponse> {
    return this.deleteFileUseCase.execute(request);
  }

  async generateSignedUrl(request: GenerateSignedUrlRequest): Promise<GenerateSignedUrlResponse> {
    return this.generateSignedUrlUseCase.execute(request);
  }

  async listFiles(request: ListFilesRequest): Promise<ListFilesResponse> {
    return this.listFilesUseCase.execute(request);
  }

  async getFileMetadata(request: GetFileMetadataRequest): Promise<GetFileMetadataResponse> {
    return this.getFileMetadataUseCase.execute(request);
  }

  async downloadExternalFile(request: DownloadExternalFileRequest): Promise<DownloadExternalFileResponse> {
    return this.downloadExternalFileUseCase.execute(request);
  }

  // ============================================
  // Advanced File Management Operations
  // ============================================

  // File Access Control
  async shareFile(
    fileId: string,
    fromUserId: string,
    toUserId: string,
    permission: 'read' | 'write',
    expiresAt?: Date
  ): Promise<AccessControlResultDTO> {
    return this.fileAccessControlUseCase.shareFile(fileId, fromUserId, toUserId, permission, expiresAt);
  }

  async updateFileVisibility(
    fileId: string,
    userId: string,
    visibility: StorageAccessLevel
  ): Promise<AccessControlResultDTO> {
    return this.fileAccessControlUseCase.updateFileVisibility(fileId, userId, visibility);
  }

  async checkFileAccess(
    fileId: string,
    userId: string,
    requiredPermission: 'read' | 'write' | 'delete' | 'share'
  ): Promise<AccessControlResultDTO> {
    return this.fileAccessControlUseCase.checkFileAccess(fileId, userId, requiredPermission);
  }

  async revokeFileAccess(fileId: string, userId: string, targetUserId: string): Promise<AccessControlResultDTO> {
    return this.fileAccessControlUseCase.revokeAccess(fileId, userId, targetUserId);
  }

  async getFilePermissions(fileId: string, userId: string) {
    return this.fileAccessControlUseCase.getFilePermissions(fileId, userId);
  }

  async getUserSharedFiles(userId: string) {
    return this.fileAccessControlUseCase.getUserSharedFiles(userId);
  }

  // File Versioning
  async createFileVersion(request: CreateVersionRequestDTO): Promise<VersioningResultDTO> {
    return this.fileVersioningUseCase.createVersion(request);
  }

  async getFileVersionHistory(fileId: string, userId: string): Promise<VersioningResultDTO> {
    return this.fileVersioningUseCase.getVersionHistory(fileId, userId);
  }

  async revertFileToVersion(fileId: string, versionId: string, userId: string): Promise<VersioningResultDTO> {
    return this.fileVersioningUseCase.revertToVersion(fileId, versionId, userId);
  }

  async deleteFileVersion(fileId: string, versionId: string, userId: string): Promise<VersioningResultDTO> {
    return this.fileVersioningUseCase.deleteVersion(fileId, versionId, userId);
  }

  async compareFileVersions(fileId: string, version1Id: string, version2Id: string, userId: string) {
    return this.fileVersioningUseCase.compareVersions(fileId, version1Id, version2Id, userId);
  }

  async getVersionContent(fileId: string, versionId: string, userId: string) {
    return this.fileVersioningUseCase.getVersionContent(fileId, versionId, userId);
  }

  // Background Processing
  async queueProcessingTask(request: QueueTaskRequestDTO): Promise<ProcessingResultDTO> {
    return this.backgroundProcessingUseCase.queueTask(request);
  }

  async getProcessingTaskStatus(taskId: string): Promise<ProcessingResultDTO> {
    return this.backgroundProcessingUseCase.getTaskStatus(taskId);
  }

  async getUserProcessingTasks(
    userId: string,
    status?: ProcessingJobStatus,
    taskType?: string
  ): Promise<ProcessingResultDTO> {
    return this.backgroundProcessingUseCase.getUserTasks(
      userId,
      status,
      taskType as ProcessingTaskDTO['taskType'] | undefined
    );
  }

  async cancelProcessingTask(taskId: string, userId: string): Promise<ProcessingResultDTO> {
    return this.backgroundProcessingUseCase.cancelTask(taskId, userId);
  }

  async retryProcessingTask(taskId: string, userId: string): Promise<ProcessingResultDTO> {
    return this.backgroundProcessingUseCase.retryTask(taskId, userId);
  }

  async getProcessingQueueStats() {
    return this.backgroundProcessingUseCase.getQueueStats();
  }

  // Resumable Upload
  async uploadFileChunk(request: ResumableUploadRequestDTO): Promise<ResumableUploadResultDTO> {
    return this.resumableUploadUseCase.execute(request);
  }

  async getUploadStatus(uploadId: string) {
    return this.resumableUploadUseCase.getUploadStatus(uploadId);
  }

  async cancelUpload(uploadId: string, userId: string) {
    return this.resumableUploadUseCase.cancelUpload(uploadId, userId);
  }

  async getUserUploads(userId: string) {
    return this.resumableUploadUseCase.getUserUploads(userId);
  }

  // File Search
  async searchFiles(query: FileSearchQueryDTO): Promise<SearchResultDTO> {
    return this.fileSearchUseCase.searchFiles(query);
  }

  async getFileStats(userId: string, dateRange?: { from: Date; to: Date }): Promise<SearchResultDTO> {
    return this.fileSearchUseCase.getFileStats(userId, dateRange);
  }

  async searchSimilarFiles(fileId: string, userId: string, limit?: number): Promise<SearchResultDTO> {
    return this.fileSearchUseCase.searchSimilarFiles(fileId, userId, limit);
  }

  async searchDuplicateFiles(userId: string): Promise<SearchResultDTO> {
    return this.fileSearchUseCase.searchDuplicateFiles(userId);
  }

  async searchFilesByContent(
    contentQuery: string,
    userId: string,
    contentTypes?: string[],
    limit?: number
  ): Promise<SearchResultDTO> {
    return this.fileSearchUseCase.searchByContent(contentQuery, userId, contentTypes, limit);
  }

  // Provider Operations
  async checkProviderHealth(): Promise<{
    provider: string;
    status: 'healthy' | 'unhealthy';
    details?: unknown;
  }> {
    try {
      const providerInfo = this.storageProvider.getProviderInfo();

      // Test basic functionality by attempting to list files
      await this.storageProvider.listFiles('health-check');

      return {
        provider: providerInfo.name,
        status: 'healthy',
        details: providerInfo,
      };
    } catch (error) {
      return {
        provider: this.storageProvider.getProviderInfo().name,
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    publicFiles: number;
    privateFiles: number;
    expiredFiles: number;
  }> {
    try {
      // Get all files for statistics
      const allFiles = await this.repository.search({ limit: 10000 });
      const expiredFiles = await this.repository.findExpired();

      let totalSize = 0;
      let publicFiles = 0;
      let privateFiles = 0;

      allFiles.forEach(file => {
        totalSize += file.metadata.size || 0;
        if (file.metadata.isPublic) {
          publicFiles++;
        } else {
          privateFiles++;
        }
      });

      return {
        totalFiles: allFiles.length,
        totalSize,
        publicFiles,
        privateFiles,
        expiredFiles: expiredFiles.length,
      };
    } catch (error) {
      logger.error('Failed to get storage stats:', {
        module: 'storage_service',
        operation: 'getStorageStats',
        error: error instanceof Error ? error.message : String(error),
        phase: 'stats_calculation_failed',
      });
      return {
        totalFiles: 0,
        totalSize: 0,
        publicFiles: 0,
        privateFiles: 0,
        expiredFiles: 0,
      };
    }
  }

  async cleanupExpiredFiles(): Promise<{
    deletedCount: number;
    errors: string[];
  }> {
    try {
      const expiredFiles = await this.repository.findExpired();
      const errors: string[] = [];
      let deletedCount = 0;

      for (const file of expiredFiles) {
        try {
          await this.deleteFile({ fileId: file.id });
          deletedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to delete ${file.id}: ${errorMessage}`);
        }
      }

      return { deletedCount, errors };
    } catch (error) {
      return {
        deletedCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  // Orphan file management
  async markFileAsOrphaned(fileUrl: string): Promise<{ success: boolean; marked?: number; error?: string }> {
    try {
      const storagePath = this.extractStoragePath(fileUrl);
      if (!storagePath) {
        return { success: false, error: 'Invalid file URL format' };
      }

      const result = await this.repository.markFileAsOrphaned(storagePath);
      if (result) {
        logger.info('File marked as orphaned', { storagePath });
        return { success: true, marked: 1 };
      }
      return { success: false, marked: 0, error: 'File not found in database' };
    } catch (error) {
      logger.error('Failed to mark file as orphaned', {
        error: error instanceof Error ? error.message : String(error),
        fileUrl,
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async markFilesAsOrphanedBatch(fileUrls: string[]): Promise<{ success: boolean; marked?: number; error?: string }> {
    try {
      let markedCount = 0;
      for (const fileUrl of fileUrls) {
        const result = await this.markFileAsOrphaned(fileUrl);
        if (result.success && result.marked) {
          markedCount += result.marked;
        }
      }
      return { success: true, marked: markedCount };
    } catch (error) {
      logger.error('Failed to mark files as orphaned batch', {
        error: error instanceof Error ? error.message : String(error),
        count: fileUrls.length,
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async detectUnreferencedFiles(config?: Partial<DetectionConfig>): Promise<DetectionResult> {
    if (!this.unreferencedFileDetectionService) {
      throw StorageError.serviceUnavailable('Detection service not initialized - db connection required');
    }
    return this.unreferencedFileDetectionService.detectUnreferencedFiles(config);
  }

  async getFileReferenceStats(): Promise<{
    totalActiveFiles: number;
    referencedCount: number;
    potentiallyUnreferenced: number;
    byCategory: Record<string, { active: number; orphaned: number }>;
  }> {
    if (!this.unreferencedFileDetectionService) {
      throw StorageError.serviceUnavailable('Detection service not initialized - db connection required');
    }
    return this.unreferencedFileDetectionService.getFileReferenceStats();
  }

  async getOrphanedFilesStats(): Promise<{
    totalOrphaned: number;
    readyForDeletion: number;
    withinGracePeriod: number;
  }> {
    if (!this.orphanedFileCleanupService) {
      throw StorageError.serviceUnavailable('Cleanup service not initialized - db connection required');
    }
    return this.orphanedFileCleanupService.getOrphanedFilesStats();
  }

  private extractStoragePath(fileUrl: string): string | null {
    if (!fileUrl) return null;

    // Remove query strings and fragments first (handles presigned URLs, CDN links)
    const cleanUrl = fileUrl.split('?')[0].split('#')[0];

    // Case 1: Already a bare storage path (e.g., "user/avatars/file.jpg")
    if (!cleanUrl.startsWith('/') && !cleanUrl.startsWith('http')) {
      return cleanUrl;
    }

    // Case 2: Relative URL (e.g., "/uploads/user/avatars/file.jpg")
    if (cleanUrl.startsWith('/uploads/')) {
      return cleanUrl.replace('/uploads/', '');
    }

    // Case 3: Absolute URL (e.g., "https://domain/uploads/user/avatars/file.jpg")
    if (cleanUrl.includes('/uploads/')) {
      const match = cleanUrl.match(/\/uploads\/(.+)$/);
      return match ? match[1] : null;
    }

    // Case 4: Path starting with / but no /uploads prefix
    if (cleanUrl.startsWith('/')) {
      return cleanUrl.substring(1);
    }

    return cleanUrl;
  }

  // Initialize and cleanup
  async initialize(): Promise<void> {
    await this.storageProvider.initialize();
    logger.info('[StorageService] Initialized successfully', {
      module: 'storage_service',
      operation: 'initialize',
      phase: 'initialization_completed',
    });
  }

  async cleanup(): Promise<void> {
    await this.storageProvider.cleanup();
    logger.info('[StorageService] Cleanup completed', {
      module: 'storage_service',
      operation: 'cleanup',
      phase: 'cleanup_completed',
    });
  }
}
