/**
 * Lyrics API Contract Tests
 *
 * Validates lyrics API contracts including synced lyrics for karaoke display.
 */

import { describe, it, expect } from 'vitest';

import {
  SyncedLineSchema,
  LyricsSchema,
  UserLyricsSchema,
  LyricsResponseSchema,
  LyricsListResponseSchema,
  GenerateLyricsRequestSchema,
  validateLyricsResponse,
  extractLyricsFromResponse,
  extractSyncedLines,
  hasSyncedLyrics,
  type Lyrics,
  type SyncedLine,
} from '@aiponge/shared-contracts';

describe('Lyrics API Contracts', () => {
  describe('SyncedLineSchema', () => {
    it('should validate synced line with time in seconds', () => {
      const line: SyncedLine = {
        text: 'Hello world',
        startTime: 0,
        endTime: 2.5,
      };

      const result = SyncedLineSchema.safeParse(line);
      expect(result.success).toBe(true);
    });

    it('should validate synced line with time in milliseconds', () => {
      const line: SyncedLine = {
        text: 'Hello world',
        startMs: 0,
        endMs: 2500,
      };

      const result = SyncedLineSchema.safeParse(line);
      expect(result.success).toBe(true);
    });

    it('should validate synced line with type', () => {
      const line = {
        text: '[Verse 1]',
        startTime: 0,
        endTime: 1,
        type: 'section',
      };

      const result = SyncedLineSchema.safeParse(line);
      expect(result.success).toBe(true);
    });

    it('should validate line with just text', () => {
      const line = { text: 'Simple lyrics line' };
      const result = SyncedLineSchema.safeParse(line);
      expect(result.success).toBe(true);
    });
  });

  describe('LyricsSchema', () => {
    it('should validate complete lyrics object', () => {
      const lyrics: Lyrics = {
        id: 'lyrics-123',
        userId: 'user-789',
        content: '[Verse 1]\nHello world\n\n[Chorus]\nLa la la',
        syncedLines: [
          { text: '[Verse 1]', startTime: 0, endTime: 1, type: 'section' },
          { text: 'Hello world', startTime: 1, endTime: 3 },
          { text: '[Chorus]', startTime: 3, endTime: 4, type: 'section' },
          { text: 'La la la', startTime: 4, endTime: 7 },
        ],
        title: 'My Song',
        style: 'pop',
        mood: 'happy',
        language: 'en',
        themes: ['joy', 'celebration'],
        hasStructureTags: true,
        aiProvider: 'openai',
        aiModel: 'gpt-4',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      };

      const result = LyricsSchema.safeParse(lyrics);
      expect(result.success).toBe(true);
    });

    it('should validate minimal lyrics (just id and content)', () => {
      const minimalLyrics = {
        id: 'lyrics-123',
        content: 'Simple song lyrics',
      };

      const result = LyricsSchema.safeParse(minimalLyrics);
      expect(result.success).toBe(true);
    });

    it('should validate lyrics with snake_case synced_lines', () => {
      const lyrics = {
        id: 'lyrics-123',
        content: 'Hello world',
        synced_lines: [{ text: 'Hello world', startTime: 0, endTime: 2 }],
      };

      const result = LyricsSchema.safeParse(lyrics);
      expect(result.success).toBe(true);
    });
  });

  describe('UserLyricsSchema', () => {
    it('should validate user lyrics with userId', () => {
      const userLyrics = {
        id: 'lyrics-123',
        userId: 'user-456',
        content: 'My personal lyrics',
        entryId: 'entry-789',
        title: 'My Poem',
        usageCount: 3,
      };

      const result = UserLyricsSchema.safeParse(userLyrics);
      expect(result.success).toBe(true);
    });
  });

  describe('LyricsResponseSchema', () => {
    it('should validate success response with lyrics', () => {
      const response = {
        success: true,
        data: {
          id: 'lyrics-123',
          content: 'Hello world lyrics',
          syncedLines: [
            { text: 'Hello', startTime: 0, endTime: 1 },
            { text: 'world', startTime: 1, endTime: 2 },
          ],
        },
      };

      const result = LyricsResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: {
          type: 'NOT_FOUND',
          code: 'LYRICS_NOT_FOUND',
          message: 'Lyrics not found',
        },
      };

      const result = LyricsResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('LyricsListResponseSchema', () => {
    it('should validate list of lyrics', () => {
      const response = {
        success: true,
        data: {
          lyrics: [
            { id: 'lyrics-1', content: 'First song' },
            { id: 'lyrics-2', content: 'Second song' },
          ],
          total: 2,
        },
      };

      const result = LyricsListResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('GenerateLyricsRequestSchema', () => {
    it('should validate generation request', () => {
      const request = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        entryId: '550e8400-e29b-41d4-a716-446655440001',
        content: 'Some book entry content',
        style: 'ballad',
        mood: 'reflective',
        language: 'en',
        genre: 'acoustic',
        title: 'My Journey',
      };

      const result = GenerateLyricsRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate minimal request', () => {
      const request = {
        content: 'Generate lyrics from this text',
      };

      const result = GenerateLyricsRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Validation Helpers', () => {
    describe('validateLyricsResponse', () => {
      it('should return valid for correct response', () => {
        const response = {
          success: true,
          data: {
            id: 'lyrics-123',
            content: 'Test lyrics',
          },
        };

        const result = validateLyricsResponse(response);
        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should return invalid for malformed response', () => {
        const malformed = { foo: 'bar' };
        const result = validateLyricsResponse(malformed);
        expect(result.valid).toBe(false);
      });
    });

    describe('extractLyricsFromResponse', () => {
      it('should extract lyrics from valid response', () => {
        const response = {
          success: true,
          data: {
            id: 'lyrics-123',
            content: 'Hello world',
            syncedLines: [{ text: 'Hello', startTime: 0, endTime: 1 }],
          },
        };

        const lyrics = extractLyricsFromResponse(response);
        expect(lyrics).not.toBeNull();
        expect(lyrics?.id).toBe('lyrics-123');
      });

      it('should return null for error response', () => {
        const response = { success: false };
        const lyrics = extractLyricsFromResponse(response);
        expect(lyrics).toBeNull();
      });
    });

    describe('extractSyncedLines', () => {
      it('should extract syncedLines from lyrics', () => {
        const lyrics: Lyrics = {
          id: 'lyrics-123',
          content: 'Hello',
          syncedLines: [{ text: 'Hello', startTime: 0, endTime: 1 }],
        };

        const lines = extractSyncedLines(lyrics);
        expect(lines).toHaveLength(1);
        expect(lines[0].text).toBe('Hello');
      });

      it('should extract synced_lines (snake_case) from lyrics', () => {
        const lyrics: Lyrics = {
          id: 'lyrics-123',
          content: 'Hello',
          synced_lines: [{ text: 'Hello', startTime: 0, endTime: 1 }],
        };

        const lines = extractSyncedLines(lyrics);
        expect(lines).toHaveLength(1);
      });

      it('should return empty array when no synced lines', () => {
        const lyrics: Lyrics = {
          id: 'lyrics-123',
          content: 'Hello',
        };

        const lines = extractSyncedLines(lyrics);
        expect(lines).toEqual([]);
      });
    });

    describe('hasSyncedLyrics', () => {
      it('should return true when lyrics have timing info', () => {
        const lyrics: Lyrics = {
          id: 'lyrics-123',
          content: 'Hello',
          syncedLines: [{ text: 'Hello', startTime: 0, endTime: 1 }],
        };

        expect(hasSyncedLyrics(lyrics)).toBe(true);
      });

      it('should return true for millisecond timing', () => {
        const lyrics: Lyrics = {
          id: 'lyrics-123',
          content: 'Hello',
          syncedLines: [{ text: 'Hello', startMs: 0, endMs: 1000 }],
        };

        expect(hasSyncedLyrics(lyrics)).toBe(true);
      });

      it('should return false when no timing info', () => {
        const lyrics: Lyrics = {
          id: 'lyrics-123',
          content: 'Hello',
          syncedLines: [{ text: 'Hello' }],
        };

        expect(hasSyncedLyrics(lyrics)).toBe(false);
      });

      it('should return false when no synced lines', () => {
        const lyrics: Lyrics = {
          id: 'lyrics-123',
          content: 'Hello',
        };

        expect(hasSyncedLyrics(lyrics)).toBe(false);
      });
    });
  });

  describe('Regression Tests', () => {
    it('should catch missing content field', () => {
      const invalidLyrics = {
        id: 'lyrics-123',
      };

      const result = LyricsSchema.safeParse(invalidLyrics);
      expect(result.success).toBe(false);
    });

    it('should catch missing ServiceResponse wrapper', () => {
      const unwrapped = {
        id: 'lyrics-123',
        content: 'Hello world',
      };

      const result = LyricsResponseSchema.safeParse(unwrapped);
      expect(result.success).toBe(false);
    });
  });
});
