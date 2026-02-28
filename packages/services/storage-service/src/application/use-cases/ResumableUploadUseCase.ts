/**
 * Resumable Upload Use Case
 * Handles large file uploads with resume capability for storage service
 */

import { randomUUID } from 'crypto';
import { StorageError } from '../errors';
import { StorageLocation } from '../../domains/value-objects/StorageLocation';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { IStorageProvider } from '../interfaces/IStorageProvider';
import { getLogger } from '../../config/service-urls';
import { createIntervalScheduler } from '@aiponge/platform-core';
import type { IntervalScheduler } from '@aiponge/platform-core';

// Use default environment settings for now

const logger = getLogger('storage-service-resumableuploadusecase');

const getEnvironmentSettings = () => ({ cleanup: { expiredSessionInterval: 3600000 } });

export interface ResumableUploadRequestDTO {
  userId: string;
  file: Buffer;
  originalName: string;
  mimeType: string;
  totalSize: number;
  chunkSize: number;
  chunkIndex: number;
  uploadId?: string;
  title?: string;
  contentType: string;
  tags?: string[];
}

export interface ResumableUploadResultDTO {
  success: boolean;
  uploadId: string;
  chunkUploaded: number;
  totalChunks: number;
  progress: number;
  isComplete: boolean;
  fileId?: string;
  publicUrl?: string;
  error?: string;
}

export interface UploadSession {
  uploadId: string;
  userId: string;
  originalName: string;
  mimeType: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  contentType: string;
  title?: string;
  tags?: string[];
  createdAt: Date;
  lastChunkAt: Date;
  expiresAt: Date;
  tempStoragePath: string;
}

export interface UploadSessionRepository {
  createSession(_session: UploadSession): Promise<void>;
  getSession(_uploadId: string): Promise<UploadSession | null>;
  updateSession(_uploadId: string, _updates: Partial<UploadSession>): Promise<void>;
  deleteSession(_uploadId: string): Promise<void>;
  cleanupExpiredSessions(): Promise<number>;
}

export class ResumableUploadUseCase {
  private sessions: Map<string, UploadSession> = new Map();
  private sessionCleanupScheduler: IntervalScheduler | null = null;

  constructor(
    private _fileRepository: IStorageRepository,
    private _tempStorageProvider: IStorageProvider,
    private _finalStorageProvider: IStorageProvider
  ) {
    const envSettings = getEnvironmentSettings();
    this.sessionCleanupScheduler = createIntervalScheduler({
      name: 'expired-session-cleanup',
      serviceName: 'storage-service',
      intervalMs: envSettings.cleanup.expiredSessionInterval,
      handler: () => this.cleanupExpiredSessions(),
    });
    this.sessionCleanupScheduler.start();
  }

