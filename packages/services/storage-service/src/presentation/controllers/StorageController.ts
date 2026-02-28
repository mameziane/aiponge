/**
 * Storage Controller
 * HTTP API endpoints for storage operations
 */

import { Request, Response } from 'express';
import { StorageService } from '../../application/services/StorageService';
import { StorageError } from '../../application/errors';
import { UploadCategory } from '../../application/use-cases/UploadFileUseCase';
import { getLogger } from '../../config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { serializeError, extractAuthContext } from '@aiponge/platform-core';
import { type ProcessingJobStatus } from '@aiponge/shared-contracts';
import { AccessLogRepository } from '../../infrastructure/repositories/AccessLogRepository';

const logger = getLogger('storage-controller');

export class StorageController {
  private _accessLogRepository?: AccessLogRepository;

  constructor(
    private _storageService: StorageService,
    accessLogRepository?: AccessLogRepository
  ) {
    this._accessLogRepository = accessLogRepository;
  }

  // Upload file endpoint
  uploadFile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        ServiceErrors.badRequest(res, 'No file provided', req, { code: 'NO_FILE' });
        return;
      }

      const request = {
        file: req.file.buffer,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        userId: req.body.userId || extractAuthContext(req).userId,
        isPublic: req.body.isPublic === 'true',
        tags: [] as string[],
        expiresIn: req.body.expiresIn ? parseInt(req.body.expiresIn) : undefined,
        category: req.body.category as UploadCategory | undefined,
      };

      if (req.body.tags) {
        try {
          request.tags = JSON.parse(req.body.tags);
        } catch {
          ServiceErrors.badRequest(res, 'Invalid JSON format for tags field', req, { code: 'INVALID_TAGS' });
          return;
        }
      }

      const result = await this._storageService.uploadFile(request);

      sendCreated(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Download file endpoint
  downloadFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const filePath = Array.isArray(req.params.filePath) ? req.params.filePath[0] : req.params.filePath;
      const { userId } = extractAuthContext(req);

      const request = {
        fileId: fileId || undefined,
        filePath: filePath || undefined,
        userId,
      };

      const result = await this._storageService.downloadFile(request);

      const safeName = result.originalName.replace(/["\r\n]/g, '').replace(/[^\x20-\x7E]/g, '_');

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Length', result.size);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(result.originalName)}; filename="${safeName}"`
      );

      res.send(result.data);

      if (this._accessLogRepository && fileId) {
        this._accessLogRepository
          .logAccess({
            fileId,
            userId,
            action: 'download',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            responseCode: 200,
            bytesTransferred: result.size,
          })
          .catch(err => logger.error('Failed to log access', { error: serializeError(err) }));
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Delete file endpoint
  deleteFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { userId } = extractAuthContext(req);

      const request = {
        fileId,
        userId,
      };

      const result = await this._storageService.deleteFile(request);

      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Generate signed URL endpoint
  generateSignedUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;
      const { userId } = extractAuthContext(req);
      const { expiresIn, operation } = req.query;
      const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;

      const request = {
        fileId: normalizedFileId,
        userId,
        expiresIn: expiresIn ? parseInt(expiresIn as string) : undefined,
        operation: (operation as 'read' | 'write') || 'read',
      };

      const result = await this._storageService.generateSignedUrl(request);

      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // List files endpoint
  listFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = extractAuthContext(req);
      const { contentType, tags, isPublic, limit, offset, ownedOnly } = req.query;

      const request = {
        userId,
        contentType: contentType as string,
        tags: tags ? (tags as string).split(',') : undefined,
        isPublic: isPublic ? isPublic === 'true' : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        ownedOnly: ownedOnly === 'true',
      };

      const result = await this._storageService.listFiles(request);

      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Get file metadata endpoint
  getFileMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { userId } = extractAuthContext(req);

      const request = {
        fileId,
        userId,
      };

      const result = await this._storageService.getFileMetadata(request);

      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Download external file endpoint
  downloadExternalFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskId, externalUrl, metadata, destinationPath } = req.body;

      if (!taskId || !externalUrl) {
        ServiceErrors.badRequest(res, 'taskId and externalUrl are required', req, { code: 'INVALID_REQUEST' });
        return;
      }

      const request = {
        taskId,
        externalUrl,
        metadata,
        destinationPath,
      };

      const result = await this._storageService.downloadExternalFile(request);

      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Health check endpoint
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const providerHealth = await this._storageService.checkProviderHealth();
      const stats = await this._storageService.getStorageStats();

      res.json({
        success: true,
        data: {
          service: 'storage-service',
          status: 'healthy',
          provider: providerHealth,
          stats,
        },
      });
    } catch (error) {
      if (error instanceof StorageError) {
        const correlationId = req?.headers?.['x-correlation-id'] as string | undefined;
        const response = StorageError.createResponse(error, correlationId);
        res.status(response.status).json(response.body);
      } else {
        logger.error('Health check failed', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Health check failed', req);
        return;
      }
    }
  };

  // Cleanup expired files endpoint (admin only)
  cleanupExpiredFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this._storageService.cleanupExpiredFiles();

      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof StorageError) {
        const correlationId = req?.headers?.['x-correlation-id'] as string | undefined;
        const response = StorageError.createResponse(error, correlationId);
        res.status(response.status).json(response.body);
      } else {
        logger.error('Cleanup expired files failed', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Failed to cleanup expired files', req);
        return;
      }
    }
  };

  // ============================================
  // Advanced File Management Endpoints
  // ============================================

  // File Access Control Endpoints
  shareFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { toUserId, permission, expiresAt } = req.body;
      const { userId: fromUserId } = extractAuthContext(req);

      const result = await this._storageService.shareFile(
        fileId,
        fromUserId,
        toUserId,
        permission,
        expiresAt ? new Date(expiresAt) : undefined
      );

      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to share file', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  updateFileAccess = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { visibility } = req.body;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.updateFileVisibility(fileId, userId, visibility);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to update file access', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  checkFileAccess = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { permission } = req.query;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.checkFileAccess(
        fileId,
        userId,
        permission as 'write' | 'read' | 'delete' | 'share'
      );
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  revokeFileAccess = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { targetUserId } = req.body;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.revokeFileAccess(fileId, userId, targetUserId);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to revoke file access', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getFilePermissions = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.getFilePermissions(fileId, userId);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getUserSharedFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = extractAuthContext(req);
      const result = await this._storageService.getUserSharedFiles(userId);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // File Versioning Endpoints
  createFileVersion = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { changeDescription, tags } = req.body;
      const { userId } = extractAuthContext(req);

      if (!req.file) {
        ServiceErrors.badRequest(res, 'No file content provided', req);
        return;
      }

      const request = {
        fileId,
        userId,
        newContent: req.file.buffer,
        changeDescription,
        tags,
      };

      const result = await this._storageService.createFileVersion(request);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendCreated(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to create file version', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getFileVersionHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.getFileVersionHistory(fileId, userId);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  revertFileToVersion = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const versionId = Array.isArray(req.params.versionId) ? req.params.versionId[0] : req.params.versionId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.revertFileToVersion(fileId, versionId, userId);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to revert file version', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  deleteFileVersion = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const versionId = Array.isArray(req.params.versionId) ? req.params.versionId[0] : req.params.versionId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.deleteFileVersion(fileId, versionId, userId);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to delete file version', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  compareFileVersions = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { version1Id, version2Id } = req.query;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.compareFileVersions(
        fileId,
        version1Id as string,
        version2Id as string,
        userId
      );
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getVersionContent = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const versionId = Array.isArray(req.params.versionId) ? req.params.versionId[0] : req.params.versionId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.getVersionContent(fileId, versionId, userId);

      if (result.success && result.content) {
        res.setHeader('Content-Type', result.version?.mimeType || 'application/octet-stream');
        res.send(result.content);
      } else {
        ServiceErrors.badRequest(res, 'Failed to get version content', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Background Processing Endpoints
  queueProcessingTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { taskType, parameters, priority } = req.body;
      const { userId } = extractAuthContext(req);

      const request = {
        fileId,
        userId,
        taskType,
        parameters,
        priority,
      };

      const result = await this._storageService.queueProcessingTask(request);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendCreated(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to queue processing task', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getProcessingTaskStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
      const result = await this._storageService.getProcessingTaskStatus(taskId);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getUserProcessingTasks = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, taskType } = req.query;
      const { userId } = extractAuthContext(req);

      const statusVal = status as ProcessingJobStatus | undefined;
      const result = await this._storageService.getUserProcessingTasks(userId, statusVal, taskType as string);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  cancelProcessingTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.cancelProcessingTask(taskId, userId);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to cancel processing task', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  retryProcessingTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.retryProcessingTask(taskId, userId);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to retry processing task', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getProcessingQueueStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this._storageService.getProcessingQueueStats();
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Resumable Upload Endpoints
  uploadFileChunk = async (req: Request, res: Response): Promise<void> => {
    try {
      const { uploadId, chunkIndex, totalSize, chunkSize, originalName, mimeType, contentType } = req.body;
      const { userId } = extractAuthContext(req);

      if (!req.file) {
        ServiceErrors.badRequest(res, 'No chunk data provided', req);
        return;
      }

      const request = {
        userId,
        file: req.file.buffer,
        originalName,
        mimeType,
        totalSize: parseInt(totalSize),
        chunkSize: parseInt(chunkSize),
        chunkIndex: parseInt(chunkIndex),
        uploadId,
        contentType,
        title: req.body.title,
        tags: undefined as string[] | undefined,
      };

      if (req.body.tags) {
        try {
          request.tags = JSON.parse(req.body.tags);
        } catch {
          ServiceErrors.badRequest(res, 'Invalid JSON format for tags field', req, { code: 'INVALID_TAGS' });
          return;
        }
      }

      const result = await this._storageService.uploadFileChunk(request);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to upload file chunk', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getUploadStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const uploadId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
      const result = await this._storageService.getUploadStatus(uploadId);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  cancelUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const uploadId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.cancelUpload(uploadId, userId);
      if (result.success) {
        const { success: _, error: _e, ...data } = result;
        sendSuccess(res, data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Failed to cancel upload', req);
      }
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getUserUploads = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = extractAuthContext(req);
      const result = await this._storageService.getUserUploads(userId);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // File Search Endpoints
  searchFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = extractAuthContext(req);
      const query = {
        userId,
        ...req.query,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        sizeRange:
          req.query.minSize || req.query.maxSize
            ? {
                min: req.query.minSize ? parseInt(req.query.minSize as string) : 0,
                max: req.query.maxSize ? parseInt(req.query.maxSize as string) : Number.MAX_SAFE_INTEGER,
              }
            : undefined,
        dateRange:
          req.query.fromDate || req.query.toDate
            ? {
                from: req.query.fromDate ? new Date(req.query.fromDate as string) : new Date(0),
                to: req.query.toDate ? new Date(req.query.toDate as string) : new Date(),
              }
            : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        includeMetadata: req.query.includeMetadata === 'true',
      };

      const result = await this._storageService.searchFiles(query);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getFileStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = extractAuthContext(req);
      const dateRange =
        req.query.fromDate || req.query.toDate
          ? {
              from: req.query.fromDate ? new Date(req.query.fromDate as string) : new Date(0),
              to: req.query.toDate ? new Date(req.query.toDate as string) : new Date(),
            }
          : undefined;

      const result = await this._storageService.getFileStats(userId, dateRange);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  searchSimilarFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
      const { limit } = req.query;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.searchSimilarFiles(
        fileId,
        userId,
        limit ? parseInt(limit as string) : undefined
      );
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  searchDuplicateFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = extractAuthContext(req);
      const result = await this._storageService.searchDuplicateFiles(userId);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  searchFilesByContent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { query: contentQuery, contentTypes, limit } = req.query;
      const { userId } = extractAuthContext(req);

      const result = await this._storageService.searchFilesByContent(
        contentQuery as string,
        userId,
        contentTypes ? (contentTypes as string).split(',') : undefined,
        limit ? parseInt(limit as string) : undefined
      );
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  markFileAsOrphaned = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileUrl } = req.body;

      if (!fileUrl) {
        ServiceErrors.badRequest(res, 'fileUrl is required', req);
        return;
      }

      const result = await this._storageService.markFileAsOrphaned(fileUrl);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  markFilesAsOrphanedBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileUrls } = req.body;

      if (!fileUrls || !Array.isArray(fileUrls)) {
        ServiceErrors.badRequest(res, 'fileUrls array is required', req);
        return;
      }

      const result = await this._storageService.markFilesAsOrphanedBatch(fileUrls);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  detectUnreferencedFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { batchSize, dryRun, categories } = req.body;

      const config = {
        batchSize: batchSize ? parseInt(batchSize) : undefined,
        dryRun: dryRun === true || dryRun === 'true',
        categories: categories && Array.isArray(categories) ? categories : undefined,
      };

      const result = await this._storageService.detectUnreferencedFiles(config);
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getFileReferenceStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this._storageService.getFileReferenceStats();
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  getOrphanedFilesStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this._storageService.getOrphanedFilesStats();
      sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, req);
    }
  };

  // Helper method for error handling
  private handleError(res: Response, error: unknown, req?: Request): void {
    if (error instanceof StorageError) {
      const correlationId = req?.headers?.['x-correlation-id'] as string | undefined;
      const response = StorageError.createResponse(error, correlationId);
      res.status(response.status).json(response.body);
    } else {
      logger.error('Unexpected error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'An unexpected error occurred', req);
      return;
    }
  }
}
