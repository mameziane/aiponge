/**
 * Image Processing Service
 * Handles image optimization, resizing, and format conversion using sharp
 */

import sharp from 'sharp';
import { createLogger } from '@aiponge/platform-core';

const logger = createLogger('image-processing-service');

export interface ProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  generateThumbnail?: boolean;
  thumbnailSize?: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
}

export interface ProcessingResult {
  main: ProcessedImage;
  thumbnail?: ProcessedImage;
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  maxWidth: 512,
  maxHeight: 512,
  quality: 80,
  format: 'webp',
  generateThumbnail: true,
  thumbnailSize: 128,
};

export class ImageProcessingService {
  private static instance: ImageProcessingService;

  static getInstance(): ImageProcessingService {
    if (!ImageProcessingService.instance) {
      ImageProcessingService.instance = new ImageProcessingService();
    }
    return ImageProcessingService.instance;
  }

  /**
   * Check if a content type is a processable image
   */
  isProcessableImage(contentType?: string): boolean {
    if (!contentType) return false;
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType);
  }

  /**
   * Process an image: resize, convert to WebP, and optionally generate thumbnail
   */
  async processImage(buffer: Buffer, options: ProcessingOptions = {}): Promise<ProcessingResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const originalSize = buffer.length;

    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      logger.debug('Processing image', {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        originalFormat: metadata.format,
        originalSize,
      });

      // Process main image
      const main = await this.processMainImage(buffer, metadata, opts);

      // Generate thumbnail if requested
      let thumbnail: ProcessedImage | undefined;
      if (opts.generateThumbnail) {
        thumbnail = await this.generateThumbnail(buffer, opts.thumbnailSize!, opts.quality!);
      }

      logger.info('Image processed successfully', {
        originalSize,
        processedSize: main.processedSize,
        compressionRatio: main.compressionRatio.toFixed(2),
        savedBytes: originalSize - main.processedSize,
        hasThumbnail: !!thumbnail,
      });

      return { main, thumbnail };
    } catch (error) {
      logger.error('Failed to process image', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async processMainImage(
    buffer: Buffer,
    metadata: sharp.Metadata,
    opts: ProcessingOptions
  ): Promise<ProcessedImage> {
    const originalSize = buffer.length;
    let pipeline = sharp(buffer);

    // Resize if larger than max dimensions
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (width > opts.maxWidth! || height > opts.maxHeight!) {
      pipeline = pipeline.resize(opts.maxWidth, opts.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to target format
    switch (opts.format) {
      case 'webp':
        pipeline = pipeline.webp({ quality: opts.quality });
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: opts.quality, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
    }

    const processedBuffer = await pipeline.toBuffer();
    const processedMetadata = await sharp(processedBuffer).metadata();

    return {
      buffer: processedBuffer,
      width: processedMetadata.width || opts.maxWidth!,
      height: processedMetadata.height || opts.maxHeight!,
      format: opts.format!,
      originalSize,
      processedSize: processedBuffer.length,
      compressionRatio: originalSize / processedBuffer.length,
    };
  }

  private async generateThumbnail(buffer: Buffer, size: number, quality: number): Promise<ProcessedImage> {
    const originalSize = buffer.length;

    const thumbnailBuffer = await sharp(buffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality })
      .toBuffer();

    const metadata = await sharp(thumbnailBuffer).metadata();

    return {
      buffer: thumbnailBuffer,
      width: metadata.width || size,
      height: metadata.height || size,
      format: 'webp',
      originalSize,
      processedSize: thumbnailBuffer.length,
      compressionRatio: originalSize / thumbnailBuffer.length,
    };
  }

  /**
   * Batch process multiple images (for migration/backfill)
   */
  async batchProcess(
    files: Array<{ path: string; buffer: Buffer }>,
    options: ProcessingOptions = {}
  ): Promise<Map<string, ProcessingResult>> {
    const results = new Map<string, ProcessingResult>();

    for (const file of files) {
      try {
        const result = await this.processImage(file.buffer, options);
        results.set(file.path, result);
      } catch (error) {
        logger.warn('Failed to process file in batch', {
          path: file.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}