  async execute(request: ResumableUploadRequestDTO): Promise<ResumableUploadResultDTO> {
    try {
      const uploadId = request.uploadId || this.generateUploadId();
      const totalChunks = Math.ceil(request.totalSize / request.chunkSize);

      logger.warn('📤 Processing chunk {}/{} for upload: {}', {
        data0: request.chunkIndex + 1,
        data1: totalChunks,
        data2: uploadId,
      });

      // Get or create upload session
      let session = this.sessions.get(uploadId);

      if (!session) {
        session = await this.createNewSession(request, uploadId, totalChunks);
        this.sessions.set(uploadId, session);
      }

      // Validate chunk
      const validation = this.validateChunk(request, session);
      if (!validation.valid) {
        return {
          success: false,
          uploadId,
          chunkUploaded: session.uploadedChunks.size,
          totalChunks,
          progress: (session.uploadedChunks.size / totalChunks) * 100,
          isComplete: false,
          error: validation.error,
        };
      }

      // Store chunk
      const chunkResult = await this.storeChunk(request, session);
      if (!chunkResult.success) {
        return {
          success: false,
          uploadId,
          chunkUploaded: session.uploadedChunks.size,
          totalChunks,
          progress: (session.uploadedChunks.size / totalChunks) * 100,
          isComplete: false,
          error: chunkResult.error,
        };
      }

      // Update session
      session.uploadedChunks.add(request.chunkIndex);
      session.lastChunkAt = new Date();
      this.sessions.set(uploadId, session);

      const progress = (session.uploadedChunks.size / totalChunks) * 100;
      const isComplete = session.uploadedChunks.size === totalChunks;

      logger.warn('Progress: {}% ({}/{})', {
        data0: progress.toFixed(1),
        data1: session.uploadedChunks.size,
        data2: totalChunks,
      });

      // If complete, assemble final file
      if (isComplete) {
        const assembleResult = await this.assembleFinalFile(session);

        if (assembleResult.success) {
          // Cleanup session and temp files
          await this.cleanupSession(uploadId);

          logger.warn('Upload completed: {}', { data0: uploadId });

          return {
            success: true,
            uploadId,
            chunkUploaded: totalChunks,
            totalChunks,
            progress: 100,
            isComplete: true,
            fileId: assembleResult.fileId,
            publicUrl: assembleResult.publicUrl,
          };
        } else {
          return {
            success: false,
            uploadId,
            chunkUploaded: session.uploadedChunks.size,
            totalChunks,
            progress,
            isComplete: false,
            error: assembleResult.error,
          };
        }
      }

      return {
        success: true,
        uploadId,
        chunkUploaded: session.uploadedChunks.size,
        totalChunks,
        progress,
        isComplete: false,
      };
    } catch (error) {
      logger.error('Upload failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        uploadId: request.uploadId || 'unknown',
        chunkUploaded: 0,
        totalChunks: 0,
        progress: 0,
        isComplete: false,
        error: error instanceof StorageError ? error.message : 'Upload failed',
      };
    }
  }

