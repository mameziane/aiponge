/**
 * Upload File Use Case
 * Handles file upload operations with validation and metadata management
 */

import { randomUUID } from 'crypto';
import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { FileEntity, FileMetadata, FileLocation } from '../../domains/entities/FileEntity';
import { StorageLocation } from '../../domains/value-objects/StorageLocation';
import { StorageError, StorageErrorCode } from '../errors';
import { StorageEventPublisher } from '../../infrastructure/events/StorageEventPublisher';
import { ImageProcessingService } from '../../infrastructure/services/ImageProcessingService';
import { createLogger, getAuditService, getCorrelationContext } from '@aiponge/platform-core';
import sharp from 'sharp';

const logger = createLogger('upload-file-use-case');

export type UploadCategory = 'avatar' | 'track' | 'track-artwork' | 'playlist-artwork' | 'entry' | 'general';

export interface UploadFileRequest {
  file: Buffer;
  originalName: string;
  contentType?: string;
  userId?: string;
  isPublic?: boolean;
  tags?: string[];
  expiresIn?: number; // seconds
  category?: UploadCategory;
}

export interface UploadFileResponse {
  fileId: string;
  publicUrl?: string;
  storageLocation: StorageLocation;
}

export class UploadFileUseCase {
  constructor(
    private storageProvider: IStorageProvider,
    private repository: IStorageRepository
  ) {}

  async execute(request: UploadFileRequest): Promise<UploadFileResponse> {
    try {
      // Validate input
      this.validateRequest(request);

      // Generate unique file path using category-based folder structure
      const fileId = this.generateFileId(request.category);

      // Process image if applicable (resize, convert to WebP, generate thumbnail)
      const imageProcessor = ImageProcessingService.getInstance();
      let fileBuffer = request.file;
      let contentType = request.contentType;
      let thumbnailBuffer: Buffer | undefined;
      let originalName = request.originalName;

      // Check if image is processable by extension OR content type
      const isProcessableByExtension = /\.(png|jpg|jpeg|gif)$/i.test(originalName);
      const isProcessableByMime = imageProcessor.isProcessableImage(contentType);

      if (isProcessableByExtension || isProcessableByMime) {
        try {
          // Validate buffer is actually an image using sharp before processing
          const metadata = await sharp(request.file).metadata();

          // Only process if it's actually an image format we support
          if (!metadata.format || !['png', 'jpeg', 'gif', 'webp'].includes(metadata.format)) {
            logger.warn('File has image extension but is not a valid image', {
              originalName,
              detectedFormat: metadata.format,
            });
            // Skip processing, upload as-is
          } else if (metadata.format === 'webp') {
            // Already WebP, skip processing
            logger.debug('Image already in WebP format, skipping optimization');
          } else {
            // Process the image
            const processingResult = await imageProcessor.processImage(request.file, {
              maxWidth: 512,
              maxHeight: 512,
              quality: 80,
              format: 'webp',
              generateThumbnail: true,
              thumbnailSize: 128,
            });

            fileBuffer = processingResult.main.buffer;
            contentType = 'image/webp';
            originalName = originalName.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp');
            thumbnailBuffer = processingResult.thumbnail?.buffer;

            logger.info('Image optimized during upload', {
              originalSize: request.file.length,
              processedSize: fileBuffer.length,
              savings: `${((1 - fileBuffer.length / request.file.length) * 100).toFixed(1)}%`,
            });
          }
        } catch (processingError) {
          logger.warn('Image processing failed, uploading original', {
            error: processingError instanceof Error ? processingError.message : String(processingError),
          });
        }
      }

      // Ensure contentType is never undefined
      if (!contentType) {
        contentType = 'application/octet-stream';
      }

      const filePath = this.generateFilePath(fileId, originalName, request.category, request.userId);

      // Upload to storage provider
      const uploadResult = await this.storageProvider.upload(fileBuffer, filePath, {
        contentType,
        isPublic: request.isPublic,
        metadata: {
          originalName,
          userId: request.userId || '',
          uploadedAt: new Date().toISOString(),
        },
      });

      // Upload and register thumbnail if generated
      if (thumbnailBuffer) {
        const thumbnailName = originalName.replace(/\.webp$/, '_thumb.webp');
        const thumbnailPath = filePath.replace(/\.webp$/, '_thumb.webp');
        const thumbnailId = `${fileId}_thumb`;
        try {
          const thumbnailResult = await this.storageProvider.upload(thumbnailBuffer, thumbnailPath, {
            contentType: 'image/webp',
            isPublic: request.isPublic,
            metadata: {
              originalName: thumbnailName,
              userId: request.userId || '',
              uploadedAt: new Date().toISOString(),
              isThumbnail: 'true',
              parentFileId: fileId,
            },
          });

          // Register thumbnail in repository for GDPR compliance
          if (thumbnailResult.success) {
            const thumbLocation =
              thumbnailResult.location ||
              new StorageLocation(
                this.storageProvider.getProviderInfo().name,
                thumbnailPath,
                thumbnailResult.publicUrl
              );

            const thumbFileLocation: FileLocation = {
              bucket: thumbLocation.bucket || 'default',
              key: thumbLocation.path,
              provider: thumbLocation.provider as 'local' | 'aws' | 'gcp' | 'azure',
              path: thumbLocation.path,
              publicUrl: thumbLocation.publicUrl,
              metadata: { ...thumbLocation.metadata, isThumbnail: true, parentFileId: fileId },
            };

            const thumbMetadata: FileMetadata = {
              mimeType: 'image/webp',
              size: thumbnailBuffer.length,
              uploadedAt: new Date(),
              uploadedBy: request.userId || 'unknown',
              isPublic: request.isPublic || false,
              userId: request.userId,
              tags: ['thumbnail'],
            };

            const thumbnailEntity = FileEntity.create(thumbnailId, thumbnailName, thumbFileLocation, thumbMetadata);
            await this.repository.save(thumbnailEntity);
            logger.debug('Thumbnail uploaded and registered', { thumbnailPath, thumbnailId });
          }
        } catch (thumbnailError) {
          logger.warn('Failed to upload/register thumbnail', {
            error: thumbnailError instanceof Error ? thumbnailError.message : String(thumbnailError),
          });
        }
      }

      if (!uploadResult.success) {
        throw new StorageError(`Failed to upload file: ${uploadResult.error}`, 500, StorageErrorCode.UPLOAD_FAILED);
      }

      // Create file entity
      const storageLocation =
        uploadResult.location ||
        new StorageLocation(this.storageProvider.getProviderInfo().name, filePath, uploadResult.publicUrl);

      const fileLocation: FileLocation = {
        bucket: storageLocation.bucket || 'default',
        key: storageLocation.path,
        provider: storageLocation.provider as 'local' | 'aws' | 'gcp' | 'azure',
        path: storageLocation.path,
        publicUrl: storageLocation.publicUrl,
        metadata: storageLocation.metadata,
      };

      const fileMetadata: FileMetadata = {
        mimeType: contentType,
        size: fileBuffer.length,
        uploadedAt: new Date(),
        uploadedBy: request.userId || 'unknown',
        isPublic: request.isPublic || false,
        userId: request.userId,
        tags: request.tags,
        expiresAt: request.expiresIn ? new Date(Date.now() + request.expiresIn * 1000) : undefined,
      };

      const fileEntity = FileEntity.create(fileId, originalName, fileLocation, fileMetadata);

      // Save to repository
      await this.repository.save(fileEntity);

      // Publish event (fire-and-forget, non-blocking)
      const assetType = this.getAssetType(contentType);
      StorageEventPublisher.assetUploaded(
        fileId,
        request.userId || 'unknown',
        assetType,
        filePath,
        fileBuffer.length,
        contentType || 'application/octet-stream',
        undefined,
        { originalName, category: request.category }
      );

      getAuditService().log({
        userId: request.userId,
        targetType: 'file',
        targetId: fileId,
        action: 'create',
        metadata: { contentType, size: fileBuffer.length },
        serviceName: 'storage-service',
        correlationId: getCorrelationContext()?.correlationId,
      });

      return {
        fileId,
        publicUrl: uploadResult.publicUrl,
        storageLocation,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Unexpected error during file upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        StorageErrorCode.UPLOAD_ERROR
      );
    }
  }

