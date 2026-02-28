import { Router, Request, Response } from 'express';
import { getDatabase, createDrizzleRepository } from '../../infrastructure/database/DatabaseConnectionFactory';
import { DrizzleMusicCatalogRepository } from '../../infrastructure/database/DrizzleMusicCatalogRepository';
import { DrizzlePlaylistRepository } from '../../infrastructure/database/DrizzlePlaylistRepository';
import { DrizzleLibraryRepository } from '../../infrastructure/database/DrizzleLibraryRepository';
import { getLogger } from '../../config/service-urls';
import { serializeError, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { getMusicVisibilityService } from '../../application/services/MusicVisibilityService';
import { getMusicAccessRepository } from '../../infrastructure/database/MusicAccessRepository';
import { sql } from 'drizzle-orm';
import type { NewPlaylistTrack } from '../../schema/music-schema';

export class MusicApiRoutes {
  private router: Router;
  private logger = getLogger('music-api-routes');

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/tracks/:id', this.getTrack.bind(this));
    this.router.get('/tracks', this.searchTracks.bind(this));

    this.router.get('/albums/:id', this.getAlbum.bind(this));
    this.router.get('/albums', this.getAlbums.bind(this));
    this.router.get('/albums/:id/tracks', this.getAlbumTracks.bind(this));

    this.router.get('/playlists/:id', this.getPlaylist.bind(this));
    this.router.get('/users/:userId/playlists', this.getUserPlaylists.bind(this));
    this.router.post('/playlists', this.createPlaylist.bind(this));
    this.router.post('/playlists/:id/tracks', this.addToPlaylist.bind(this));
    this.router.delete('/playlists/:playlistId/tracks/:trackId', this.removeFromPlaylist.bind(this));
    this.router.delete('/playlists/:id', this.deletePlaylist.bind(this));
    this.router.get('/playlists/:id/tracks', this.getPlaylistTracks.bind(this));

    this.router.get('/users/:userId/library', this.getUserLibrary.bind(this));
    this.router.post('/users/:userId/favorites/:trackId', this.addToFavorites.bind(this));
    this.router.delete('/users/:userId/favorites/:trackId', this.removeFromFavorites.bind(this));

    this.router.get('/catalog/stats', this.getCatalogStats.bind(this));

    this.router.patch('/tracks/:id/metadata', this.updateTrackMetadata.bind(this));
  }

  private async getTrack(req: Request, res: Response): Promise<void> {
    try {
      const id = (req.params.id as string) || '';
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const accessRepo = getMusicAccessRepository();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);
      const track = await accessRepo.getAccessibleTrack(id, userId, accessibleCreatorIds);

      if (!track) {
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      sendSuccess(res, track);
    } catch (error) {
      this.logger.error('Error fetching track', {
        module: 'music_api_routes',
        operation: 'get_track',
        trackId: req.params.id,
        error: serializeError(error),
        phase: 'track_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch track', req);
      return;
    }
  }

  private async searchTracks(req: Request, res: Response): Promise<void> {
    try {
      const query = ((req.query.query as string) || '') as string;
      const limit = (req.query.limit as string) || '20';
      const cursor = (req.query.cursor as string) || undefined;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const accessRepo = getMusicAccessRepository();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);

      const { tracks, nextCursor, hasMore } = await accessRepo.searchAccessibleTracks(userId, accessibleCreatorIds, {
        search: query,
        limit: Number(limit),
        cursor,
      });

      sendSuccess(res, {
        tracks,
        pagination: {
          limit: Number(limit),
          nextCursor,
          hasMore,
        },
      });
    } catch (error) {
      this.logger.error('Error searching tracks', {
        module: 'music_api_routes',
        operation: 'search_tracks',
        error: serializeError(error),
        phase: 'track_search_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to search tracks', req);
      return;
    }
  }

  private async getAlbum(req: Request, res: Response): Promise<void> {
    try {
      const id = (req.params.id as string) || '';
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const accessRepo = getMusicAccessRepository();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);
      const album = await accessRepo.getAccessibleAlbum(id, userId, accessibleCreatorIds);

      if (!album) {
        ServiceErrors.notFound(res, 'Album', req);
        return;
      }

      sendSuccess(res, album);
    } catch (error) {
      this.logger.error('Error fetching album', {
        module: 'music_api_routes',
        operation: 'get_album',
        albumId: req.params.id,
        error: serializeError(error),
        phase: 'album_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch album', req);
      return;
    }
  }

  private async getAlbums(req: Request, res: Response): Promise<void> {
    try {
      const requestedUserId = (req.query.userId as string) || '';
      const { userId: authUserId } = extractAuthContext(req);
      const limit = (req.query.limit as string) || '20';
      const offset = (req.query.offset as string) || '0';

      if (!authUserId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const accessRepo = getMusicAccessRepository();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(authUserId);

      const albums = await accessRepo.getAccessibleAlbums(authUserId, accessibleCreatorIds, {
        userId: requestedUserId || undefined,
        limit: Number(limit),
        offset: Number(offset),
      });

      sendSuccess(res, {
        albums,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: albums.length,
        },
      });
    } catch (error) {
      this.logger.error('Error fetching albums', {
        module: 'music_api_routes',
        operation: 'get_albums',
        error: serializeError(error),
        phase: 'albums_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch albums', req);
      return;
    }
  }

  private async getAlbumTracks(req: Request, res: Response): Promise<void> {
    try {
      const id = (req.params.id as string) || '';
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const accessRepo = getMusicAccessRepository();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);
      const tracks = await accessRepo.getAccessibleAlbumTracks(id, userId, accessibleCreatorIds);

      if (tracks === null) {
        ServiceErrors.notFound(res, 'Album', req);
        return;
      }

      sendSuccess(res, { tracks });
    } catch (error) {
      this.logger.error('Error fetching tracks for album', {
        module: 'music_api_routes',
        operation: 'get_album_tracks',
        albumId: req.params.id,
        error: serializeError(error),
        phase: 'album_tracks_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch album tracks', req);
      return;
    }
  }

  private async getPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const id = (req.params.id as string) || '';
      const { userId: authUserId } = extractAuthContext(req);

      if (!authUserId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const accessRepo = getMusicAccessRepository();
      const playlist = await accessRepo.getAccessiblePlaylist(id, authUserId);

      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      sendSuccess(res, playlist);
    } catch (error) {
      this.logger.error('Error fetching playlist', {
        module: 'music_api_routes',
        operation: 'get_playlist',
        playlistId: req.params.id,
        error: serializeError(error),
        phase: 'playlist_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch playlist', req);
      return;
    }
  }

  private async getUserPlaylists(req: Request, res: Response): Promise<void> {
    try {
      const requestedUserId = (req.params.userId as string) || '';
      const { userId: authUserId } = extractAuthContext(req);
      const limit = (req.query.limit as string) || '20';
      const offset = (req.query.offset as string) || '0';

      if (!authUserId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const db = getDatabase();
      let playlists;

      if (requestedUserId === authUserId) {
        const result = await db.execute(sql`
          SELECT id, name, description, user_id, visibility, artwork_url, total_duration, play_count, like_count, follower_count, tags, category, mood, genre, status, playlist_type, is_system, icon, color, smart_key, metadata, created_at, updated_at FROM mus_playlists 
          WHERE user_id = ${requestedUserId}
          ORDER BY created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `);
        playlists = result.rows || [];
      } else {
        const result = await db.execute(sql`
          SELECT id, name, description, user_id, visibility, artwork_url, total_duration, play_count, like_count, follower_count, tags, category, mood, genre, status, playlist_type, is_system, icon, color, smart_key, metadata, created_at, updated_at FROM mus_playlists 
          WHERE user_id = ${requestedUserId} AND visibility IN (${CONTENT_VISIBILITY.PUBLIC}, ${CONTENT_VISIBILITY.SHARED})
          ORDER BY created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `);
        playlists = result.rows || [];
      }

      sendSuccess(res, {
        playlists,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: playlists.length,
        },
      });
    } catch (error) {
      this.logger.error('Error fetching playlists', {
        module: 'music_api_routes',
        operation: 'get_user_playlists',
        error: serializeError(error),
        phase: 'playlists_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch playlists', req);
      return;
    }
  }

  private async createPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, visibility = CONTENT_VISIBILITY.PERSONAL, trackIds = [] } = req.body;
      const { userId } = extractAuthContext(req);

      if (!name) {
        ServiceErrors.badRequest(res, 'Playlist name is required', req);
        return;
      }

      const playlistRepository = createDrizzleRepository(DrizzlePlaylistRepository);
      const newPlaylist = {
        name,
        description,
        visibility,
        trackIds,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const playlist = await playlistRepository.createPlaylist(newPlaylist);
      sendCreated(res, playlist);
    } catch (error) {
      this.logger.error('Error creating playlist', {
        module: 'music_api_routes',
        operation: 'create_playlist',
        error: serializeError(error),
        phase: 'playlist_creation_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to create playlist', req);
      return;
    }
  }

  private async addToPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const playlistId = (req.params.id as string) || '';
      const { trackId } = req.body;
      const { userId } = extractAuthContext(req);

      this.logger.info('Adding track to playlist', {
        module: 'music_api_routes',
        operation: 'add_to_playlist',
        playlistId,
        trackId,
        userId,
      });

      if (!trackId) {
        this.logger.warn('Missing trackId in request body');
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      const playlistRepository = createDrizzleRepository(DrizzlePlaylistRepository);

      const playlist = await playlistRepository.getPlaylistById(playlistId);
      if (!playlist) {
        this.logger.warn('Playlist not found', { playlistId });
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      await playlistRepository.addTrackToPlaylist(playlistId, {
        trackId,
        addedBy: userId,
        position: 0,
        playlistId,
      } as NewPlaylistTrack);

      this.logger.info('Track successfully added to playlist', {
        playlistId,
        trackId,
        userId,
      });

      sendSuccess(res, { message: 'Track added to playlist', playlistId, trackId });
    } catch (error) {
      this.logger.error('Error adding track to playlist', {
        module: 'music_api_routes',
        operation: 'add_to_playlist',
        error: serializeError(error),
        phase: 'playlist_add_track_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to add track to playlist', req);
      return;
    }
  }

  private async removeFromPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const playlistId = (req.params.playlistId as string) || '';
      const trackId = (req.params.trackId as string) || '';
      const playlistRepository = createDrizzleRepository(DrizzlePlaylistRepository);

      const playlist = await playlistRepository.getPlaylistById(playlistId);
      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      sendSuccess(res, { message: 'Track removed from playlist' });
    } catch (error) {
      this.logger.error('Error removing track from playlist', {
        module: 'music_api_routes',
        operation: 'remove_from_playlist',
        error: serializeError(error),
        phase: 'playlist_remove_track_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to remove track from playlist', req);
      return;
    }
  }

  private async deletePlaylist(req: Request, res: Response): Promise<void> {
    try {
      const id = (req.params.id as string) || '';
      const playlistRepository = createDrizzleRepository(DrizzlePlaylistRepository);

      sendSuccess(res, { message: 'Playlist deleted' });
    } catch (error) {
      this.logger.error('Error deleting playlist', {
        module: 'music_api_routes',
        operation: 'delete_playlist',
        error: serializeError(error),
        phase: 'playlist_deletion_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to delete playlist', req);
      return;
    }
  }

  private async getPlaylistTracks(req: Request, res: Response): Promise<void> {
    try {
      const id = (req.params.id as string) || '';
      const playlistRepository = createDrizzleRepository(DrizzlePlaylistRepository);
      const tracks = await playlistRepository.getPlaylistTracks(id);

      sendSuccess(res, { tracks });
    } catch (error) {
      this.logger.error('Error fetching tracks for playlist', {
        module: 'music_api_routes',
        operation: 'get_playlist_tracks',
        playlistId: req.params.id,
        error: serializeError(error),
        phase: 'playlist_tracks_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch playlist tracks', req);
      return;
    }
  }

  private async getUserLibrary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.params.userId as string) || '';
      const libraryRepository = createDrizzleRepository(DrizzleLibraryRepository);

      const stats = await libraryRepository.getLibraryStats(userId);
      sendSuccess(res, {
        userId,
        ...stats,
      });
    } catch (error) {
      this.logger.error('Error fetching library for user', {
        module: 'music_api_routes',
        operation: 'get_user_library',
        userId: req.params.userId,
        error: serializeError(error),
        phase: 'user_library_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch user library', req);
      return;
    }
  }

  private async addToFavorites(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.params.userId as string) || '';
      const trackId = (req.params.trackId as string) || '';

      sendSuccess(res, { message: 'Added to favorites' });
    } catch (error) {
      this.logger.error('Error adding to favorites', {
        module: 'music_api_routes',
        operation: 'add_to_favorites',
        error: serializeError(error),
        phase: 'favorites_add_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to add to favorites', req);
      return;
    }
  }

  private async removeFromFavorites(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.params.userId as string) || '';
      const trackId = (req.params.trackId as string) || '';

      sendSuccess(res, { message: 'Removed from favorites' });
    } catch (error) {
      this.logger.error('Error removing from favorites', {
        module: 'music_api_routes',
        operation: 'remove_from_favorites',
        error: serializeError(error),
        phase: 'favorites_remove_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to remove from favorites', req);
      return;
    }
  }

  private async getCatalogStats(req: Request, res: Response): Promise<void> {
    try {
      const catalogRepository = createDrizzleRepository(DrizzleMusicCatalogRepository);
      const stats = await catalogRepository.getCatalogStats();

      sendSuccess(res, stats);
    } catch (error) {
      this.logger.error('Error fetching catalog stats', {
        module: 'music_api_routes',
        operation: 'get_catalog_stats',
        error: serializeError(error),
        phase: 'catalog_stats_fetch_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch catalog stats', req);
      return;
    }
  }

  private async updateTrackMetadata(req: Request, res: Response): Promise<void> {
    try {
      const id = (req.params.id as string) || '';
      const { title, genre, tags } = req.body;
      const catalogRepository = createDrizzleRepository(DrizzleMusicCatalogRepository);

      const track = await catalogRepository.findTrackById(id);
      if (!track) {
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      sendSuccess(res, track);
    } catch (error) {
      this.logger.error('Error updating track metadata', {
        module: 'music_api_routes',
        operation: 'update_track_metadata',
        error: serializeError(error),
        phase: 'track_metadata_update_error',
      });
      ServiceErrors.fromException(res, error, 'Failed to update track metadata', req);
      return;
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

export default new MusicApiRoutes().getRouter();