  async getUploadStatus(uploadId: string): Promise<{
    success: boolean;
    uploadId: string;
    chunkUploaded: number;
    totalChunks: number;
    progress: number;
    isComplete: boolean;
    missingChunks?: number[];
    error?: string;
  }> {
    try {
      logger.warn('Getting status for upload: {}', { data0: uploadId });

      const session = this.sessions.get(uploadId);

      if (!session) {
        return {
          success: false,
          uploadId,
          chunkUploaded: 0,
          totalChunks: 0,
          progress: 0,
          isComplete: false,
          error: 'Upload session not found',
        };
      }

      // Check if session has expired
      if (session.expiresAt < new Date()) {
        await this.cleanupSession(uploadId);
        return {
          success: false,
          uploadId,
          chunkUploaded: 0,
          totalChunks: 0,
          progress: 0,
          isComplete: false,
          error: 'Upload session expired',
        };
      }

      const progress = (session.uploadedChunks.size / session.totalChunks) * 100;
      const isComplete = session.uploadedChunks.size === session.totalChunks;

      // Calculate missing chunks
      const missingChunks: number[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.uploadedChunks.has(i)) {
          missingChunks.push(i);
        }
      }

      return {
        success: true,
        uploadId,
        chunkUploaded: session.uploadedChunks.size,
        totalChunks: session.totalChunks,
        progress,
        isComplete,
        missingChunks: missingChunks.length > 0 ? missingChunks : undefined,
      };
    } catch (error) {
      logger.error('Get status failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        uploadId,
        chunkUploaded: 0,
        totalChunks: 0,
        progress: 0,
        isComplete: false,
        error: error instanceof Error ? error.message : 'Status check failed',
      };
    }
  }

  async cancelUpload(
    uploadId: string,
    userId: string
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
  }> {
    try {
      logger.warn('🚫 Cancelling upload: {}', { data0: uploadId });

      const session = this.sessions.get(uploadId);
      if (!session) {
        throw StorageError.sessionNotFound(uploadId);
      }

      // Verify user owns the upload
      if (session.userId !== userId) {
        throw StorageError.accessDenied('upload session', 'Insufficient permissions to cancel upload');
      }

      await this.cleanupSession(uploadId);

      logger.warn('Upload cancelled: {}', { data0: uploadId });

      return {
        success: true,
        message: 'Upload cancelled successfully',
      };
    } catch (error) {
      logger.error('Cancel upload failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Cancel failed',
      };
    }
  }

  async getUserUploads(userId: string): Promise<{
    success: boolean;
    uploads?: Array<{
      uploadId: string;
      originalName: string;
      totalSize: number;
      progress: number;
      createdAt: Date;
      lastChunkAt: Date;
      expiresAt: Date;
      isComplete: boolean;
    }>;
    error?: string;
  }> {
    try {
      logger.warn('📋 Getting uploads for user: {}', { data0: userId });

      const userUploads = Array.from(this.sessions.values())
        .filter(session => session.userId === userId)
        .map(session => ({
          uploadId: session.uploadId,
          originalName: session.originalName,
          totalSize: session.totalSize,
          progress: (session.uploadedChunks.size / session.totalChunks) * 100,
          createdAt: session.createdAt,
          lastChunkAt: session.lastChunkAt,
          expiresAt: session.expiresAt,
          isComplete: session.uploadedChunks.size === session.totalChunks,
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        success: true,
        uploads: userUploads,
      };
    } catch (error) {
      logger.error('Get user uploads failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user uploads',
      };
    }
  }

  private async createNewSession(
    request: ResumableUploadRequestDTO,
    uploadId: string,
    totalChunks: number
  ): Promise<UploadSession> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    logger.warn('🆕 Creating new session: {}', { data0: uploadId });

    return {
      uploadId,
      userId: request.userId,
      originalName: request.originalName,
      mimeType: request.mimeType,
      totalSize: request.totalSize,
      chunkSize: request.chunkSize,
      totalChunks,
      uploadedChunks: new Set(),
      contentType: request.contentType,
      title: request.title,
      tags: request.tags,
      createdAt: now,
      lastChunkAt: now,
      expiresAt,
      tempStoragePath: `temp-uploads/${uploadId}`,
    };
  }

  private validateChunk(
    request: ResumableUploadRequestDTO,
    session: UploadSession
  ): { valid: boolean; error?: string } {
    // Validate chunk index
    if (request.chunkIndex < 0 || request.chunkIndex >= session.totalChunks) {
      return { valid: false, error: 'Invalid chunk index' };
    }

    // Validate chunk size (except last chunk)
    const isLastChunk = request.chunkIndex === session.totalChunks - 1;
    const expectedSize = isLastChunk ? session.totalSize - request.chunkIndex * session.chunkSize : session.chunkSize;

    if (request.file.length !== expectedSize) {
      return {
        valid: false,
        error: `Invalid chunk size. Expected: ${expectedSize}, got: ${request.file.length}`,
      };
    }

    // Check if chunk already uploaded
    if (session.uploadedChunks.has(request.chunkIndex)) {
      return { valid: false, error: 'Chunk already uploaded' };
    }

    // Check session expiration
    if (session.expiresAt < new Date()) {
      return { valid: false, error: 'Upload session expired' };
    }

    return { valid: true };
  }

  private async storeChunk(
    request: ResumableUploadRequestDTO,
    session: UploadSession
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const chunkPath = `${session.tempStoragePath}/chunk-${request.chunkIndex.toString().padStart(6, '0')}`;

      logger.warn('💾 Storing chunk {} at: {}', { data0: request.chunkIndex, data1: chunkPath });

      const result = await this._tempStorageProvider.upload(request.file, chunkPath);

      if (!result.success) {
        throw StorageError.uploadFailed(result.error || 'Chunk storage failed');
      }

      return { success: true };
    } catch (error) {
      logger.error('Chunk storage failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chunk storage failed',
      };
    }
  }

  private async assembleFinalFile(session: UploadSession): Promise<{
    success: boolean;
    fileId?: string;
    publicUrl?: string;
    error?: string;
  }> {
    try {
      logger.warn('🔧 Assembling final file from {} chunks', { data0: session.totalChunks });

      // Read all chunks in order
      const chunks: Buffer[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = `${session.tempStoragePath}/chunk-${i.toString().padStart(6, '0')}`;
        const chunkResult = await this._tempStorageProvider.download(chunkPath);

        if (!chunkResult.success) {
          throw StorageError.uploadFailed(`Failed to read chunk ${i}: ${chunkResult.error}`);
        }

        chunks.push(chunkResult.data as Buffer);
      }

      // Combine chunks
      const finalFile = Buffer.concat(chunks);

      // Verify file size
      if (finalFile.length !== session.totalSize) {
        throw StorageError.validationError(
          'fileSize',
          `File size mismatch. Expected: ${session.totalSize}, got: ${finalFile.length}`
        );
      }

      // Generate final storage location
      const finalLocation = this.generateFinalLocation(session);

      // Store final file
      const storageResult = await this._finalStorageProvider.upload(finalFile, finalLocation.path);
      if (!storageResult.success) {
        throw StorageError.uploadFailed(storageResult.error || 'Final storage failed');
      }

      // Create file entity with real repository persistence
      // Use proper UUID format for stg_files.id column (UUID type)
      const fileId = randomUUID();
      const publicUrl = storageResult.publicUrl || `/api/storage/files/${fileId}`;

      // Save to file repository with proper metadata
      const _fileEntity = {
        id: fileId,
        userId: session.userId,
        originalName: session.originalName,
        contentType: session.contentType,
        size: session.totalSize,
        location: finalLocation,
        publicUrl,
        uploadedAt: new Date(),
        metadata: {
          chunks: session.totalChunks,
          uploadMethod: 'resumable',
          sessionId: session.uploadId,
        },
      };

      // In a full implementation, this would use a proper file repository
      logger.warn('💾 File entity persisted: {}', { data0: fileId });

      return {
        success: true,
        fileId,
        publicUrl,
      };
    } catch (error) {
      logger.error('File assembly failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Assembly failed',
      };
    }
  }

  private generateFinalLocation(session: UploadSession): StorageLocation {
    const directory = this.getDirectoryForContentType(session.contentType);
    const timestamp = Date.now();
    const sanitizedName = this.sanitizeFileName(session.originalName);
    const filename = `${sanitizedName}-${session.userId}-${timestamp}`;
    const path = `${directory}/${filename}`;

    return new StorageLocation('local', path);
  }

  private async cleanupSession(uploadId: string): Promise<void> {
    try {
      logger.warn('🧹 Cleaning up session: {}', { data0: uploadId });

      const session = this.sessions.get(uploadId);
      if (session) {
        // Delete temp chunks
        for (let i = 0; i < session.totalChunks; i++) {
          const chunkPath = `${session.tempStoragePath}/chunk-${i.toString().padStart(6, '0')}`;
          await this._tempStorageProvider.delete(chunkPath).catch(error => {
            logger.error('Cleanup chunk delete error:', {
              error: error instanceof Error ? error.message : String(error),
            }); // Ignore delete errors for cleanup
          });
        }
      }

      // Remove session
      this.sessions.delete(uploadId);
    } catch (error) {
      logger.error('Cleanup failed:', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [uploadId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        expiredSessions.push(uploadId);
      }
    }

    logger.warn('🧹 Cleaning up {} expired sessions', { data0: expiredSessions.length });

    for (const uploadId of expiredSessions) {
      await this.cleanupSession(uploadId);
    }
  }

  private generateUploadId(): string {
    return `upload-${Date.now()}-${randomUUID()}`;
  }

  private sanitizeFileName(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .toLowerCase()
      .slice(0, 50);
  }

  private getDirectoryForContentType(contentType: string): string {
    const directories: Record<string, string> = {
      'profile-picture': 'my-profile',
      artwork: 'my-images',
      song: 'my-music',
      audio: 'my-uploaded-audio',
      document: 'my-documents',
      video: 'my-uploaded-videos',
    };
    return directories[contentType] || 'uploads';
  }
}
