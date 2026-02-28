/**
 * Tracks API Contract Tests
 * 
 * Validates track/music playback API contracts.
 */

import { describe, it, expect } from 'vitest';

import {
  TrackStatusSchema,
  TrackQualitySchema,
  TrackSchema,
  UserTrackSchema,
  TrackResponseSchema,
  TracksListResponseSchema,
  TrackWithLyricsSchema,
  validateTrackResponse,
  extractTrackFromResponse,
  extractTracksFromResponse,
  isTrackPlayable,
  formatDuration,
  type Track,
  type UserTrack,
} from '@aiponge/shared-contracts';

describe('Tracks API Contracts', () => {
  describe('TrackStatusSchema', () => {
    it('should validate all track statuses', () => {
      const statuses = ['draft', 'processing', 'active', 'deleted', 'published', 'archived', 'removed'];
      
      for (const status of statuses) {
        const result = TrackStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = TrackStatusSchema.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('TrackQualitySchema', () => {
    it('should validate all quality levels', () => {
      const qualities = ['lossless', 'high', 'medium', 'low'];
      
      for (const quality of qualities) {
        const result = TrackQualitySchema.safeParse(quality);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('TrackSchema', () => {
    it('should validate complete track object', () => {
      const track: Track = {
        id: 'track-123',
        title: 'My Song',
        userId: 'user-456',
        artistName: 'The Artist',
        albumId: 'album-789',
        albumTitle: 'Great Album',
        duration: 180,
        fileUrl: 'https://cdn.example.com/song.mp3',
        artworkUrl: 'https://cdn.example.com/artwork.jpg',
        lyricsId: 'lyrics-001',
        hasSyncedLyrics: true,
        genres: ['pop', 'electronic'],
        tags: ['uplifting', 'summer'],
        trackNumber: 3,
        generationNumber: 1,
        status: 'published',
        quality: 'high',
        fileSize: 5242880,
        mimeType: 'audio/mpeg',
        isExplicit: false,
        playCount: 1500,
        likeCount: 250,
        language: 'en',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      };

      const result = TrackSchema.safeParse(track);
      expect(result.success).toBe(true);
    });

    it('should validate minimal required fields', () => {
      const minimalTrack = {
        id: 'track-123',
        title: 'My Song',
        userId: 'user-456',
        albumId: 'album-789',
        duration: 180,
        fileUrl: 'https://cdn.example.com/song.mp3',
        status: 'active',
        quality: 'high',
      };

      const result = TrackSchema.safeParse(minimalTrack);
      expect(result.success).toBe(true);
    });

    it('should allow string status for flexibility', () => {
      const track = {
        id: 'track-123',
        title: 'My Song',
        userId: 'user-456',
        albumId: 'album-789',
        duration: 180,
        fileUrl: 'https://cdn.example.com/song.mp3',
        status: 'custom_status',
        quality: 'high',
      };

      const result = TrackSchema.safeParse(track);
      expect(result.success).toBe(true);
    });
  });

  describe('UserTrackSchema', () => {
    it('should validate user track with userId', () => {
      const userTrack: UserTrack = {
        id: 'track-123',
        userId: 'user-456',
        title: 'My Personal Song',
        duration: 240,
        fileUrl: 'https://cdn.example.com/user-song.mp3',
        entryId: 'entry-001',
        chapterId: 'chapter-002',
        genre: 'indie',
        mood: 'peaceful',
        status: 'active',
        quality: 'high',
        playCount: 10,
      };

      const result = UserTrackSchema.safeParse(userTrack);
      expect(result.success).toBe(true);
    });
  });

  describe('TrackResponseSchema', () => {
    it('should validate success response with track', () => {
      const response = {
        success: true,
        data: {
          id: 'track-123',
          title: 'My Song',
          userId: 'user-456',
          albumId: 'album-789',
          duration: 180,
          fileUrl: 'https://cdn.example.com/song.mp3',
          status: 'active',
          quality: 'high',
        },
      };

      const result = TrackResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: {
          type: 'NOT_FOUND',
          code: 'TRACK_NOT_FOUND',
          message: 'Track not found',
        },
      };

      const result = TrackResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('TracksListResponseSchema', () => {
    it('should validate list of tracks', () => {
      const response = {
        success: true,
        data: {
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
          total: 2,
        },
      };

      const result = TracksListResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('TrackWithLyricsSchema', () => {
    it('should validate track with embedded lyrics', () => {
      const trackWithLyrics = {
        id: 'track-123',
        title: 'My Song',
        userId: 'user-456',
        albumId: 'album-789',
        duration: 180,
        fileUrl: 'https://cdn.example.com/song.mp3',
        status: 'active',
        quality: 'high',
        lyrics: {
          id: 'lyrics-001',
          content: 'Hello world\nLa la la',
          syncedLines: [
            { text: 'Hello world', startTime: 0, endTime: 2 },
            { text: 'La la la', startTime: 2, endTime: 5 },
          ],
        },
      };

      const result = TrackWithLyricsSchema.safeParse(trackWithLyrics);
      expect(result.success).toBe(true);
    });

    it('should validate track with null lyrics', () => {
      const trackNoLyrics = {
        id: 'track-123',
        title: 'Instrumental',
        userId: 'user-456',
        albumId: 'album-789',
        duration: 180,
        fileUrl: 'https://cdn.example.com/song.mp3',
        status: 'active',
        quality: 'high',
        lyrics: null,
      };

      const result = TrackWithLyricsSchema.safeParse(trackNoLyrics);
      expect(result.success).toBe(true);
    });
  });

  describe('Validation Helpers', () => {
    describe('validateTrackResponse', () => {
      it('should return valid for correct response', () => {
        const response = {
          success: true,
          data: {
            id: 'track-123',
            title: 'Test Track',
            userId: 'user-1',
            albumId: 'album-1',
            duration: 180,
            fileUrl: 'https://example.com/track.mp3',
            status: 'active',
            quality: 'high',
          },
        };

        const result = validateTrackResponse(response);
        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should return invalid for malformed response', () => {
        const malformed = { foo: 'bar' };
        const result = validateTrackResponse(malformed);
        expect(result.valid).toBe(false);
      });
    });

    describe('extractTrackFromResponse', () => {
      it('should extract track from valid response', () => {
        const response = {
          success: true,
          data: {
            id: 'track-123',
            title: 'Test Track',
            userId: 'user-1',
            albumId: 'album-1',
            duration: 180,
            fileUrl: 'https://example.com/track.mp3',
            status: 'active',
            quality: 'high',
          },
        };

        const track = extractTrackFromResponse(response);
        expect(track).not.toBeNull();
        expect(track?.id).toBe('track-123');
      });

      it('should return null for error response', () => {
        const response = { success: false };
        const track = extractTrackFromResponse(response);
        expect(track).toBeNull();
      });
    });

    describe('extractTracksFromResponse', () => {
      it('should extract tracks array from list response', () => {
        const response = {
          success: true,
          data: {
            tracks: [
              {
                id: 'track-1',
                title: 'Song One',
                userId: 'user-1',
                albumId: 'album-1',
                duration: 180,
                fileUrl: 'https://example.com/song1.mp3',
                status: 'active',
                quality: 'high',
              },
            ],
            total: 1,
          },
        };

        const tracks = extractTracksFromResponse(response);
        expect(tracks).toHaveLength(1);
        expect(tracks[0].id).toBe('track-1');
      });

      it('should return empty array for error response', () => {
        const response = { success: false };
        const tracks = extractTracksFromResponse(response);
        expect(tracks).toEqual([]);
      });
    });

    describe('isTrackPlayable', () => {
      it('should return true for active track with fileUrl', () => {
        const track: Track = {
          id: 'track-123',
          title: 'Test',
          userId: 'user-1',
          albumId: 'album-1',
          duration: 180,
          fileUrl: 'https://example.com/track.mp3',
          status: 'active',
          quality: 'high',
        };

        expect(isTrackPlayable(track)).toBe(true);
      });

      it('should return true for published track', () => {
        const track: Track = {
          id: 'track-123',
          title: 'Test',
          userId: 'user-1',
          albumId: 'album-1',
          duration: 180,
          fileUrl: 'https://example.com/track.mp3',
          status: 'published',
          quality: 'high',
        };

        expect(isTrackPlayable(track)).toBe(true);
      });

      it('should return false for draft track', () => {
        const track: Track = {
          id: 'track-123',
          title: 'Test',
          userId: 'user-1',
          albumId: 'album-1',
          duration: 180,
          fileUrl: 'https://example.com/track.mp3',
          status: 'draft',
          quality: 'high',
        };

        expect(isTrackPlayable(track)).toBe(false);
      });

      it('should return false for track without fileUrl', () => {
        const track = {
          id: 'track-123',
          title: 'Test',
          userId: 'user-1',
          albumId: 'album-1',
          duration: 180,
          fileUrl: '',
          status: 'active',
          quality: 'high',
        } as Track;

        expect(isTrackPlayable(track)).toBe(false);
      });
    });

    describe('formatDuration', () => {
      it('should format seconds to mm:ss', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(30)).toBe('0:30');
        expect(formatDuration(60)).toBe('1:00');
        expect(formatDuration(90)).toBe('1:30');
        expect(formatDuration(180)).toBe('3:00');
        expect(formatDuration(305)).toBe('5:05');
      });
    });
  });

  describe('Regression Tests', () => {
    it('should catch missing id field', () => {
      const invalidTrack = {
        title: 'My Song',
        userId: 'user-456',
        albumId: 'album-789',
        duration: 180,
        fileUrl: 'https://example.com/track.mp3',
        status: 'active',
        quality: 'high',
      };

      const result = TrackSchema.safeParse(invalidTrack);
      expect(result.success).toBe(false);
    });

    it('should catch missing ServiceResponse wrapper', () => {
      const unwrapped = {
        id: 'track-123',
        title: 'My Song',
        userId: 'user-456',
        albumId: 'album-789',
        duration: 180,
        fileUrl: 'https://example.com/track.mp3',
        status: 'active',
        quality: 'high',
      };

      const result = TrackResponseSchema.safeParse(unwrapped);
      expect(result.success).toBe(false);
    });
  });
});
