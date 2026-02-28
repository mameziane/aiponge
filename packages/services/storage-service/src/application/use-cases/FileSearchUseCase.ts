/**
 * File Search Use Case
 * Advanced file search and metadata queries for storage service
 */

import { StorageError, StorageErrorCode } from '../errors';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { IStorageProvider } from '../interfaces/IStorageProvider';
import { FileEntity as OriginalFileEntity } from '../../domains/entities/FileEntity';
import {
  STORAGE_ACCESS_LEVEL,
  PROCESSING_JOB_STATUS,
  type StorageAccessLevel,
  type ProcessingJobStatus,
} from '@aiponge/shared-contracts';
import { errorMessage, errorStack } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('file-search-use-case');

export interface FileSearchQueryDTO {
  userId: string;
  contentType?: string;
  mimeType?: string;
  tags?: string[];
  filename?: string;
  sizeRange?: { min: number; max: number };
  dateRange?: { from: Date; to: Date };
  visibility?: StorageAccessLevel;
  processingStatus?: ProcessingJobStatus;
  storageProvider?: 'local' | 's3' | 'gcs' | 'cloudinary' | 'cdn';
  sortBy?: 'name' | 'size' | 'date' | 'type' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
}

export interface FileSearchResultDTO {
  id: string;
  originalName: string;
  contentType: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  lastModified: Date;
  tags: string[];
  visibility: string;
  processingStatus: string;
  checksum: string;
  storageProvider: string;
  storageLocation: string;
  publicUrl?: string;
  metadata?: Record<string, unknown>;
  relevanceScore?: number;
}

export interface FileStatsDTO {
  totalFiles: number;
  totalSize: number;
  filesByType: Record<string, number>;
  filesByProvider: Record<string, number>;
  storageUsage: {
    used: number;
    available: number;
    percentage: number;
  };
  recentActivity: {
    uploadsToday: number;
    uploadsThisWeek: number;
    uploadsThisMonth: number;
  };
}

export interface SearchResultDTO {
  success: boolean;
  files?: FileSearchResultDTO[];
  total?: number;
  hasMore?: boolean;
  searchTime?: number;
  stats?: FileStatsDTO;
  error?: string;
}

export class FileSearchUseCase {
  constructor(
    private _fileRepository: IStorageRepository,
    private _storageProvider: IStorageProvider
  ) {}

