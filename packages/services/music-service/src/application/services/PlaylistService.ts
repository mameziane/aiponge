import { getLogger } from '../../config/service-urls';
import { IPlaylistRepository } from '../../infrastructure/database/DrizzlePlaylistRepository';
import type { Playlist, NewPlaylist, NewPlaylistTrack } from '../../schema/music-schema';
import { CONTENT_VISIBILITY, PLAYLIST_LIFECYCLE, type ContentVisibility } from '@aiponge/shared-contracts';
import { ServiceError } from '@aiponge/platform-core';

const logger = getLogger('music-service-playlistservice');

export class DuplicateTrackError extends ServiceError {
  constructor(trackId: string, playlistId: string) {
    super('DuplicateTrackError', `Track ${trackId} already exists in playlist ${playlistId}`, {
      statusCode: 409,
      details: { trackId, playlistId },
    });
  }
}

export class PlaylistService {
  constructor(private playlistRepository: IPlaylistRepository) {}

  async createPlaylist(params: {
    name: string;
    userId: string;
    description?: string;
    visibility?: ContentVisibility;
    mood?: string;
    genre?: string;
    category?: string;
    icon?: string;
    color?: string;
    tags?: string[];
    playlistType?: string;
  }): Promise<Playlist> {
    logger.info('Creating playlist: {} for user: {}', { data0: params.name, data1: params.userId });

    const newPlaylist: NewPlaylist = {
      id: crypto.randomUUID(),
      name: params.name,
      description: params.description ?? null,
      userId: params.userId,
      visibility: params.visibility ?? CONTENT_VISIBILITY.PERSONAL,
      artworkUrl: null,
      totalDuration: 0,
      playCount: 0,
      likeCount: 0,
      followerCount: 0,
      tags: params.tags ?? [],
      category: params.category ?? null,
      mood: params.mood ?? null,
      genre: params.genre ?? null,
      icon: params.icon ?? null,
      color: params.color ?? null,
      playlistType: params.playlistType ?? 'manual',
      status: PLAYLIST_LIFECYCLE.ACTIVE,
      metadata: {},
    };

    return await this.playlistRepository.createPlaylist(newPlaylist);
  }

  async getPlaylist(playlistId: string): Promise<Playlist | null> {
    logger.info('Getting playlist: {}', { data0: playlistId });
    return await this.playlistRepository.getPlaylistById(playlistId);
  }

  async getUserPlaylists(userId: string): Promise<Playlist[]> {
    logger.info('📡 [PLAYLIST-SERVICE] getUserPlaylists called for user: {}', { data0: userId });
    const playlists = await this.playlistRepository.getPlaylistsByUser(userId);
    logger.info('📊 [PLAYLIST-SERVICE] Repository returned {} playlists for user: {}', {
      data0: playlists.length,
      data1: userId,
      playlistIds: playlists.map(p => p.id),
      playlistNames: playlists.map(p => p.name),
    });
    return playlists;
  }

  async updatePlaylist(playlistId: string, updates: Partial<Playlist>): Promise<void> {
    logger.info('Updating playlist: {}', { data0: playlistId });
    await this.playlistRepository.updatePlaylist(playlistId, updates);
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    logger.info('Deleting playlist: {}', { data0: playlistId });
    await this.playlistRepository.deletePlaylist(playlistId);
  }

  async addTrackToPlaylist(playlistId: string, trackId: string, userId: string): Promise<{ alreadyExists: boolean }> {
    logger.info('Adding track {} to playlist {}', { data0: trackId, data1: playlistId });

    // Idempotent: if track is already in playlist, return success with flag instead of throwing.
    // This prevents the Favorites heart icon from showing errors on repeat taps.
    const existingTracks = await this.playlistRepository.getPlaylistTracks(playlistId);
    if (existingTracks.some(t => t.trackId === trackId)) {
      logger.info('Track {} already in playlist {}, no-op', { data0: trackId, data1: playlistId });
      return { alreadyExists: true };
    }

    const track: NewPlaylistTrack = {
      id: crypto.randomUUID(),
      playlistId,
      trackId,
      position: 0,
      addedBy: userId,
      playCount: 0,
      lastPlayedAt: null,
      metadata: {},
    };

    await this.playlistRepository.addTrackToPlaylist(playlistId, track);
    return { alreadyExists: false };
  }

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    logger.info('Removing track {} from playlist {}', { data0: trackId, data1: playlistId });
    await this.playlistRepository.removeTrackFromPlaylist(playlistId, trackId);
  }

  async getPlaylistTracks(playlistId: string) {
    logger.info('Getting tracks for playlist: {}', { data0: playlistId });
    return await this.playlistRepository.getPlaylistTracks(playlistId);
  }

  async searchPlaylists(query: string, limit: number = 20): Promise<Playlist[]> {
    logger.info('Searching playlists with query: {}', { data0: query });
    return await this.playlistRepository.searchPlaylists(query, limit);
  }

  async getPublicPlaylists(limit: number = 20): Promise<Playlist[]> {
    logger.info('Getting public playlists');
    return await this.playlistRepository.getPublicPlaylists(limit);
  }
}
