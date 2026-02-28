import type { Readable } from 'stream';

export interface StorageUploadRequest {
  fileName: string;
  contentType: string;
  fileSize?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  folder?: string;
  isPublic?: boolean;
  expiresAt?: Date;
}

export interface StorageUploadResponse {
  success: boolean;
  fileId?: string;
  uploadUrl?: string;
  publicUrl?: string;
  cdnUrl?: string;
  error?: string;
}

export interface StorageDownloadRequest {
  fileId: string;
  expiresIn?: number;
  disposition?: 'inline' | 'attachment';
}

export interface StorageDownloadResponse {
  success: boolean;
  downloadUrl?: string;
  expiresAt?: Date;
  error?: string;
}

export interface FileMetadata {
  fileId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  folder?: string;
  isPublic: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  uploadedAt: Date;
  lastAccessed?: Date;
  downloadCount: number;
  cdnUrl?: string;
  publicUrl?: string;
}

export interface IStorageServiceClient {
  uploadAudio(request: StorageUploadRequest, fileData?: Buffer | Readable): Promise<StorageUploadResponse>;

  downloadFromExternalUrl(params: {
    taskId: string;
    externalUrl: string;
    metadata?: Record<string, unknown>;
    destinationPath?: string;
  }): Promise<{
    success: boolean;
    filePath?: string;
    localPath?: string;
    size?: number;
    format?: string;
    fileId?: string;
    error?: string;
  }>;

  getDownloadUrl(request: StorageDownloadRequest): Promise<StorageDownloadResponse>;

  getStreamingUrl(
    fileId: string,
    options?: { quality?: string; expiresIn?: number }
  ): Promise<{
    success: boolean;
    streamUrl?: string;
    cdnUrl?: string;
    expiresAt?: Date;
    error?: string;
  }>;

  getFileMetadata(fileId: string): Promise<{
    success: boolean;
    metadata?: FileMetadata;
    error?: string;
  }>;

  updateFileMetadata(
    fileId: string,
    updates: Partial<Pick<FileMetadata, 'tags' | 'metadata' | 'isPublic'>>
  ): Promise<{ success: boolean; error?: string }>;

  deleteFile(fileId: string): Promise<{ success: boolean; error?: string }>;

  listFiles(options?: {
    folder?: string;
    tags?: string[];
    contentType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    files?: FileMetadata[];
    total?: number;
    error?: string;
  }>;

  getStorageStats(): Promise<{
    success: boolean;
    stats?: import('../../../infrastructure/clients/StorageServiceClient').StorageStats;
    error?: string;
  }>;

  cleanupExpiredFiles(): Promise<{
    success: boolean;
    deletedCount?: number;
    error?: string;
  }>;

  isHealthy(): Promise<boolean>;
}