  private validateRequest(request: UploadFileRequest): void {
    if (!request.file || request.file.length === 0) {
      throw new StorageError('File data is required', 400, StorageErrorCode.INVALID_FILE);
    }

    if (!request.originalName || request.originalName.trim().length === 0) {
      throw new StorageError('Original filename is required', 400, StorageErrorCode.INVALID_FILENAME);
    }

    // Check file size limits (100MB default)
    const maxSize = 100 * 1024 * 1024;
    if (request.file.length > maxSize) {
      throw new StorageError(
        `File size exceeds maximum limit of ${maxSize} bytes`,
        413,
        StorageErrorCode.FILE_TOO_LARGE
      );
    }

    // Validate filename - allow common characters including spaces, parentheses, unicode letters
    // Reject only dangerous characters: control chars, path separators, null bytes
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f<>:"|?*/\\]/.test(request.originalName)) {
      throw new StorageError('Filename contains invalid characters', 400, StorageErrorCode.INVALID_FILENAME);
    }
  }

  /**
   * Generate a unique file ID as a valid UUID
   * The category is stored in metadata, not in the ID itself
   */
  private generateFileId(_category?: UploadCategory): string {
    return randomUUID();
  }

  /**
   * Get category prefix for filename
   */
  private getCategoryPrefix(category?: UploadCategory): string {
    switch (category) {
      case 'avatar':
        return 'avatar';
      case 'track':
        return 'track';
      case 'track-artwork':
        return 'track-art';
      case 'playlist-artwork':
        return 'playlist-art';
      case 'entry':
        return 'entry';
      case 'general':
      default:
        return 'file';
    }
  }

  private generateFilePath(fileId: string, originalName: string, category?: UploadCategory, userId?: string): string {
    const extension = originalName.split('.').pop() || '';
    const filename = extension ? `${fileId}.${extension}` : fileId;

    const categoryFolder = this.getCategoryFolder(category);

    if (userId) {
      return `user/${userId}/${categoryFolder}/${filename}`;
    } else {
      return `user/anonymous/${categoryFolder}/${filename}`;
    }
  }

  private getCategoryFolder(category?: UploadCategory): string {
    switch (category) {
      case 'avatar':
        return 'avatars';
      case 'track':
        return 'tracks';
      case 'track-artwork':
      case 'playlist-artwork':
        return 'artworks';
      case 'entry':
        return 'entries';
      case 'general':
      default:
        return 'general';
    }
  }

  private getAssetType(contentType?: string): 'audio' | 'image' | 'document' | 'other' {
    if (!contentType) return 'other';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('application/pdf') || contentType.startsWith('text/')) return 'document';
    return 'other';
  }
}
