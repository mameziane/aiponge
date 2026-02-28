/**
 * Music Catalog Application Service
 * Orchestrates music catalog operations for albums
 *
 * Note: Track operations are handled by unified generation services:
 * - TrackGenerationService (with targetVisibility parameter)
 * - AlbumGenerationService (with targetVisibility parameter)
 *
 */

import { CreateAlbumUseCase, CreateAlbumRequest, CreateAlbumResponse } from '../use-cases';
import { UnifiedAlbumRepository } from '../../infrastructure/database/UnifiedAlbumRepository';
import { DrizzleMusicCatalogRepository } from '../../infrastructure/database/DrizzleMusicCatalogRepository';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { MusicError, MusicErrorCode } from '../errors';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('music-service-musiccatalogapplicationservice');

export class MusicCatalogApplicationService {
  private createAlbumUseCase: CreateAlbumUseCase;
  private catalogRepository: DrizzleMusicCatalogRepository;

  constructor(private albumRepository: UnifiedAlbumRepository) {
    this.createAlbumUseCase = new CreateAlbumUseCase(albumRepository);
    this.catalogRepository = new DrizzleMusicCatalogRepository(getDatabase('write'), getDatabase('read'));
  }

  // Album Operations
  async createAlbum(request: CreateAlbumRequest): Promise<CreateAlbumResponse> {
    try {
      return await this.createAlbumUseCase.execute(request);
    } catch (error) {
      logger.error('Create album service error:', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // Statistics Operations
  async getCatalogStats(): Promise<{
    totalTracks: number;
    totalAlbums: number;
  }> {
    try {
      const stats = await this.catalogRepository.getCatalogStats();
      return {
        totalTracks: stats.totalTracks,
        totalAlbums: stats.totalAlbums,
      };
    } catch (error) {
      logger.error('Get catalog stats service error:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new MusicError('Failed to retrieve catalog statistics', 500, MusicErrorCode.INTERNAL_ERROR);
    }
  }
}
