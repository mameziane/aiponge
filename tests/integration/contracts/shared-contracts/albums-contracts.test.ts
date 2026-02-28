/**
 * Albums API Contract Tests
 */

import { describe, it, expect } from 'vitest';

import {
  AlbumTypeSchema,
  AlbumStatusSchema,
  AlbumSchema,
  UserAlbumSchema,
  AlbumWithTracksSchema,
  AlbumResponseSchema,
  AlbumsListResponseSchema,
  validateAlbumResponse,
  extractAlbumFromResponse,
  extractAlbumsFromResponse,
  formatAlbumDuration,
  getAlbumDisplayType,
  CONTENT_VISIBILITY,
  type Album,
} from '@aiponge/shared-contracts';

describe('Albums API Contracts', () => {
  describe('AlbumTypeSchema', () => {
    it('should validate all album types', () => {
      const types = ['album', 'single', 'ep', 'compilation'];
      for (const type of types) {
        const result = AlbumTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid type', () => {
      const result = AlbumTypeSchema.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('AlbumStatusSchema', () => {
    it('should validate all statuses', () => {
      const statuses = ['draft', 'published', 'archived'];
      for (const status of statuses) {
        const result = AlbumStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('AlbumSchema', () => {
    it('should validate complete album object', () => {
      const album: Album = {
        id: 'album-123',
        title: 'Greatest Hits',
        userId: 'user-456',
        artistName: 'The Artist',
        description: 'A collection of greatest hits',
        genres: ['pop', 'rock'],
        artworkUrl: 'https://cdn.example.com/cover.jpg',
        releaseDate: '2025-01-15T00:00:00.000Z',
        type: 'album',
        totalTracks: 12,
        totalDuration: 2880,
        isExplicit: false,
        visibility: CONTENT_VISIBILITY.SHARED,
        chapterId: 'chapter-789',
        status: 'published',
        playCount: 50000,
        createdAt: '2025-01-01T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      };

      const result = AlbumSchema.safeParse(album);
      expect(result.success).toBe(true);
    });

    it('should validate minimal required fields', () => {
      const minimalAlbum = {
        id: 'album-123',
        title: 'My Album',
        userId: 'user-456',
        type: 'single',
        status: 'draft',
      };

      const result = AlbumSchema.safeParse(minimalAlbum);
      expect(result.success).toBe(true);
    });

    it('should allow string type for flexibility', () => {
      const album = {
        id: 'album-123',
        title: 'My Album',
        userId: 'user-456',
        type: 'custom_type',
        status: 'published',
      };

      const result = AlbumSchema.safeParse(album);
      expect(result.success).toBe(true);
    });
  });

  describe('UserAlbumSchema', () => {
    it('should validate user album with userId', () => {
      const userAlbum = {
        id: 'album-123',
        userId: 'user-456',
        title: 'My Personal Album',
        chapterId: 'chapter-001',
        bookId: 'book-002',
        totalTracks: 5,
        status: 'active',
      };

      const result = UserAlbumSchema.safeParse(userAlbum);
      expect(result.success).toBe(true);
    });
  });

  describe('AlbumWithTracksSchema', () => {
    it('should validate album with embedded tracks', () => {
      const albumWithTracks = {
        id: 'album-123',
        title: 'My Album',
        userId: 'user-456',
        type: 'album',
        status: 'published',
        tracks: [
          {
            id: 'track-1',
            title: 'Song One',
            userId: 'user-456',
            albumId: 'album-123',
            duration: 180,
            fileUrl: 'https://cdn.example.com/song1.mp3',
            status: 'active',
            quality: 'high',
          },
          {
            id: 'track-2',
            title: 'Song Two',
            userId: 'user-456',
            albumId: 'album-123',
            duration: 200,
            fileUrl: 'https://cdn.example.com/song2.mp3',
            status: 'active',
            quality: 'high',
          },
        ],
      };

      const result = AlbumWithTracksSchema.safeParse(albumWithTracks);
      expect(result.success).toBe(true);
    });
  });

  describe('AlbumResponseSchema', () => {
    it('should validate success response with album', () => {
      const response = {
        success: true,
        data: {
          id: 'album-123',
          title: 'My Album',
          userId: 'user-456',
          type: 'album',
          status: 'published',
        },
      };

      const result = AlbumResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: {
          type: 'NOT_FOUND',
          code: 'ALBUM_NOT_FOUND',
          message: 'Album not found',
        },
      };

      const result = AlbumResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('AlbumsListResponseSchema', () => {
    it('should validate list of albums', () => {
      const response = {
        success: true,
        data: {
          albums: [
            { id: 'album-1', title: 'Album One', userId: 'user-1', type: 'album', status: 'published' },
            { id: 'album-2', title: 'Album Two', userId: 'user-2', type: 'single', status: 'published' },
          ],
          total: 2,
        },
      };

      const result = AlbumsListResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('Validation Helpers', () => {
    describe('validateAlbumResponse', () => {
      it('should return valid for correct response', () => {
        const response = {
          success: true,
          data: { id: 'album-123', title: 'Test', userId: 'user-1', type: 'album', status: 'published' },
        };

        const result = validateAlbumResponse(response);
        expect(result.valid).toBe(true);
      });

      it('should return invalid for malformed response', () => {
        const result = validateAlbumResponse({ foo: 'bar' });
        expect(result.valid).toBe(false);
      });
    });

    describe('extractAlbumFromResponse', () => {
      it('should extract album from valid response', () => {
        const response = {
          success: true,
          data: { id: 'album-123', title: 'Test', userId: 'user-1', type: 'album', status: 'published' },
        };

        const album = extractAlbumFromResponse(response);
        expect(album).not.toBeNull();
        expect(album?.id).toBe('album-123');
      });

      it('should return null for error response', () => {
        const album = extractAlbumFromResponse({ success: false });
        expect(album).toBeNull();
      });
    });

    describe('extractAlbumsFromResponse', () => {
      it('should extract albums array from list response', () => {
        const response = {
          success: true,
          data: {
            albums: [
              { id: 'album-1', title: 'A1', userId: 'user-1', type: 'album', status: 'published' },
            ],
            total: 1,
          },
        };

        const albums = extractAlbumsFromResponse(response);
        expect(albums).toHaveLength(1);
      });

      it('should return empty array for error response', () => {
        const albums = extractAlbumsFromResponse({ success: false });
        expect(albums).toEqual([]);
      });
    });

    describe('formatAlbumDuration', () => {
      it('should format duration with hours and minutes', () => {
        expect(formatAlbumDuration(3660)).toBe('1 hr 1 min');
        expect(formatAlbumDuration(7200)).toBe('2 hr 0 min');
      });

      it('should format duration with minutes only', () => {
        expect(formatAlbumDuration(300)).toBe('5 min');
        expect(formatAlbumDuration(60)).toBe('1 min');
      });
    });

    describe('getAlbumDisplayType', () => {
      it('should return formatted display type', () => {
        expect(getAlbumDisplayType('album')).toBe('Album');
        expect(getAlbumDisplayType('single')).toBe('Single');
        expect(getAlbumDisplayType('ep')).toBe('EP');
        expect(getAlbumDisplayType('compilation')).toBe('Compilation');
      });

      it('should return original for unknown type', () => {
        expect(getAlbumDisplayType('custom')).toBe('custom');
      });
    });
  });

  describe('Regression Tests', () => {
    it('should catch missing id field', () => {
      const invalid = { title: 'Album', userId: 'user-1', type: 'album', status: 'published' };
      const result = AlbumSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should catch missing ServiceResponse wrapper', () => {
      const unwrapped = { id: 'album-123', title: 'Album', userId: 'user-1', type: 'album', status: 'published' };
      const result = AlbumResponseSchema.safeParse(unwrapped);
      expect(result.success).toBe(false);
    });
  });
});
