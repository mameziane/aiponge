/**
 * Download External File Use Case
 * Handles downloading files from external URLs (like MusicAPI.ai) and saving to local storage
 */

import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { StorageError } from '../errors';
import { FileEntity } from '../../domains/entities/FileEntity';
import { createHttpClient } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

// Artwork compression settings
const ARTWORK_TARGET_SIZE = 512; // Resize to 512x512
const ARTWORK_JPEG_QUALITY = 85; // JPEG quality (0-100)

const logger = getLogger('storage-service-downloadexternalfileusecase');

export interface DownloadExternalFileRequest {
  taskId: string;
  externalUrl: string;
  metadata?: {
    culturalStyle?: string;
    content?: string;
    framework?: string;
    userId?: string;
    [key: string]: unknown;
  };
  destinationPath?: string;
}

export interface DownloadExternalFileResponse {
  success: boolean;
  filePath: string;
  localPath: string;
  size: number;
  format: string;
  fileId?: string;
}

export class DownloadExternalFileUseCase {
  private httpClient = createHttpClient({
    timeout: 60000,
    retries: 3,
    serviceName: 'storage-service',
  });

  constructor(
    private _storageProvider: IStorageProvider,
    private _repository: IStorageRepository
  ) {}

  async execute(request: DownloadExternalFileRequest): Promise<DownloadExternalFileResponse> {
    try {
      logger.warn('📥 [STORAGE STEP 1/5] Starting external file download', {
        taskId: request.taskId,
        externalUrl: request.externalUrl.substring(0, 100) + '...',
        destinationPath: request.destinationPath,
        metadataType: request.metadata?.type,
      });

      let fileData: Buffer;
      let contentType = 'application/octet-stream';
      let fileExtension = 'bin';

      if (request.externalUrl) {
        // Check if URL is a base64 data URL (from providers like Stable Diffusion)
        const isDataUrl = request.externalUrl.startsWith('data:');

        if (isDataUrl) {
          // Handle data: URL format - data:image/png;base64,<base64data>
          logger.warn('📄 [STORAGE STEP 2/5] Processing base64 data URL', {
            taskId: request.taskId,
            urlPrefix: request.externalUrl.substring(0, 50) + '...',
          });

          const dataUrlMatch = request.externalUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!dataUrlMatch) {
            throw StorageError.invalidRequest('Invalid data URL format - expected data:<mime>;base64,<data>');
          }

          contentType = dataUrlMatch[1];
          const base64Data = dataUrlMatch[2];
          fileData = Buffer.from(base64Data, 'base64');

          // Set extension based on content type
          if (contentType === 'image/png') fileExtension = 'png';
          else if (contentType === 'image/jpeg') fileExtension = 'jpg';
          else if (contentType === 'image/gif') fileExtension = 'gif';
          else if (contentType === 'image/webp') fileExtension = 'webp';

          logger.warn('✅ [STORAGE STEP 2/5] Base64 data decoded successfully', {
            taskId: request.taskId,
            decodedBytes: fileData.length,
            contentType,
            fileExtension,
          });
        } else {
          // Standard HTTP URL download
          try {
            logger.warn('🌐 [STORAGE STEP 2/5] Downloading file from external URL', {
              taskId: request.taskId,
              url: request.externalUrl.substring(0, 100) + '...',
            });

            // Download from external URL using HttpClient with binary response
            // NOTE: HttpClient.get() returns response.data directly (already unwrapped)
            const arrayBuffer = await this.httpClient.get<ArrayBuffer>(request.externalUrl, {
              responseType: 'arraybuffer',
            });

            // Convert ArrayBuffer to Buffer
            fileData = Buffer.from(arrayBuffer);

            logger.warn('✅ [STORAGE STEP 2/5] File downloaded successfully', {
              taskId: request.taskId,
              downloadedBytes: fileData.length,
            });

            // Detect file type from magic bytes (file signature) for better accuracy
            logger.warn('🔍 [STORAGE STEP 3/5] Detecting file type from magic bytes', {
              taskId: request.taskId,
              firstBytes: fileData.slice(0, 8).toString('hex'),
            });

            const magicBytes = fileData.slice(0, 8);

            // PNG: 89 50 4E 47 0D 0A 1A 0A
            if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4e && magicBytes[3] === 0x47) {
              fileExtension = 'png';
              contentType = 'image/png';
            }
            // JPEG: FF D8 FF
            else if (magicBytes[0] === 0xff && magicBytes[1] === 0xd8 && magicBytes[2] === 0xff) {
              fileExtension = 'jpg';
              contentType = 'image/jpeg';
            }
            // GIF: 47 49 46 38
            else if (
              magicBytes[0] === 0x47 &&
              magicBytes[1] === 0x49 &&
              magicBytes[2] === 0x46 &&
              magicBytes[3] === 0x38
            ) {
              fileExtension = 'gif';
              contentType = 'image/gif';
            }
            // MP3: ID3 or FF FB (MPEG frame sync)
            else if (
              (magicBytes[0] === 0x49 && magicBytes[1] === 0x44 && magicBytes[2] === 0x33) ||
              (magicBytes[0] === 0xff && (magicBytes[1] & 0xe0) === 0xe0)
            ) {
              fileExtension = 'mp3';
              contentType = 'audio/mpeg';
            }
            // RIFF-based formats (check for specific type markers)
            else if (
              magicBytes[0] === 0x52 &&
              magicBytes[1] === 0x49 &&
              magicBytes[2] === 0x46 &&
              magicBytes[3] === 0x46
            ) {
              // WAV: RIFF....WAVE (bytes 8-11 spell 'WAVE')
              const riffType = fileData.slice(8, 12).toString('ascii');
              if (riffType === 'WAVE') {
                fileExtension = 'wav';
                contentType = 'audio/wav';
              }
              // WebP: RIFF....WEBP (bytes 8-11 spell 'WEBP')
              else if (riffType === 'WEBP') {
                fileExtension = 'webp';
                contentType = 'image/webp';
              }
              // Unknown RIFF format - default to application/octet-stream
              else {
                fileExtension = 'bin';
                contentType = 'application/octet-stream';
              }
            }
            // Fallback: Try to detect from URL if magic bytes don't match
            else {
              contentType = 'application/octet-stream';

              // Audio files
              if (request.externalUrl.includes('.mp3') || contentType.includes('audio/mpeg')) {
                fileExtension = 'mp3';
                contentType = 'audio/mpeg';
              } else if (request.externalUrl.includes('.wav') || contentType.includes('audio/wav')) {
                fileExtension = 'wav';
                contentType = 'audio/wav';
              }
              // Image files - check URL patterns (for DALL-E URLs like img-xxx.png)
              else if (request.externalUrl.includes('.png') || request.externalUrl.includes('img-')) {
                fileExtension = 'png';
                contentType = 'image/png';
              } else if (request.externalUrl.includes('.jpg') || request.externalUrl.includes('.jpeg')) {
                fileExtension = 'jpg';
                contentType = 'image/jpeg';
              } else if (request.externalUrl.includes('.gif')) {
                fileExtension = 'gif';
                contentType = 'image/gif';
              } else if (request.externalUrl.includes('.webp')) {
                fileExtension = 'webp';
                contentType = 'image/webp';
              }
            }

            logger.warn('✅ [STORAGE STEP 3/5] File type detected', {
              taskId: request.taskId,
              detectedType: contentType,
              fileExtension,
              fileSize: fileData.length,
            });

            // Compress artwork images to reduce file size
            const isArtwork =
              request.destinationPath?.includes('artworks') ||
              request.metadata?.type === 'track-artwork' ||
              request.metadata?.type === 'album-artwork';
            const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(fileExtension);

            if (isArtwork && isImage) {
              const originalSize = fileData.length;
              try {
                // Resize to target size and convert to JPEG for smaller file size
                // withoutEnlargement prevents upscaling small images
                fileData = await sharp(fileData)
                  .resize(ARTWORK_TARGET_SIZE, ARTWORK_TARGET_SIZE, {
                    fit: 'cover',
                    position: 'center',
                    withoutEnlargement: true,
                  })
                  .jpeg({ quality: ARTWORK_JPEG_QUALITY })
                  .toBuffer();

                // Update extension and content type for JPEG
                fileExtension = 'jpg';
                contentType = 'image/jpeg';

                logger.info('🖼️ [STORAGE] Artwork compressed', {
                  taskId: request.taskId,
                  originalSize,
                  compressedSize: fileData.length,
                  reduction: `${Math.round((1 - fileData.length / originalSize) * 100)}%`,
                  targetSize: `${ARTWORK_TARGET_SIZE}x${ARTWORK_TARGET_SIZE}`,
                });
              } catch (compressionError) {
                logger.warn('⚠️ [STORAGE] Artwork compression failed, using original', {
                  taskId: request.taskId,
                  error: compressionError instanceof Error ? compressionError.message : String(compressionError),
                });
                // Continue with original file if compression fails
              }
            }
          } catch (downloadError) {
            const errorMessage = downloadError instanceof Error ? downloadError.message : String(downloadError);
            logger.error('❌ [STORAGE FAILED] Download from external URL failed', {
              taskId: request.taskId,
              error: errorMessage,
              stack: downloadError instanceof Error ? downloadError.stack : undefined,
            });

            // Throw error instead of silently creating a fallback JSON file
            throw StorageError.downloadFailed(`Failed to download from external URL: ${errorMessage}`);
          }
        } // End of HTTP URL else block
      } else {
        // No external URL provided - this is an error
        logger.error('❌ [STORAGE FAILED] No external URL provided', {
          taskId: request.taskId,
        });
        throw StorageError.invalidRequest('No external URL provided for download');
      }

