import { StorageServiceClient } from '../../infrastructure/clients/StorageServiceClient';
import { getLogger, SERVICE_URLS } from '../../config/service-urls';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const logger = getLogger('music-service-file-storage-utils');

export interface StoragePathConfig {
  userId: string;
  fileType: 'tracks' | 'artworks';
}

export interface StoredFileResult {
  success: boolean;
  fileId?: string;
  filePath?: string;
  publicUrl?: string;
  cdnUrl?: string;
  fileSize?: number;
  error?: string;
}

export class FileStorageUtils {
  constructor(private readonly storageClient: StorageServiceClient) {}

  static getStoragePath(config: StoragePathConfig): string {
    return `user/${config.userId}/${config.fileType}`;
  }

  async downloadAndStoreAudio(
    externalUrl: string,
    config: StoragePathConfig,
    taskId: string
  ): Promise<StoredFileResult> {
    const destinationPath = FileStorageUtils.getStoragePath(config);

    const audioTaskId = `${taskId}-audio`;
    logger.info('Downloading and storing audio', {
      externalUrl: externalUrl.substring(0, 50) + '...',
      destinationPath,
      taskId,
      audioTaskId,
    });

    try {
      const result = await this.storageClient.downloadFromExternalUrl({
        taskId: audioTaskId,
        externalUrl,
        destinationPath,
        metadata: {
          originalUrl: externalUrl,
          fileType: config.fileType,
          type: 'audio',
        },
      });

      if (result.success && result.filePath) {
        logger.info('Audio stored successfully', {
          filePath: result.filePath,
          fileId: result.fileId,
          fileSize: result.size,
        });
        return {
          success: true,
          fileId: result.fileId,
          filePath: result.filePath,
          publicUrl: result.filePath,
          fileSize: result.size,
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to store audio file',
      };
    } catch (error) {
      logger.error('Error storing audio file', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error',
      };
    }
  }

  async downloadAndStoreArtwork(
    externalUrl: string,
    config: StoragePathConfig,
    taskId: string
  ): Promise<StoredFileResult> {
    const destinationPath = FileStorageUtils.getStoragePath({
      ...config,
      fileType: 'artworks',
    });

    const artworkTaskId = `${taskId}-artwork`;
    logger.info('Downloading and storing artwork', {
      externalUrl: externalUrl.substring(0, 50) + '...',
      destinationPath,
      taskId,
      artworkTaskId,
    });

    try {
      const result = await this.storageClient.downloadFromExternalUrl({
        taskId: artworkTaskId,
        externalUrl,
        destinationPath,
        metadata: {
          originalUrl: externalUrl,
          fileType: 'artworks',
          type: 'artwork',
        },
      });

      if (result.success && result.filePath) {
        logger.info('Artwork stored successfully', {
          filePath: result.filePath,
          fileId: result.fileId,
        });
        return {
          success: true,
          fileId: result.fileId,
          filePath: result.filePath,
          publicUrl: result.filePath,
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to store artwork file',
      };
    } catch (error) {
      logger.error('Error storing artwork file', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error',
      };
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    contentType: string,
    config: StoragePathConfig
  ): Promise<StoredFileResult> {
    const destinationPath = FileStorageUtils.getStoragePath(config);

    logger.info('Uploading buffer to storage', {
      fileName,
      contentType,
      destinationPath,
      bufferSize: buffer.length,
    });

    try {
      const result = await this.storageClient.uploadAudio(
        {
          fileName,
          contentType,
          fileSize: buffer.length,
          folder: destinationPath,
          isPublic: false,
          metadata: {
            fileType: config.fileType,
          },
        },
        buffer
      );

      if (result.success && result.publicUrl) {
        return {
          success: true,
          fileId: result.fileId,
          filePath: result.fileId,
          publicUrl: result.publicUrl,
          cdnUrl: result.cdnUrl,
          fileSize: buffer.length,
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to upload buffer',
      };
    } catch (error) {
      logger.error('Error uploading buffer', {
        error: error instanceof Error ? error.message : String(error),
        fileName,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error',
      };
    }
  }

  /**
   * Extract audio duration from an audio URL using ffprobe
   * @param audioUrl URL of the audio file (can be relative path or full URL)
   * @param baseUrl Optional base URL to prepend to relative paths (e.g., storage service URL)
   * @returns Duration in seconds, or 0 if extraction fails
   */
  static async extractAudioDuration(audioUrl: string, baseUrl?: string): Promise<number> {
    if (!audioUrl) {
      logger.warn('No audio URL provided for duration extraction');
      return 0;
    }

    try {
      // Convert relative paths to full URLs if baseUrl is provided
      let resolvedUrl = audioUrl;
      if (audioUrl.startsWith('/') && baseUrl) {
        resolvedUrl = `${baseUrl.replace(/\/$/, '')}${audioUrl}`;
      } else if (audioUrl.startsWith('/') && !baseUrl) {
        // For relative paths without baseUrl, use SERVICE_URLS.storageService
        const storageUrl = SERVICE_URLS.storageService;
        if (storageUrl) {
          resolvedUrl = `${storageUrl.replace(/\/$/, '')}${audioUrl}`;
        } else {
          logger.warn('Cannot resolve relative URL without storage service URL', {
            audioUrl: audioUrl.substring(0, 50) + '...',
          });
          return 0;
        }
      }

      // Use execFile with arguments array to avoid shell injection
      const { stdout } = await execFileAsync(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_format', resolvedUrl],
        { timeout: 30000 }
      );

      const data = JSON.parse(stdout);
      const durationStr = data.format?.duration;

      if (durationStr) {
        const duration = Math.round(parseFloat(durationStr));
        logger.info('Audio duration extracted', {
          resolvedUrl: resolvedUrl.substring(0, 50) + '...',
          duration,
        });
        return duration;
      }

      logger.warn('No duration found in ffprobe output', {
        resolvedUrl: resolvedUrl.substring(0, 50) + '...',
      });
      return 0;
    } catch (error) {
      // Handle ffprobe not installed or other execution errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        logger.warn('ffprobe not available, duration extraction skipped');
      } else {
        logger.warn('Failed to extract audio duration', {
          error: errorMessage,
          audioUrl: audioUrl.substring(0, 50) + '...',
        });
      }
      return 0;
    }
  }
}
