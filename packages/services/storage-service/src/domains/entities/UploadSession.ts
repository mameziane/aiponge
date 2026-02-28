/**
 * UploadSession Entity - Storage Service Domain Model
 * Represents a file upload session for tracking multi-part/resumable uploads
 */

import { StorageError } from '../../application/errors';
import { UPLOAD_STATUS, type UploadStatus } from '@aiponge/shared-contracts';

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
  estimatedTimeRemaining?: number;
}

export interface UploadChunk {
  chunkNumber: number;
  chunkSize: number;
  etag?: string;
  uploadedAt: Date;
}

export class UploadSession {
  constructor(
    public readonly id: string,
    public readonly fileId: string,
    public readonly userId: string,
    public readonly filename: string,
    public readonly totalSize: number,
    public readonly chunkSize: number,
    public readonly mimeType: string,
    public readonly status: UploadStatus = UPLOAD_STATUS.PENDING,
    public readonly uploadedChunks: UploadChunk[] = [],
    public readonly metadata: Record<string, unknown> = {},
    public readonly expiresAt: Date,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {
    this.validateSession();
  }

  private validateSession(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw StorageError.validationError('id', 'cannot be empty');
    }

    if (!this.fileId || this.fileId.trim().length === 0) {
      throw StorageError.validationError('fileId', 'cannot be empty');
    }

    if (!this.userId || this.userId.trim().length === 0) {
      throw StorageError.validationError('userId', 'cannot be empty');
    }

    if (!this.filename || this.filename.trim().length === 0) {
      throw StorageError.validationError('filename', 'cannot be empty');
    }

    if (this.totalSize <= 0) {
      throw StorageError.validationError('totalSize', 'must be greater than 0');
    }

    if (this.chunkSize <= 0) {
      throw StorageError.validationError('chunkSize', 'must be greater than 0');
    }

    if (this.expiresAt <= new Date()) {
      throw StorageError.validationError('expiresAt', 'must be in the future');
    }
  }

  /**
   * Get upload progress information
   */
  getProgress(): UploadProgress {
    const bytesUploaded = this.uploadedChunks.reduce((total, chunk) => total + chunk.chunkSize, 0);
    const percentage = Math.min((bytesUploaded / this.totalSize) * 100, 100);

    // Estimate time remaining based on upload speed
    const estimatedTimeRemaining = this.calculateEstimatedTimeRemaining(bytesUploaded);

    return {
      bytesUploaded,
      totalBytes: this.totalSize,
      percentage: Math.round(percentage * 100) / 100,
      estimatedTimeRemaining,
    };
  }

  private calculateEstimatedTimeRemaining(bytesUploaded: number): number | undefined {
    if (this.uploadedChunks.length < 2 || bytesUploaded === 0) {
      return undefined;
    }

    const firstChunk = this.uploadedChunks[0];
    const lastChunk = this.uploadedChunks[this.uploadedChunks.length - 1];
    const timeDiff = lastChunk.uploadedAt.getTime() - firstChunk.uploadedAt.getTime();

    if (timeDiff <= 0) return undefined;

    const uploadSpeed = bytesUploaded / (timeDiff / 1000); // bytes per second
    const remainingBytes = this.totalSize - bytesUploaded;

    return Math.ceil(remainingBytes / uploadSpeed);
  }

