/**
 * Entry Images Use Cases
 * Add, remove, reorder, and get images for entries (max 4 per entry)
 */

import { IIntelligenceRepository } from '@domains/intelligence';
import { EntryImage } from '@infrastructure/database/schemas/profile-schema';
import { getLogger } from '@config/service-urls';
import { LibraryError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('entry-images-use-case');

const MAX_IMAGES_PER_ENTRY = 4;

export interface AddEntryImageRequest {
  entryId: string;
  userId: string;
  url: string;
}

export interface AddEntryImageResponse {
  image: EntryImage;
  images: EntryImage[];
  message: string;
}

export class AddEntryImageUseCase {
  constructor(private intelligenceRepository: IIntelligenceRepository) {}

  async execute(request: AddEntryImageRequest): Promise<AddEntryImageResponse> {
    try {
      if (!request.entryId?.trim()) {
        throw LibraryError.validationError('entryId', 'Entry ID is required');
      }
      if (!request.url?.trim()) {
        throw LibraryError.validationError('url', 'Image URL is required');
      }

      const entry = await this.intelligenceRepository.findEntryById(request.entryId);
      if (!entry) {
        throw LibraryError.entryNotFound(request.entryId);
      }
      if (entry.userId !== request.userId) {
        throw LibraryError.ownershipRequired('entry');
      }

      const existingIllustrations = await this.intelligenceRepository.findEntryIllustrations(request.entryId);
      if (existingIllustrations.length >= MAX_IMAGES_PER_ENTRY) {
        throw LibraryError.maxImagesExceeded(MAX_IMAGES_PER_ENTRY);
      }

      const illustration = await this.intelligenceRepository.addEntryIllustration(request.entryId, request.url);
      const allIllustrations = await this.intelligenceRepository.findEntryIllustrations(request.entryId);

      logger.info('Illustration added to entry', { entryId: request.entryId, illustrationId: illustration.id });

      return {
        image: illustration,
        images: allIllustrations,
        message: 'Illustration added successfully',
      };
    } catch (error) {
      logger.error('Failed to add entry image', { error: serializeError(error) });
      throw error;
    }
  }
}

export interface RemoveEntryImageRequest {
  imageId: string;
  entryId: string;
  userId: string;
}

export interface RemoveEntryImageResponse {
  images: EntryImage[];
  message: string;
}

export class RemoveEntryImageUseCase {
  constructor(private intelligenceRepository: IIntelligenceRepository) {}

  async execute(request: RemoveEntryImageRequest): Promise<RemoveEntryImageResponse> {
    try {
      if (!request.imageId?.trim()) {
        throw LibraryError.validationError('imageId', 'Image ID is required');
      }

      const entry = await this.intelligenceRepository.findEntryById(request.entryId);
      if (!entry) {
        throw LibraryError.entryNotFound(request.entryId);
      }
      if (entry.userId !== request.userId) {
        throw LibraryError.ownershipRequired('entry');
      }

      await this.intelligenceRepository.removeEntryIllustration(request.imageId);
      const remainingImages = await this.intelligenceRepository.findEntryIllustrations(request.entryId);

      logger.info('Image removed from entry', { entryId: request.entryId, imageId: request.imageId });

      return {
        images: remainingImages,
        message: 'Image removed successfully',
      };
    } catch (error) {
      logger.error('Failed to remove entry image', { error: serializeError(error) });
      throw error;
    }
  }
}

export interface GetEntryImagesRequest {
  entryId: string;
  userId: string;
}

export interface GetEntryImagesResponse {
  images: EntryImage[];
  count: number;
  maxAllowed: number;
}

export class GetEntryImagesUseCase {
  constructor(private intelligenceRepository: IIntelligenceRepository) {}

  async execute(request: GetEntryImagesRequest): Promise<GetEntryImagesResponse> {
    try {
      if (!request.entryId?.trim()) {
        throw LibraryError.validationError('entryId', 'Entry ID is required');
      }

      const entry = await this.intelligenceRepository.findEntryById(request.entryId);
      if (!entry) {
        throw LibraryError.entryNotFound(request.entryId);
      }
      if (entry.userId !== request.userId) {
        throw LibraryError.ownershipRequired('entry');
      }

      const images = await this.intelligenceRepository.findEntryIllustrations(request.entryId);

      return {
        images,
        count: images.length,
        maxAllowed: MAX_IMAGES_PER_ENTRY,
      };
    } catch (error) {
      logger.error('Failed to get entry images', { error: serializeError(error) });
      throw error;
    }
  }
}

export interface ReorderEntryImagesRequest {
  entryId: string;
  userId: string;
  imageIds: string[];
}

export interface ReorderEntryImagesResponse {
  images: EntryImage[];
  message: string;
}

export class ReorderEntryImagesUseCase {
  constructor(private intelligenceRepository: IIntelligenceRepository) {}

  async execute(request: ReorderEntryImagesRequest): Promise<ReorderEntryImagesResponse> {
    try {
      if (!request.entryId?.trim()) {
        throw LibraryError.validationError('entryId', 'Entry ID is required');
      }
      if (!request.imageIds?.length) {
        throw LibraryError.validationError('imageIds', 'Image IDs are required');
      }

      const entry = await this.intelligenceRepository.findEntryById(request.entryId);
      if (!entry) {
        throw LibraryError.entryNotFound(request.entryId);
      }
      if (entry.userId !== request.userId) {
        throw LibraryError.ownershipRequired('entry');
      }

      const images = await this.intelligenceRepository.reorderEntryIllustrations(request.entryId, request.imageIds);

      logger.info('Entry images reordered', { entryId: request.entryId, count: images.length });

      return {
        images,
        message: 'Images reordered successfully',
      };
    } catch (error) {
      logger.error('Failed to reorder entry images', {
        error: serializeError(error),
      });
      throw error;
    }
  }
}
