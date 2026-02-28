/**
 * Playlists API Contract Tests
 */

import { describe, it, expect } from 'vitest';

import {
  PlaylistTypeSchema,
  PlaylistStatusSchema,
  PlaylistCategorySchema,
  PlaylistSchema,
  PlaylistTrackSchema,
  PlaylistWithTracksSchema,
  SmartPlaylistSchema,
  PlaylistResponseSchema,
  PlaylistsListResponseSchema,
  CreatePlaylistRequestSchema,
  UpdatePlaylistRequestSchema,
  AddTrackToPlaylistRequestSchema,
  validatePlaylistResponse,
  extractPlaylistFromResponse,
  extractPlaylistsFromResponse,
  isSmartPlaylist,
  isSystemPlaylist,
  formatPlaylistDuration,
  CONTENT_VISIBILITY,
  type Playlist,
} from '@aiponge/shared-contracts';

describe('Playlists API Contracts', () => {
  describe('PlaylistTypeSchema', () => {
    it('should validate all playlist types', () => {
      const types = ['manual', 'smart', 'hybrid'];
      for (const type of types) {
        const result = PlaylistTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('PlaylistStatusSchema', () => {
    it('should validate all statuses', () => {
      const statuses = ['active', 'archived', 'deleted'];
      for (const status of statuses) {
        const result = PlaylistStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('PlaylistCategorySchema', () => {
    it('should validate all categories', () => {
      const categories = ['user', 'featured', 'algorithm'];
      for (const category of categories) {
        const result = PlaylistCategorySchema.safeParse(category);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('PlaylistSchema', () => {
    it('should validate complete playlist object', () => {
      const playlist: Playlist = {
        id: 'playlist-123',
        name: 'My Favorites',
        description: 'A collection of my favorite songs',
        userId: 'user-456',
        visibility: CONTENT_VISIBILITY.SHARED,
        artworkUrl: 'https://cdn.example.com/playlist.jpg',
        totalDuration: 3600,
        playCount: 100,
        likeCount: 50,
        followerCount: 25,
        tags: ['chill', 'relaxing'],
        category: 'user',
        mood: 'relaxed',
        genre: 'ambient',
        status: 'active',
        playlistType: 'manual',
        isSystem: false,
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      };

      const result = PlaylistSchema.safeParse(playlist);
      expect(result.success).toBe(true);
    });

    it('should validate minimal required fields', () => {
      const minimalPlaylist = {
        id: 'playlist-123',
        name: 'Quick Playlist',
      };

      const result = PlaylistSchema.safeParse(minimalPlaylist);
      expect(result.success).toBe(true);
    });

    it('should validate smart playlist', () => {
      const smartPlaylist = {
        id: 'playlist-123',
        name: 'Calm Vibes',
        playlistType: 'smart',
        smartKey: 'calm',
        icon: '🧘',
        color: '#4A90D9',
        isSystem: true,
      };

      const result = PlaylistSchema.safeParse(smartPlaylist);
      expect(result.success).toBe(true);
    });
  });

  describe('PlaylistTrackSchema', () => {
    it('should validate playlist track junction', () => {
      const playlistTrack = {
        id: 'pt-123',
        playlistId: 'playlist-456',
        trackId: 'track-789',
        position: 3,
        addedAt: '2025-01-15T10:00:00.000Z',
        addedBy: 'user-001',
      };

      const result = PlaylistTrackSchema.safeParse(playlistTrack);
      expect(result.success).toBe(true);
    });

    it('should validate playlist track with embedded track', () => {
      const playlistTrack = {
        playlistId: 'playlist-456',
        trackId: 'track-789',
        position: 1,
        track: {
          id: 'track-789',
          title: 'Cool Song',
          userId: 'user-123',
          albumId: 'album-456',
          duration: 180,
          fileUrl: 'https://cdn.example.com/song.mp3',
          status: 'active',
          quality: 'high',
        },
      };

      const result = PlaylistTrackSchema.safeParse(playlistTrack);
      expect(result.success).toBe(true);
    });
  });

  describe('PlaylistWithTracksSchema', () => {
    it('should validate playlist with embedded tracks', () => {
      const playlistWithTracks = {
        id: 'playlist-123',
        name: 'My Playlist',
        trackCount: 2,
        tracks: [
          {
            id: 'track-1',
            title: 'Song One',
            userId: 'user-1',
            albumId: 'album-1',
            duration: 180,
            fileUrl: 'https://cdn.example.com/song1.mp3',
            status: 'active',
            quality: 'high',
          },
          {
            id: 'track-2',
            title: 'Song Two',
            userId: 'user-1',
            albumId: 'album-1',
            duration: 200,
            fileUrl: 'https://cdn.example.com/song2.mp3',
            status: 'active',
            quality: 'high',
          },
        ],
      };

      const result = PlaylistWithTracksSchema.safeParse(playlistWithTracks);
      expect(result.success).toBe(true);
    });
  });

  describe('SmartPlaylistSchema', () => {
    it('should validate smart playlist with required smartKey', () => {
      const smartPlaylist = {
        id: 'playlist-123',
        name: 'Energy Boost',
        smartKey: 'energy',
        icon: '⚡',
        color: '#FF6B35',
        isSystem: true,
        playlistType: 'smart',
      };

      const result = SmartPlaylistSchema.safeParse(smartPlaylist);
      expect(result.success).toBe(true);
    });
  });

  describe('PlaylistResponseSchema', () => {
    it('should validate success response with playlist', () => {
      const response = {
        success: true,
        data: {
          id: 'playlist-123',
          name: 'My Playlist',
          status: 'active',
        },
      };

      const result = PlaylistResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: {
          type: 'NOT_FOUND',
          code: 'PLAYLIST_NOT_FOUND',
          message: 'Playlist not found',
        },
      };

      const result = PlaylistResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('PlaylistsListResponseSchema', () => {
    it('should validate list of playlists', () => {
      const response = {
        success: true,
        data: {
          playlists: [
            { id: 'p1', name: 'Playlist One' },
            { id: 'p2', name: 'Playlist Two' },
          ],
          total: 2,
        },
      };

      const result = PlaylistsListResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('Mutation Request Schemas', () => {
    describe('CreatePlaylistRequestSchema', () => {
      it('should validate create request', () => {
        const request = {
          name: 'My New Playlist',
          description: 'A great playlist',
          visibility: CONTENT_VISIBILITY.SHARED,
          tags: ['workout', 'energy'],
          mood: 'energetic',
          genre: 'electronic',
        };

        const result = CreatePlaylistRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      });

      it('should require name', () => {
        const request = { description: 'No name' };
        const result = CreatePlaylistRequestSchema.safeParse(request);
        expect(result.success).toBe(false);
      });
    });

    describe('UpdatePlaylistRequestSchema', () => {
      it('should validate partial update', () => {
        const request = { name: 'Updated Name' };
        const result = UpdatePlaylistRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      });

      it('should allow null values for clearing fields', () => {
        const request = { description: null, artworkUrl: null };
        const result = UpdatePlaylistRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      });
    });

    describe('AddTrackToPlaylistRequestSchema', () => {
      it('should validate add track request', () => {
        const request = {
          trackId: '550e8400-e29b-41d4-a716-446655440000',
          position: 5,
        };

        const result = AddTrackToPlaylistRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      });

      it('should require valid UUID for trackId', () => {
        const request = { trackId: 'not-a-uuid' };
        const result = AddTrackToPlaylistRequestSchema.safeParse(request);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Validation Helpers', () => {
    describe('validatePlaylistResponse', () => {
      it('should return valid for correct response', () => {
        const response = {
          success: true,
          data: { id: 'playlist-123', name: 'Test' },
        };

        const result = validatePlaylistResponse(response);
        expect(result.valid).toBe(true);
      });

      it('should return invalid for malformed response', () => {
        const result = validatePlaylistResponse({ foo: 'bar' });
        expect(result.valid).toBe(false);
      });
    });

    describe('extractPlaylistFromResponse', () => {
      it('should extract playlist from valid response', () => {
        const response = {
          success: true,
          data: { id: 'playlist-123', name: 'Test' },
        };

        const playlist = extractPlaylistFromResponse(response);
        expect(playlist).not.toBeNull();
        expect(playlist?.id).toBe('playlist-123');
      });

      it('should return null for error response', () => {
        const playlist = extractPlaylistFromResponse({ success: false });
        expect(playlist).toBeNull();
      });
    });

    describe('extractPlaylistsFromResponse', () => {
      it('should extract playlists array from list response', () => {
        const response = {
          success: true,
          data: {
            playlists: [{ id: 'p1', name: 'Playlist One' }],
            total: 1,
          },
        };

        const playlists = extractPlaylistsFromResponse(response);
        expect(playlists).toHaveLength(1);
      });

      it('should return empty array for error response', () => {
        const playlists = extractPlaylistsFromResponse({ success: false });
        expect(playlists).toEqual([]);
      });
    });

    describe('isSmartPlaylist', () => {
      it('should return true for smart playlist type', () => {
        const playlist: Playlist = { id: 'p1', name: 'Test', playlistType: 'smart' };
        expect(isSmartPlaylist(playlist)).toBe(true);
      });

      it('should return true for playlist with smartKey', () => {
        const playlist: Playlist = { id: 'p1', name: 'Test', smartKey: 'calm' };
        expect(isSmartPlaylist(playlist)).toBe(true);
      });

      it('should return false for manual playlist', () => {
        const playlist: Playlist = { id: 'p1', name: 'Test', playlistType: 'manual' };
        expect(isSmartPlaylist(playlist)).toBe(false);
      });
    });

    describe('isSystemPlaylist', () => {
      it('should return true for system playlist', () => {
        const playlist: Playlist = { id: 'p1', name: 'Test', isSystem: true };
        expect(isSystemPlaylist(playlist)).toBe(true);
      });

      it('should return false for user playlist', () => {
        const playlist: Playlist = { id: 'p1', name: 'Test', isSystem: false };
        expect(isSystemPlaylist(playlist)).toBe(false);
      });
    });

    describe('formatPlaylistDuration', () => {
      it('should format duration with hours and minutes', () => {
        expect(formatPlaylistDuration(3660)).toBe('1 hr 1 min');
      });

      it('should format duration with minutes only', () => {
        expect(formatPlaylistDuration(300)).toBe('5 min');
      });
    });
  });

  describe('Regression Tests', () => {
    it('should catch missing id field', () => {
      const invalid = { name: 'No ID' };
      const result = PlaylistSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should catch missing ServiceResponse wrapper', () => {
      const unwrapped = { id: 'playlist-123', name: 'Test' };
      const result = PlaylistResponseSchema.safeParse(unwrapped);
      expect(result.success).toBe(false);
    });
  });
});