  /**
   * Add an uploaded chunk
   */
  addUploadedChunk(chunkNumber: number, chunkSize: number, etag?: string): UploadSession {
    // Validate chunk
    if (chunkNumber < 1) {
      throw StorageError.validationError('chunkNumber', 'must be greater than 0');
    }

    if (chunkSize <= 0) {
      throw StorageError.validationError('chunkSize', 'must be greater than 0');
    }

    // Check if chunk already exists
    const existingChunk = this.uploadedChunks.find(chunk => chunk.chunkNumber === chunkNumber);
    if (existingChunk) {
      throw StorageError.validationError('chunkNumber', `chunk ${chunkNumber} already uploaded`);
    }

    const newChunk: UploadChunk = {
      chunkNumber,
      chunkSize,
      etag,
      uploadedAt: new Date(),
    };

    const updatedChunks = [...this.uploadedChunks, newChunk].sort((a, b) => a.chunkNumber - b.chunkNumber);

    return new UploadSession(
      this.id,
      this.fileId,
      this.userId,
      this.filename,
      this.totalSize,
      this.chunkSize,
      this.mimeType,
      this.calculateNewStatus(updatedChunks),
      updatedChunks,
      this.metadata,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  private calculateNewStatus(chunks: UploadChunk[]): UploadStatus {
    if (chunks.length === 0) {
      return UPLOAD_STATUS.PENDING;
    }

    const totalBytesUploaded = chunks.reduce((total, chunk) => total + chunk.chunkSize, 0);

    if (totalBytesUploaded >= this.totalSize) {
      return UPLOAD_STATUS.COMPLETED;
    }

    return UPLOAD_STATUS.IN_PROGRESS;
  }

  /**
   * Mark session as failed
   */
  markAsFailed(error?: string): UploadSession {
    const updatedMetadata = error ? { ...this.metadata, error, failedAt: new Date().toISOString() } : this.metadata;

    return new UploadSession(
      this.id,
      this.fileId,
      this.userId,
      this.filename,
      this.totalSize,
      this.chunkSize,
      this.mimeType,
      UPLOAD_STATUS.FAILED,
      this.uploadedChunks,
      updatedMetadata,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  /**
   * Mark session as cancelled
   */
  markAsCancelled(): UploadSession {
    const updatedMetadata = {
      ...this.metadata,
      cancelledAt: new Date().toISOString(),
    };

    return new UploadSession(
      this.id,
      this.fileId,
      this.userId,
      this.filename,
      this.totalSize,
      this.chunkSize,
      this.mimeType,
      UPLOAD_STATUS.CANCELLED,
      this.uploadedChunks,
      updatedMetadata,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if upload is complete
   */
  isComplete(): boolean {
    return this.status === UPLOAD_STATUS.COMPLETED;
  }

  /**
   * Check if upload can be resumed
   */
  canResume(): boolean {
    return (
      !this.isExpired() &&
      (this.status === UPLOAD_STATUS.PENDING || this.status === UPLOAD_STATUS.IN_PROGRESS) &&
      this.uploadedChunks.length > 0
    );
  }

  /**
   * Get missing chunks for resumable upload
   */
  getMissingChunkNumbers(): number[] {
    const totalChunks = Math.ceil(this.totalSize / this.chunkSize);
    const uploadedChunkNumbers = new Set(this.uploadedChunks.map(chunk => chunk.chunkNumber));

    const missingChunks: number[] = [];
    for (let i = 1; i <= totalChunks; i++) {
      if (!uploadedChunkNumbers.has(i)) {
        missingChunks.push(i);
      }
    }

    return missingChunks;
  }

  /**
   * Get next chunk number to upload
   */
  getNextChunkNumber(): number | null {
    const missingChunks = this.getMissingChunkNumbers();
    return missingChunks.length > 0 ? missingChunks[0] : null;
  }

  /**
   * Static factory method
   */
  static create(
    id: string,
    fileId: string,
    userId: string,
    filename: string,
    totalSize: number,
    chunkSize: number,
    mimeType: string,
    expirationHours: number = 24
  ): UploadSession {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    return new UploadSession(
      id,
      fileId,
      userId,
      filename,
      totalSize,
      chunkSize,
      mimeType,
      UPLOAD_STATUS.PENDING,
      [],
      {},
      expiresAt
    );
  }

  /**
   * Get upload statistics
   */
  getUploadStats(): {
    chunksUploaded: number;
    chunksRemaining: number;
    uploadSpeed: number | null;
    estimatedCompletion: Date | null;
  } {
    const chunksUploaded = this.uploadedChunks.length;
    const totalChunks = Math.ceil(this.totalSize / this.chunkSize);
    const chunksRemaining = totalChunks - chunksUploaded;

    let uploadSpeed: number | null = null;
    let estimatedCompletion: Date | null = null;

    if (this.uploadedChunks.length >= 2) {
      const firstChunk = this.uploadedChunks[0];
      const lastChunk = this.uploadedChunks[this.uploadedChunks.length - 1];
      const timeDiff = lastChunk.uploadedAt.getTime() - firstChunk.uploadedAt.getTime();

      if (timeDiff > 0) {
        const bytesUploaded = this.uploadedChunks.reduce((total, chunk) => total + chunk.chunkSize, 0);
        uploadSpeed = bytesUploaded / (timeDiff / 1000); // bytes per second

        const remainingBytes = this.totalSize - bytesUploaded;
        const remainingSeconds = remainingBytes / uploadSpeed;
        estimatedCompletion = new Date(Date.now() + remainingSeconds * 1000);
      }
    }

    return {
      chunksUploaded,
      chunksRemaining,
      uploadSpeed,
      estimatedCompletion,
    };
  }
}