      const fileName = this.generateFileName(request.taskId, fileExtension, request.metadata?.type as string);
      const storagePath = request.destinationPath ? `${request.destinationPath}/${fileName}` : `uploads/${fileName}`;

      logger.warn('📁 [STORAGE STEP 4/5] Preparing to save file to storage', {
        taskId: request.taskId,
        fileName,
        storagePath,
        fileSize: fileData.length,
        contentType,
      });

      // Create file metadata
      const metadata = {
        mimeType: contentType,
        contentType,
        size: fileData.length,
        originalName: fileName,
        taskId: request.taskId,
        culturalStyle: request.metadata?.culturalStyle,
        framework: request.metadata?.framework,
        content: request.metadata?.content,
        downloadSource: request.externalUrl || 'demo',
        uploadedAt: new Date(),
        uploadedBy: request.metadata?.userId || 'system',
        isPublic: false,
        tags: [] as string[],
        ...request.metadata,
      };

      // Create storage location
      // Note: storageProvider.upload() will set the correct publicUrl via getPublicUrl()
      // so we don't need to create a StorageLocation here
      const providerInfo = this._storageProvider.getProviderInfo();

      // Upload to storage provider
      const uploadMetadata: Record<string, string> = {
        contentType: metadata.contentType,
        originalName: metadata.originalName,
        taskId: metadata.taskId,
        downloadSource: metadata.downloadSource,
        size: metadata.size.toString(),
        uploadedBy: metadata.uploadedBy,
      };

