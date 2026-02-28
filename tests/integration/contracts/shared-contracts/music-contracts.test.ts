/**
 * Music API Contract Tests
 *
 * Validates that music generation API contracts work correctly
 * and can detect common API response mismatches.
 */

import { describe, it, expect } from 'vitest';

import {
  SongRequestProgressSchema,
  SongGenerationRequestSchema,
  SongGenerationResponseSchema,
  SongProgressResponseSchema,
  validateSongGenerationResponse,
  validateSongProgressResponse,
  extractSongProgressFromResponse,
  isSongGenerationSuccess,
  getRequestIdFromResponse,
  CONTENT_VISIBILITY,
  type SongRequestProgress,
  type SongGenerationResponse,
  type SongProgressResponse,
} from '@aiponge/shared-contracts';

describe('Music API Contracts', () => {
  describe('SongRequestProgressSchema', () => {
    it('should validate a complete song request progress object', () => {
      const progress: SongRequestProgress = {
        id: 'req-123',
        userId: 'user-456',
        entryId: 'entry-789',
        status: 'processing',
        phase: 'generating_music',
        percentComplete: 65,
        visibility: CONTENT_VISIBILITY.PERSONAL,
        trackId: null,
        trackTitle: null,
        artworkUrl: 'https://example.com/art.jpg',
        streamingUrl: null,
        lyrics: 'Some lyrics here',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:05:00.000Z',
        startedAt: '2025-01-15T10:00:30.000Z',
        completedAt: null,
      };

      const result = SongRequestProgressSchema.safeParse(progress);
      expect(result.success).toBe(true);
    });

    it('should validate minimal required fields', () => {
      const minimalProgress = {
        id: 'req-123',
        userId: 'user-456',
        status: 'queued',
        phase: 'queued',
        percentComplete: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      };

      const result = SongRequestProgressSchema.safeParse(minimalProgress);
      expect(result.success).toBe(true);
    });

    it('should validate completed song with track details', () => {
      const completedProgress = {
        id: 'req-123',
        userId: 'user-456',
        status: 'completed',
        phase: 'completed',
        percentComplete: 100,
        trackId: 'track-001',
        trackTitle: 'My Generated Song',
        artworkUrl: 'https://cdn.example.com/artwork.jpg',
        streamingUrl: 'https://cdn.example.com/song.mp3',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:10:00.000Z',
        completedAt: '2025-01-15T10:10:00.000Z',
      };

      const result = SongRequestProgressSchema.safeParse(completedProgress);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.trackId).toBe('track-001');
        expect(result.data.trackTitle).toBe('My Generated Song');
      }
    });

    it('should validate failed song with error message', () => {
      const failedProgress = {
        id: 'req-123',
        userId: 'user-456',
        status: 'failed',
        phase: 'failed',
        percentComplete: 45,
        errorMessage: 'Music generation failed: Provider timeout',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:05:00.000Z',
      };

      const result = SongRequestProgressSchema.safeParse(failedProgress);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.errorMessage).toBe('Music generation failed: Provider timeout');
      }
    });

    it('should reject Date objects for timestamps (must be ISO strings)', () => {
      const progressWithDates = {
        id: 'req-123',
        userId: 'user-456',
        status: 'processing',
        phase: 'generating_lyrics',
        percentComplete: 25,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = SongRequestProgressSchema.safeParse(progressWithDates);
      expect(result.success).toBe(false);
    });
  });

  describe('SongGenerationRequestSchema', () => {
    it('should validate a complete generation request', () => {
      const request = {
        entryId: '550e8400-e29b-41d4-a716-446655440000',
        lyricsId: '550e8400-e29b-41d4-a716-446655440001',
        entryContent: 'Today I felt happy about my progress...',
        genre: 'pop',
        mood: 'uplifting',
        style: 'acoustic',
        language: 'en',
        title: 'My Journey',
        customInstructions: 'Keep it simple and warm',
        useCredits: true,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = SongGenerationRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate minimal request with just text', () => {
      const minimalRequest = {
        entryContent: 'Some text to generate music from',
      };

      const result = SongGenerationRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
    });

    it('should validate request with image context', () => {
      const requestWithImage = {
        artworkUrl: 'https://example.com/photo.jpg',
        pictureContext: 'A sunset over the ocean',
        mood: 'peaceful',
      };

      const result = SongGenerationRequestSchema.safeParse(requestWithImage);
      expect(result.success).toBe(true);
    });
  });

  describe('SongGenerationResponseSchema', () => {
    it('should validate successful generation response', () => {
      const successResponse = {
        success: true,
        data: {
          requestId: 'req-123',
          status: 'processing',
          message: 'Song generation started',
          creditsUsed: 1,
          creditsRemaining: 9,
        },
      };

      const result = SongGenerationResponseSchema.safeParse(successResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
      }
    });

    it('should validate error response with ServiceError structure', () => {
      const errorResponse = {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          code: 'INSUFFICIENT_CREDITS',
          message: 'Insufficient credits',
        },
      };

      const result = SongGenerationResponseSchema.safeParse(errorResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(false);
      }
    });

    it('should detect invalid response structure', () => {
      const invalidResponse = {
        requestId: 'req-123',
        status: 'processing',
      };

      const result = SongGenerationResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('SongProgressResponseSchema', () => {
    it('should validate success response with progress data', () => {
      const response = {
        success: true,
        data: {
          id: 'req-123',
          userId: 'user-456',
          status: 'processing',
          phase: 'generating_artwork',
          percentComplete: 50,
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:05:00.000Z',
        },
      };

      const result = SongProgressResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate success response with null data (no active request)', () => {
      const response = {
        success: true,
        data: null,
        message: 'No active song generation',
      };

      const result = SongProgressResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response with ServiceError structure', () => {
      const errorResponse = {
        success: false,
        error: {
          type: 'NOT_FOUND',
          code: 'REQUEST_NOT_FOUND',
          message: 'Song request not found',
        },
      };

      const result = SongProgressResponseSchema.safeParse(errorResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('Validation Helper Functions', () => {
    describe('validateSongGenerationResponse', () => {
      it('should return valid for correct response', () => {
        const response = {
          success: true,
          data: {
            requestId: 'req-123',
            status: 'processing',
          },
        };

        const result = validateSongGenerationResponse(response);
        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should return invalid for malformed response', () => {
        const malformed = { foo: 'bar' };
        const result = validateSongGenerationResponse(malformed);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('validateSongProgressResponse', () => {
      it('should return valid for correct response', () => {
        const response = {
          success: true,
          data: {
            id: 'req-123',
            userId: 'user-456',
            status: 'completed',
            phase: 'completed',
            percentComplete: 100,
            createdAt: '2025-01-15T10:00:00.000Z',
            updatedAt: '2025-01-15T10:10:00.000Z',
          },
        };

        const result = validateSongProgressResponse(response);
        expect(result.valid).toBe(true);
      });
    });

    describe('extractSongProgressFromResponse', () => {
      it('should extract progress from valid response', () => {
        const response = {
          success: true,
          data: {
            id: 'req-123',
            userId: 'user-456',
            status: 'processing',
            phase: 'generating_music',
            percentComplete: 75,
            createdAt: '2025-01-15T10:00:00.000Z',
            updatedAt: '2025-01-15T10:05:00.000Z',
          },
        };

        const progress = extractSongProgressFromResponse(response);
        expect(progress).not.toBeNull();
        expect(progress?.id).toBe('req-123');
        expect(progress?.percentComplete).toBe(75);
      });

      it('should return null for error response', () => {
        const errorResponse = {
          success: false,
        };

        const progress = extractSongProgressFromResponse(errorResponse);
        expect(progress).toBeNull();
      });

      it('should return null for null data', () => {
        const nullDataResponse = {
          success: true,
          data: null,
        };

        const progress = extractSongProgressFromResponse(nullDataResponse);
        expect(progress).toBeNull();
      });
    });

    describe('isSongGenerationSuccess', () => {
      it('should return true for success response', () => {
        const response: SongGenerationResponse = {
          success: true,
          data: {
            requestId: 'req-123',
            status: 'processing',
          },
        };

        expect(isSongGenerationSuccess(response)).toBe(true);
      });

      it('should return false for error response', () => {
        const response: SongGenerationResponse = {
          success: false,
        };

        expect(isSongGenerationSuccess(response)).toBe(false);
      });
    });

    describe('getRequestIdFromResponse', () => {
      it('should extract requestId from success response', () => {
        const response = {
          success: true,
          data: {
            requestId: 'req-abc-123',
            status: 'processing',
          },
        };

        expect(getRequestIdFromResponse(response)).toBe('req-abc-123');
      });

      it('should return null for error response', () => {
        const response = {
          success: false,
        };

        expect(getRequestIdFromResponse(response)).toBeNull();
      });

      it('should return null for invalid response', () => {
        expect(getRequestIdFromResponse(null)).toBeNull();
        expect(getRequestIdFromResponse(undefined)).toBeNull();
        expect(getRequestIdFromResponse({ foo: 'bar' })).toBeNull();
      });
    });
  });

  describe('Regression Tests', () => {
    it('should catch missing required fields in progress', () => {
      const incompleteProgress = {
        id: 'req-123',
        status: 'processing',
      };

      const result = SongRequestProgressSchema.safeParse(incompleteProgress);
      expect(result.success).toBe(false);
    });

    it('should catch ServiceResponse wrapper mismatch', () => {
      const unwrappedResponse = {
        id: 'req-123',
        userId: 'user-456',
        status: 'completed',
        phase: 'completed',
        percentComplete: 100,
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      };

      const result = SongProgressResponseSchema.safeParse(unwrappedResponse);
      expect(result.success).toBe(false);
    });

    it('should catch wrong success field type', () => {
      const wrongType = {
        success: 'true',
        data: {
          requestId: 'req-123',
          status: 'processing',
        },
      };

      const result = SongGenerationResponseSchema.safeParse(wrongType);
      expect(result.success).toBe(false);
    });
  });
});
