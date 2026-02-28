/**
 * File Analytics Use Case
 * Provides comprehensive file statistics and analytics
 */

import { IStorageRepository } from '../interfaces/IStorageRepository';
import { FileEntity } from '../../domains/entities/FileEntity';
import { getLogger } from '../../config/service-urls';
import { StorageError } from '../errors';

const logger = getLogger('file-analytics-use-case');

export interface FileAnalyticsRequest {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface FileAnalyticsResponse {
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
    downloadsToday: number;
    deletionsToday: number;
  };
  trends: {
    uploadTrend: 'increasing' | 'decreasing' | 'stable';
    sizeTrend: 'increasing' | 'decreasing' | 'stable';
  };
}

export class FileAnalyticsUseCase {
  constructor(private _repository: IStorageRepository) {}

  async execute(request: FileAnalyticsRequest): Promise<FileAnalyticsResponse> {
    try {
      // Get all files for the user or system-wide if no userId provided
      const files: FileEntity[] = request.userId
        ? await this._repository.findByUserId(request.userId)
        : await this._repository.search({ limit: 10000 }); // Large limit to get all files for analytics

      // Filter by date range if provided
      const filteredFiles = files.filter((file: FileEntity) => {
        if (request.startDate && file.createdAt < request.startDate) return false;
        if (request.endDate && file.createdAt > request.endDate) return false;
        return true;
      });

      // Calculate basic metrics
      const totalFiles = filteredFiles.length;
      const totalSize = filteredFiles.reduce((sum: number, file: FileEntity) => sum + (file.size || 0), 0);

      // Group by file type
      const filesByType: Record<string, number> = {};
      filteredFiles.forEach((file: FileEntity) => {
        const extension = file.filename.split('.').pop()?.toLowerCase() || 'unknown';
        filesByType[extension] = (filesByType[extension] || 0) + 1;
      });

      // Group by provider
      const filesByProvider: Record<string, number> = {};
      filteredFiles.forEach((file: FileEntity) => {
        const provider = file.provider || 'local';
        filesByProvider[provider] = (filesByProvider[provider] || 0) + 1;
      });

      // Calculate storage usage (mock for now - could be enhanced with actual provider limits)
      const usedStorage = totalSize;
      const availableStorage = 10 * 1024 * 1024 * 1024; // 10GB default limit
      const storagePercentage = Math.min((usedStorage / availableStorage) * 100, 100);

      // Calculate recent activity (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentFiles = filteredFiles.filter((file: FileEntity) => file.createdAt >= yesterday);

      // Simple trend analysis (could be enhanced with more historical data)
      const uploadTrend = recentFiles.length > 5 ? 'increasing' : recentFiles.length < 2 ? 'decreasing' : 'stable';
      const sizeTrend = totalSize > 100 * 1024 * 1024 ? 'increasing' : 'stable'; // > 100MB

      return {
        totalFiles,
        totalSize,
        filesByType,
        filesByProvider,
        storageUsage: {
          used: usedStorage,
          available: availableStorage - usedStorage,
          percentage: storagePercentage,
        },
        recentActivity: {
          uploadsToday: recentFiles.length,
          downloadsToday: 0, // Would need download tracking
          deletionsToday: 0, // Would need deletion tracking
        },
        trends: {
          uploadTrend: uploadTrend as 'increasing' | 'decreasing' | 'stable',
          sizeTrend: sizeTrend as 'increasing' | 'decreasing' | 'stable',
        },
      };
    } catch (error) {
      logger.error('FileAnalyticsUseCase error', {
        module: 'file_analytics_use_case',
        operation: 'execute',
        userId: request.userId,
        error: error instanceof Error ? error.message : String(error),
        phase: 'analytics_calculation_failed',
      });
      throw StorageError.internalError(
        `Failed to generate file analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}