      logger.warn('💾 [STORAGE STEP 5/5] Uploading file to storage provider', {
        taskId: request.taskId,
        storagePath,
        providerName: providerInfo.name,
      });

      const uploadResult = await this._storageProvider.upload(fileData, storagePath, {
        contentType,
        metadata: uploadMetadata,
      });

      if (!uploadResult.success || !uploadResult.location) {
        logger.error('❌ [STORAGE FAILED] Storage provider upload failed', {
          taskId: request.taskId,
          error: uploadResult.error,
          storagePath,
        });
        throw StorageError.uploadFailed(`Failed to save file: ${uploadResult.error}`);
      }

      logger.warn('✅ [STORAGE STEP 5/5] File uploaded to storage provider', {
        taskId: request.taskId,
        publicUrl: uploadResult.publicUrl,
        location: uploadResult.location,
      });

      // Use the StorageLocation from upload result (includes correct publicUrl)
      const storageLocation = uploadResult.location;

      // Create file entity and save to repository
      const fileLocation = {
        bucket: storageLocation.bucket || 'default',
        key: storageLocation.path,
        provider: 'local' as const,
        publicUrl: storageLocation.publicUrl,
      };

      // Extract userId from metadata or from destinationPath (e.g., "user/{userId}/tracks")
      let extractedUserId = request.metadata?.userId as string | undefined;
      if (!extractedUserId && request.destinationPath?.startsWith('user/')) {
        // Extract userId from path like "user/{userId}/tracks"
        const pathParts = request.destinationPath.split('/');
        if (pathParts.length >= 2 && pathParts[1]) {
          extractedUserId = pathParts[1];
          logger.debug('Extracted userId from destinationPath', {
            userId: extractedUserId,
            destinationPath: request.destinationPath,
          });
        }
      }