  async searchFiles(query: FileSearchQueryDTO): Promise<SearchResultDTO> {
    try {
      const startTime = Date.now();
      logger.info('Searching files for user', {
        module: 'file_search_use_case',
        operation: 'searchFiles',
        userId: query.userId,
        phase: 'search_started',
      });
      logger.info('Search criteria', {
        module: 'file_search_use_case',
        operation: 'searchFiles',
        criteria: {
          contentType: query.contentType,
          tags: query.tags,
          filename: query.filename,
          dateRange: query.dateRange,
          sizeRange: query.sizeRange,
        },
        phase: 'search_criteria_defined',
      });

      // Validate search parameters
      this.validateSearchQuery(query);

      // Get search results from repository
      const fileEntities = await this._fileRepository.search({
        userId: query.userId,
        contentType: query.contentType,
        tags: query.tags,
        isPublic: query.visibility === STORAGE_ACCESS_LEVEL.PUBLIC,
        limit: query.limit,
        offset: query.offset,
      });

      // Convert entities to DTOs
      let results = await this.convertEntitiesToDTOs(fileEntities);

      // Apply filtering
      results = this.applyFilters(results, query);

      // Apply sorting
      results = this.applySorting(results, query);

      // Calculate relevance scores if searching by relevance
      if (query.sortBy === 'relevance' && query.filename) {
        results = this.calculateRelevanceScores(results, query.filename);
      }

      // Apply pagination
      const limit = query.limit || 20;
      const offset = query.offset || 0;
      const paginatedResults = results.slice(offset, offset + limit);

      // Include metadata if requested
      if (query.includeMetadata) {
        for (const result of paginatedResults) {
          result.metadata = await this.getFileMetadata(result.id);
        }
      }

      const searchTime = Date.now() - startTime;

      logger.info('Found files', {
        module: 'file_search_use_case',
        operation: 'searchFiles',
        resultsCount: results.length,
        searchTimeMs: searchTime,
        phase: 'search_completed',
      });

      return {
        success: true,
        files: paginatedResults,
        total: results.length,
        hasMore: offset + limit < results.length,
        searchTime,
      };
    } catch (error) {
      logger.error('Search failed', {
        module: 'file_search_use_case',
        operation: 'searchFiles',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'search_failed',
      });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Search failed',
      };
    }
  }

  async getFileStats(userId: string, dateRange?: { from: Date; to: Date }): Promise<SearchResultDTO> {
    try {
      logger.info('Getting file statistics for user', {
        module: 'file_search_use_case',
        operation: 'getFileStats',
        userId,
        phase: 'stats_request_started',
      });

      // Get all user files from repository
      const allFileEntities = await this._fileRepository.findByUserId(userId);
      const allFiles = await this.convertEntitiesToDTOs(allFileEntities);

      // Filter by date range if provided
      let filteredFiles = allFiles;
      if (dateRange) {
        filteredFiles = allFiles.filter(file => file.uploadedAt >= dateRange.from && file.uploadedAt <= dateRange.to);
      }

      // Calculate statistics
      const stats: FileStatsDTO = {
        totalFiles: filteredFiles.length,
        totalSize: filteredFiles.reduce((sum, file) => sum + file.size, 0),
        filesByType: this.groupFilesByType(filteredFiles),
        filesByProvider: this.groupFilesByProvider(filteredFiles),
        storageUsage: this.calculateStorageUsage(filteredFiles),
        recentActivity: this.calculateRecentActivity(allFiles),
      };

      logger.info('File statistics calculated', {
        module: 'file_search_use_case',
        operation: 'getFileStats',
        totalFiles: stats.totalFiles,
        totalSizeMB: (stats.totalSize / 1024 / 1024).toFixed(2),
        phase: 'stats_calculated',
      });

      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('Get stats failed', {
        module: 'file_search_use_case',
        operation: 'getFileStats',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'stats_retrieval_failed',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get file statistics',
      };
    }
  }

  async searchSimilarFiles(fileId: string, userId: string, limit: number = 10): Promise<SearchResultDTO> {
    try {
      logger.info('Finding similar files', {
        module: 'file_search_use_case',
        operation: 'findSimilarFiles',
        fileId,
        phase: 'similarity_search_started',
      });

      // Get the target file
      const targetFile = await this.getFileById(fileId, userId);
      if (!targetFile) {
        throw new StorageError('Target file not found', 404, StorageErrorCode.TARGET_FILE_NOT_FOUND);
      }

      // Find similar files based on various criteria
      const allFileEntities = await this._fileRepository.findByUserId(userId);
      const allFiles = await this.convertEntitiesToDTOs(allFileEntities);
      const similarFiles = allFiles
        .filter(file => file.id !== fileId)
        .map(file => ({
          ...file,
          similarityScore: this.calculateSimilarityScore(targetFile, file),
        }))
        .filter(file => file.similarityScore > 0.1) // Minimum similarity threshold
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, limit);

      logger.info('Found similar files', {
        module: 'file_search_use_case',
        operation: 'findSimilarFiles',
        similarCount: similarFiles.length,
        phase: 'similarity_search_completed',
      });

      return {
        success: true,
        files: similarFiles,
        total: similarFiles.length,
        hasMore: false,
      };
    } catch (error) {
      logger.error('Similar files search failed', {
        module: 'file_search_use_case',
        operation: 'findSimilarFiles',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'similarity_search_failed',
      });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Similar files search failed',
      };
    }
  }

  async searchDuplicateFiles(userId: string): Promise<SearchResultDTO> {
    try {
      logger.info('Finding duplicate files for user', {
        module: 'file_search_use_case',
        operation: 'findDuplicateFiles',
        userId,
        phase: 'duplicate_search_started',
      });

      const allFileEntities = await this._fileRepository.findByUserId(userId);
      const allFiles = await this.convertEntitiesToDTOs(allFileEntities);
      const duplicateGroups = new Map<string, FileSearchResultDTO[]>();

      // Group files by checksum
      for (const file of allFiles) {
        const existing = duplicateGroups.get(file.checksum) || [];
        existing.push(file);
        duplicateGroups.set(file.checksum, existing);
      }

      // Find groups with more than one file (duplicates)
      const duplicates: FileSearchResultDTO[] = [];
      for (const [_checksum, files] of Array.from(duplicateGroups.entries())) {
        if (files.length > 1) {
          duplicates.push(...files);
        }
      }

      // Sort by checksum to group duplicates together
      duplicates.sort((a, b) => a.checksum.localeCompare(b.checksum));

      logger.info('Found duplicate files', {
        module: 'file_search_use_case',
        operation: 'findDuplicateFiles',
        duplicateCount: duplicates.length,
        groupCount: duplicateGroups.size,
        phase: 'duplicate_search_completed',
      });

      return {
        success: true,
        files: duplicates,
        total: duplicates.length,
        hasMore: false,
      };
    } catch (error) {
      logger.error('Duplicate files search failed', {
        module: 'file_search_use_case',
        operation: 'findDuplicateFiles',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'duplicate_search_failed',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Duplicate files search failed',
      };
    }
  }

  async searchByContent(
    contentQuery: string,
    userId: string,
    contentTypes: string[] = [],
    limit: number = 20
  ): Promise<SearchResultDTO> {
    try {
      logger.info('Content search started', {
        module: 'file_search_use_case',
        operation: 'searchFileContent',
        contentQuery,
        phase: 'content_search_started',
      });

      // Search files using repository
      const fileEntities = await this._fileRepository.search({
        userId: userId,
        limit: limit * 2, // Get more to account for filtering
      });
      const allFiles = await this.convertEntitiesToDTOs(fileEntities);

      let matchingFiles = allFiles.filter(file => {
        // Search in filename
        const nameMatch = file.originalName.toLowerCase().includes(contentQuery.toLowerCase());

        // Search in tags
        const tagMatch = file.tags.some(tag => tag.toLowerCase().includes(contentQuery.toLowerCase()));

        // Filter by content types if specified
        const typeMatch = contentTypes.length === 0 || contentTypes.includes(file.contentType);

        return (nameMatch || tagMatch) && typeMatch;
      });

      // Calculate relevance scores
      matchingFiles = matchingFiles.map(file => ({
        ...file,
        relevanceScore: this.calculateContentRelevance(file, contentQuery),
      }));

      // Sort by relevance
      matchingFiles.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

      // Apply limit
      matchingFiles = matchingFiles.slice(0, limit);

      logger.info('Content search completed', {
        module: 'file_search_use_case',
        operation: 'searchFileContent',
        matchCount: matchingFiles.length,
        phase: 'content_search_completed',
      });

      return {
        success: true,
        files: matchingFiles,
        total: matchingFiles.length,
        hasMore: false,
      };
    } catch (error) {
      logger.error('Content search failed', {
        module: 'file_search_use_case',
        operation: 'searchFileContent',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'content_search_failed',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Content search failed',
      };
    }
  }

  private validateSearchQuery(query: FileSearchQueryDTO): void {
    if (query.limit && (query.limit < 1 || query.limit > 100)) {
      throw new StorageError('Limit must be between 1 and 100', 400, StorageErrorCode.INVALID_LIMIT);
    }

    if (query.offset && query.offset < 0) {
      throw new StorageError('Offset must be non-negative', 400, StorageErrorCode.INVALID_OFFSET);
    }

    if (query.sizeRange) {
      if (query.sizeRange.min < 0 || query.sizeRange.max < 0) {
        throw new StorageError('Size range values must be non-negative', 400, StorageErrorCode.INVALID_SIZE_RANGE);
      }
      if (query.sizeRange.min > query.sizeRange.max) {
        throw new StorageError(
          'Size range minimum cannot be greater than maximum',
          400,
          StorageErrorCode.INVALID_SIZE_RANGE
        );
      }
    }

    if (query.dateRange) {
      if (query.dateRange.from > query.dateRange.to) {
        throw new StorageError('Date range from cannot be greater than to', 400, StorageErrorCode.INVALID_DATE_RANGE);
      }
    }
  }

  private async convertEntitiesToDTOs(entities: OriginalFileEntity[]): Promise<FileSearchResultDTO[]> {
    const results: FileSearchResultDTO[] = [];

    for (const entity of entities) {
      const contentType = this.determineContentType(entity);
      const processingStatus = this.determineProcessingStatus(entity);

      results.push({
        id: entity.id,
        originalName: entity.filename,
        contentType,
        mimeType: entity.metadata.mimeType || 'application/octet-stream',
        size: entity.metadata.size || 0,
        uploadedAt: entity.metadata.uploadedAt,
        lastModified: entity.metadata.uploadedAt,
        tags: entity.metadata.tags || [],
        visibility: entity.metadata.isPublic ? STORAGE_ACCESS_LEVEL.PUBLIC : STORAGE_ACCESS_LEVEL.PRIVATE,
        processingStatus,
        checksum: '',
        storageProvider: entity.location.provider,
        storageLocation: entity.location.key,
        publicUrl: undefined,
      });
    }

    return results;
  }

  private determineContentType(entity: OriginalFileEntity): string {
    const extension = entity.filename.split('.').pop()?.toLowerCase() || '';

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(extension)) {
      return 'video';
    }
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(extension)) {
      return 'audio';
    }
    if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(extension)) {
      return 'document';
    }

    return 'file';
  }

  private determineProcessingStatus(entity: OriginalFileEntity): string {
    // Simple logic - in a real system this might be stored in metadata
    if (entity.metadata.uploadedAt && Date.now() - entity.metadata.uploadedAt.getTime() < 60000) {
      // Less than 1 minute old
      return PROCESSING_JOB_STATUS.PROCESSING;
    }
    return PROCESSING_JOB_STATUS.COMPLETED;
  }

  private applyFilters(files: FileSearchResultDTO[], query: FileSearchQueryDTO): FileSearchResultDTO[] {
    let filtered = files;

    if (query.contentType) {
      filtered = filtered.filter(file => file.contentType === query.contentType);
    }

    if (query.mimeType) {
      filtered = filtered.filter(file => file.mimeType === query.mimeType);
    }

    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter(file => query.tags!.some(tag => file.tags.includes(tag)));
    }

    if (query.filename) {
      filtered = filtered.filter(file => file.originalName.toLowerCase().includes(query.filename!.toLowerCase()));
    }

    if (query.sizeRange) {
      filtered = filtered.filter(file => file.size >= query.sizeRange!.min && file.size <= query.sizeRange!.max);
    }

    if (query.dateRange) {
      filtered = filtered.filter(
        file => file.uploadedAt >= query.dateRange!.from && file.uploadedAt <= query.dateRange!.to
      );
    }

    if (query.visibility) {
      filtered = filtered.filter(file => file.visibility === query.visibility);
    }

    if (query.processingStatus) {
      filtered = filtered.filter(file => file.processingStatus === query.processingStatus);
    }

    if (query.storageProvider) {
      filtered = filtered.filter(file => file.storageProvider === query.storageProvider);
    }

    return filtered;
  }

  private applySorting(files: FileSearchResultDTO[], query: FileSearchQueryDTO): FileSearchResultDTO[] {
    const sortBy = query.sortBy || 'date';
    const sortOrder = query.sortOrder || 'desc';

    return files.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.originalName.localeCompare(b.originalName);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'date':
          comparison = a.uploadedAt.getTime() - b.uploadedAt.getTime();
          break;
        case 'type':
          comparison = a.contentType.localeCompare(b.contentType);
          break;
        case 'relevance':
          comparison = (a.relevanceScore || 0) - (b.relevanceScore || 0);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  private calculateRelevanceScores(files: FileSearchResultDTO[], searchTerm: string): FileSearchResultDTO[] {
    return files.map(file => ({
      ...file,
      relevanceScore: this.calculateContentRelevance(file, searchTerm),
    }));
  }

  private calculateContentRelevance(file: FileSearchResultDTO, searchTerm: string): number {
    const term = searchTerm.toLowerCase();
    let score = 0;

    // Exact filename match
    if (file.originalName.toLowerCase() === term) {
      score += 100;
    }
    // Filename starts with term
    else if (file.originalName.toLowerCase().startsWith(term)) {
      score += 80;
    }
    // Filename contains term
    else if (file.originalName.toLowerCase().includes(term)) {
      score += 60;
    }

    // Tag matches
    for (const tag of file.tags) {
      if (tag.toLowerCase() === term) {
        score += 50;
      } else if (tag.toLowerCase().includes(term)) {
        score += 30;
      }
    }

    // Content type match
    if (file.contentType.toLowerCase().includes(term)) {
      score += 20;
    }

    return score;
  }

  private calculateSimilarityScore(file1: FileSearchResultDTO, file2: FileSearchResultDTO): number {
    let score = 0;

    // Same content type
    if (file1.contentType === file2.contentType) {
      score += 0.4;
    }

    // Same MIME type
    if (file1.mimeType === file2.mimeType) {
      score += 0.3;
    }

    // Similar size (within 10%)
    const sizeDiff = Math.abs(file1.size - file2.size);
    const avgSize = (file1.size + file2.size) / 2;
    if (sizeDiff / avgSize < 0.1) {
      score += 0.2;
    }

    // Common tags
    const commonTags = file1.tags.filter(tag => file2.tags.includes(tag));
    score += Math.min(commonTags.length * 0.1, 0.3);

    // Similar names
    const name1 = file1.originalName.toLowerCase();
    const name2 = file2.originalName.toLowerCase();
    const nameWords1 = name1.split(/[\s._-]+/);
    const nameWords2 = name2.split(/[\s._-]+/);
    const commonWords = nameWords1.filter(word => nameWords2.includes(word));
    score += Math.min(commonWords.length * 0.05, 0.2);

    return Math.min(score, 1.0);
  }

  private async getFileById(fileId: string, userId: string): Promise<FileSearchResultDTO | null> {
    const fileEntity = await this._fileRepository.findById(fileId);
    if (!fileEntity || fileEntity.metadata.uploadedBy !== userId) {
      return null;
    }
    const results = await this.convertEntitiesToDTOs([fileEntity]);
    return results[0] || null;
  }

  private async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    const fileEntity = await this._fileRepository.findById(fileId);
    if (!fileEntity || !fileEntity.location) {
      return {};
    }

    try {
      // Get additional metadata from storage provider
      const providerMetadata = await this._storageProvider.getMetadata(fileEntity.location.key);

      return {
        ...fileEntity.metadata,
        ...providerMetadata,
      };
    } catch (error) {
      logger.warn('Could not get extended metadata', {
        module: 'file_search_use_case',
        operation: 'getExtendedMetadata',
        fileId,
        error: { message: errorMessage(error) },
        phase: 'extended_metadata_failed',
      });
      return {
        ...fileEntity.metadata,
      };
    }
  }

  private groupFilesByType(files: FileSearchResultDTO[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const file of files) {
      grouped[file.contentType] = (grouped[file.contentType] || 0) + 1;
    }
    return grouped;
  }

  private groupFilesByProvider(files: FileSearchResultDTO[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const file of files) {
      grouped[file.storageProvider] = (grouped[file.storageProvider] || 0) + 1;
    }
    return grouped;
  }

  private calculateStorageUsage(files: FileSearchResultDTO[]): FileStatsDTO['storageUsage'] {
    const used = files.reduce((sum, file) => sum + file.size, 0);
    const available = 10 * 1024 * 1024 * 1024; // 10GB limit
    const percentage = (used / available) * 100;

    return { used, available, percentage };
  }

  private calculateRecentActivity(files: FileSearchResultDTO[]): FileStatsDTO['recentActivity'] {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      uploadsToday: files.filter(file => file.uploadedAt >= oneDayAgo).length,
      uploadsThisWeek: files.filter(file => file.uploadedAt >= oneWeekAgo).length,
      uploadsThisMonth: files.filter(file => file.uploadedAt >= oneMonthAgo).length,
    };
  }
}
