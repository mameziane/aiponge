/**
 * Create Album Use Case
 * Handles the business logic for creating new albums
 */

import { UnifiedAlbumRepository, type AlbumEntity } from '@infrastructure/database/UnifiedAlbumRepository';
import { MusicError, MusicErrorCode } from '../../errors';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '@config/service-urls';
import { ALBUM_LIFECYCLE, type AlbumLifecycleStatus } from '@aiponge/shared-contracts';

const logger = getLogger('create-album-use-case');

export interface CreateAlbumRequest {
  title: string;
  userId: string;
  displayName: string;
  genre: string[];
  releaseDate?: Date;
  totalDuration?: number;
  trackCount?: number;
  artworkUrl?: string;
  recordLabel?: string;
  catalogNumber?: string;
  isCompilation?: boolean;
}

export interface CreateAlbumResponse {
  albumId: string;
  status: AlbumLifecycleStatus;
  message: string;
}

export class CreateAlbumUseCase {
  constructor(private albumRepository: UnifiedAlbumRepository) {}

  async execute(request: CreateAlbumRequest): Promise<CreateAlbumResponse> {
    try {
      // Validate the request
      if (!request.title?.trim()) {
        throw new MusicError('Album title is required', 400, MusicErrorCode.MISSING_TITLE);
      }
      if (!request.userId?.trim()) {
        throw new MusicError('User ID is required', 400, MusicErrorCode.VALIDATION_ERROR);
      }
      if (!request.displayName?.trim()) {
        throw new MusicError('Display name is required', 400, MusicErrorCode.VALIDATION_ERROR);
      }
      if (!request.genre || request.genre.length === 0) {
        throw new MusicError('At least one genre is required', 400, MusicErrorCode.VALIDATION_ERROR);
      }

      // Validate release date if provided
      if (request.releaseDate && request.releaseDate > new Date()) {
        throw new MusicError('Release date cannot be in the future', 400, MusicErrorCode.VALIDATION_ERROR);
      }

      // Validate track count if provided
      if (request.trackCount !== undefined && request.trackCount <= 0) {
        throw new MusicError('Track count must be positive', 400, MusicErrorCode.VALIDATION_ERROR);
      }

      // Create album entity
      const albumEntity: AlbumEntity = {
        id: uuidv4(),
        title: request.title.trim(),
        userId: request.userId, // Albums now use userId directly
        displayName: request.displayName.trim(), // Display name stored for UI
        genre: request.genre,
        releaseDate: request.releaseDate,
        totalDuration: request.totalDuration,
        trackCount: request.trackCount,
        artworkUrl: request.artworkUrl?.trim(),
        recordLabel: request.recordLabel?.trim(),
        catalogNumber: request.catalogNumber?.trim(),
        isCompilation: request.isCompilation || false,
        status: ALBUM_LIFECYCLE.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save album using repository
      const savedAlbum = await this.albumRepository.create(albumEntity);

      return {
        albumId: savedAlbum.id,
        status: savedAlbum.status,
        message: 'Album created successfully',
      };
    } catch (error) {
      if (error instanceof MusicError) {
        throw error;
      }
      logger.error('Create album failed', {
        module: 'create_album_use_case',
        operation: 'execute',
        title: request.title,
        userId: request.userId,
        error: error instanceof Error ? error.message : String(error),
        phase: 'album_creation_failed',
      });
      throw new MusicError('Failed to create album', 500, MusicErrorCode.CREATION_FAILED);
    }
  }
}