      const fileMetadata = {
        size: fileData.length,
        mimeType: contentType,
        uploadedAt: new Date(),
        uploadedBy: extractedUserId || 'system',
        isPublic: false,
        userId: extractedUserId, // GDPR compliance: Set userId for user file deletion
      };

      // Generate a proper UUID for the file entity (stg_files.id is UUID type)
      // The taskId is stored in metadata for traceability
      const fileId = randomUUID();

      const fileEntity = new FileEntity(fileId, fileName, fileLocation, fileMetadata, new Date(), new Date());

      await this._repository.save(fileEntity);

      logger.warn('✅ [STORAGE COMPLETE] File saved to repository and storage', {
        taskId: request.taskId,
        fileName,
        fileSize: fileData.length,
        publicUrl: storageLocation.publicUrl,
        localPath: storagePath,
        fileId: fileEntity.id,
      });

      return {
        success: true,
        filePath: storageLocation.publicUrl!, // publicUrl from LocalStorageProvider.upload() includes /uploads/ prefix
        localPath: storagePath,
        size: fileData.length,
        format: fileExtension,
        fileId: fileEntity.id,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      logger.error('Unexpected error:', { error: error instanceof Error ? error.message : String(error) });
      throw StorageError.downloadFailed(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Generate standardized filename with category prefix
   * Format: {category-prefix}_{timestamp}_{uuid-short}.{ext}
   * Examples: track-art_1765909288701_7e79e21f.png, track_1765909288701_7e79e21f.mp3
   */
  private generateFileName(taskId: string, extension: string, metadataType?: string): string {
    const timestamp = Date.now();

    // Extract short UUID from taskId if it contains one, otherwise generate new
    let shortUuid: string;
    const uuidMatch = taskId.match(/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/i);
    if (uuidMatch) {
      shortUuid = uuidMatch[0].split('-')[0];
    } else {
      // Use last 8 chars of taskId if no UUID found
      shortUuid = taskId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || timestamp.toString().slice(-8);
    }

    // Determine category prefix based on metadata type or taskId pattern
    let prefix = 'file';
    if (metadataType === 'artwork' || metadataType === 'track-artwork' || taskId.startsWith('artwork')) {
      prefix = 'track-art';
    } else if (metadataType === 'playlist-artwork' || taskId.startsWith('playlist-artwork')) {
      prefix = 'playlist-art';
    } else if (metadataType === 'track' || extension === 'mp3' || extension === 'wav') {
      prefix = 'track';
    } else if (metadataType === 'avatar') {
      prefix = 'avatar';
    }

    return `${prefix}_${timestamp}_${shortUuid}.${extension}`;
  }
}
