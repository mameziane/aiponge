import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../utils/timeUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/timeUtils')>();
  return actual;
});

vi.mock('../../lib/apiConfig', () => ({
  getApiGatewayUrl: vi.fn(() => 'http://localhost:8080'),
  normalizeMediaUrl: vi.fn((url: string | null | undefined) => url || undefined),
}));

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../constants/appConfig', () => ({
  CONFIG: { app: { defaultDisplayName: 'You' } },
}));

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'mock-id') }));

import { getRelativeTimeString } from '../../utils/timeUtils';
import {
  formatTrackDuration,
  buildPlaybackTrack,
  buildPlaybackTracks,
  buildRelativeTimestamp,
  getArtworkStats,
  shuffleArray,
  getNextTrack,
  getPreviousTrack,
} from '../../utils/trackUtils';
import {
  isBackendError,
  parseBackendError,
  serializeError,
  getTranslatedFriendlyMessage,
  checkIsBackendUnavailable,
  logError,
} from '../../utils/errorSerialization';
import { logger } from '../../lib/logger';

describe('timeUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRelativeTimeString', () => {
    it('returns "just now" for less than 60 seconds ago', () => {
      expect(getRelativeTimeString('2025-06-15T11:59:30Z')).toBe('just now');
    });

    it('returns "just now" for 0 seconds ago', () => {
      expect(getRelativeTimeString('2025-06-15T12:00:00Z')).toBe('just now');
    });

    it('returns "1 min ago" for exactly 60 seconds', () => {
      expect(getRelativeTimeString('2025-06-15T11:59:00Z')).toBe('1 min ago');
    });

    it('returns "59 min ago" for 59 minutes', () => {
      expect(getRelativeTimeString('2025-06-15T11:01:00Z')).toBe('59 min ago');
    });

    it('returns "1 hour ago" for exactly 1 hour (singular)', () => {
      expect(getRelativeTimeString('2025-06-15T11:00:00Z')).toBe('1 hour ago');
    });

    it('returns "2 hours ago" for 2 hours (plural)', () => {
      expect(getRelativeTimeString('2025-06-15T10:00:00Z')).toBe('2 hours ago');
    });

    it('returns "23 hours ago" for 23 hours', () => {
      expect(getRelativeTimeString('2025-06-14T13:00:00Z')).toBe('23 hours ago');
    });

    it('returns "1 day ago" for exactly 1 day (singular)', () => {
      expect(getRelativeTimeString('2025-06-14T12:00:00Z')).toBe('1 day ago');
    });

    it('returns "6 days ago" for 6 days (plural)', () => {
      expect(getRelativeTimeString('2025-06-09T12:00:00Z')).toBe('6 days ago');
    });

    it('returns "1 week ago" for exactly 7 days (singular)', () => {
      expect(getRelativeTimeString('2025-06-08T12:00:00Z')).toBe('1 week ago');
    });

    it('returns "3 weeks ago" for 21 days (plural)', () => {
      expect(getRelativeTimeString('2025-05-25T12:00:00Z')).toBe('3 weeks ago');
    });

    it('returns "1 month ago" for ~30 days (singular)', () => {
      expect(getRelativeTimeString('2025-05-16T12:00:00Z')).toBe('1 month ago');
    });

    it('returns "11 months ago" for ~330 days (plural)', () => {
      expect(getRelativeTimeString('2024-07-16T12:00:00Z')).toBe('11 months ago');
    });

    it('returns "1 year ago" for exactly 365 days (singular)', () => {
      expect(getRelativeTimeString('2024-06-15T12:00:00Z')).toBe('1 year ago');
    });

    it('returns "2 years ago" for 730 days (plural)', () => {
      expect(getRelativeTimeString('2023-06-16T12:00:00Z')).toBe('2 years ago');
    });

    it('returns empty string for invalid date', () => {
      expect(getRelativeTimeString('not-a-date')).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(getRelativeTimeString('')).toBe('');
    });
  });
});

describe('trackUtils', () => {
  describe('formatTrackDuration', () => {
    it('returns "--:--" for null', () => {
      expect(formatTrackDuration(null)).toBe('--:--');
    });

    it('returns "--:--" for undefined', () => {
      expect(formatTrackDuration(undefined)).toBe('--:--');
    });

    it('returns "--:--" for 0', () => {
      expect(formatTrackDuration(0)).toBe('--:--');
    });

    it('returns "--:--" for negative number', () => {
      expect(formatTrackDuration(-5)).toBe('--:--');
    });

    it('returns "--:--" for Infinity', () => {
      expect(formatTrackDuration(Infinity)).toBe('--:--');
    });

    it('returns "--:--" for NaN', () => {
      expect(formatTrackDuration(NaN)).toBe('--:--');
    });

    it('returns "0:05" for 5 seconds', () => {
      expect(formatTrackDuration(5)).toBe('0:05');
    });

    it('returns "1:00" for 60 seconds', () => {
      expect(formatTrackDuration(60)).toBe('1:00');
    });

    it('returns "3:25" for 205 seconds', () => {
      expect(formatTrackDuration(205)).toBe('3:25');
    });

    it('returns "10:00" for 600 seconds', () => {
      expect(formatTrackDuration(600)).toBe('10:00');
    });
  });

  describe('buildPlaybackTrack', () => {
    it('returns null when audioUrl is missing', () => {
      expect(buildPlaybackTrack({ id: '1' })).toBeNull();
    });

    it('returns null when audioUrl is null', () => {
      expect(buildPlaybackTrack({ id: '1', audioUrl: null })).toBeNull();
    });

    it('returns null when audioUrl is empty string', () => {
      expect(buildPlaybackTrack({ id: '1', audioUrl: '' })).toBeNull();
    });

    it('returns PlayableTrack with normalized URLs', () => {
      const result = buildPlaybackTrack({
        id: '1',
        audioUrl: 'http://example.com/audio.mp3',
        title: 'My Song',
        displayName: 'Artist',
        artworkUrl: 'http://example.com/art.jpg',
        duration: 120,
      });

      expect(result).toEqual({
        id: '1',
        audioUrl: 'http://example.com/audio.mp3',
        title: 'My Song',
        displayName: 'Artist',
        artworkUrl: 'http://example.com/art.jpg',
        duration: 120,
        lyricsId: undefined,
        hasSyncedLyrics: undefined,
      });
    });

    it('defaults title to "Unknown Track"', () => {
      const result = buildPlaybackTrack({ id: '1', audioUrl: 'http://a.com/a.mp3' });
      expect(result?.title).toBe('Unknown Track');
    });

    it('defaults displayName to CONFIG default ("You")', () => {
      const result = buildPlaybackTrack({ id: '1', audioUrl: 'http://a.com/a.mp3' });
      expect(result?.displayName).toBe('You');
    });

    it('defaults duration to 0', () => {
      const result = buildPlaybackTrack({ id: '1', audioUrl: 'http://a.com/a.mp3' });
      expect(result?.duration).toBe(0);
    });

    it('sets artworkUrl to undefined when null', () => {
      const result = buildPlaybackTrack({ id: '1', audioUrl: 'http://a.com/a.mp3', artworkUrl: null });
      expect(result?.artworkUrl).toBeUndefined();
    });
  });

  describe('buildPlaybackTracks', () => {
    it('filters out tracks without audio', () => {
      const tracks = [
        { id: '1', audioUrl: 'http://a.com/a.mp3' },
        { id: '2' },
        { id: '3', audioUrl: null },
      ];
      const result = buildPlaybackTracks(tracks);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('maps valid tracks to PlayableTrack format', () => {
      const tracks = [
        { id: '1', audioUrl: 'http://a.com/a.mp3', title: 'Song A' },
        { id: '2', audioUrl: 'http://a.com/b.mp3', title: 'Song B' },
      ];
      const result = buildPlaybackTracks(tracks);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Song A');
      expect(result[1].title).toBe('Song B');
    });

    it('returns empty array for empty input', () => {
      expect(buildPlaybackTracks([])).toEqual([]);
    });
  });

  describe('buildRelativeTimestamp', () => {
    it('delegates to getRelativeTimeString', () => {
      const result = buildRelativeTimestamp('2025-06-15T12:00:00Z');
      expect(typeof result).toBe('string');
    });
  });

  describe('getArtworkStats', () => {
    it('counts correctly with mixed artwork', () => {
      const tracks = [
        { artworkUrl: 'http://a.com/1.jpg' },
        { artworkUrl: '' },
        { artworkUrl: 'http://a.com/2.jpg' },
        {},
      ];
      const stats = getArtworkStats(tracks);
      expect(stats.totalTracks).toBe(4);
      expect(stats.withArtwork).toBe(2);
      expect(stats.withoutArtwork).toBe(2);
    });

    it('handles empty array', () => {
      const stats = getArtworkStats([]);
      expect(stats.totalTracks).toBe(0);
      expect(stats.withArtwork).toBe(0);
      expect(stats.withoutArtwork).toBe(0);
    });

    it('handles all with artwork', () => {
      const tracks = [{ artworkUrl: 'a' }, { artworkUrl: 'b' }];
      const stats = getArtworkStats(tracks);
      expect(stats.withArtwork).toBe(2);
      expect(stats.withoutArtwork).toBe(0);
    });
  });

  describe('shuffleArray', () => {
    it('returns a new array (not same reference)', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffleArray(arr);
      expect(result).not.toBe(arr);
    });

    it('returns same length', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(shuffleArray(arr)).toHaveLength(5);
    });

    it('contains same elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffleArray(arr);
      expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('does not modify original array', () => {
      const arr = [1, 2, 3, 4, 5];
      const copy = [...arr];
      shuffleArray(arr);
      expect(arr).toEqual(copy);
    });

    it('handles empty array', () => {
      expect(shuffleArray([])).toEqual([]);
    });

    it('handles single element', () => {
      expect(shuffleArray([42])).toEqual([42]);
    });
  });

  describe('getNextTrack', () => {
    const tracks = [
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ];

    it('returns null for empty tracks', () => {
      expect(getNextTrack([], null, false, 'off')).toBeNull();
    });

    it('returns first track when no current track', () => {
      expect(getNextTrack(tracks, null, false, 'off')).toEqual({ id: '1' });
    });

    it('returns next track sequentially', () => {
      expect(getNextTrack(tracks, tracks[0], false, 'off')).toEqual({ id: '2' });
      expect(getNextTrack(tracks, tracks[1], false, 'off')).toEqual({ id: '3' });
    });

    it('returns null at end with repeatMode="off"', () => {
      expect(getNextTrack(tracks, tracks[2], false, 'off')).toBeNull();
    });

    it('wraps around with repeatMode="all"', () => {
      expect(getNextTrack(tracks, tracks[2], false, 'all')).toEqual({ id: '1' });
    });

    it('returns same track with repeatMode="one"', () => {
      expect(getNextTrack(tracks, tracks[1], false, 'one')).toEqual({ id: '2' });
    });
  });

  describe('getPreviousTrack', () => {
    const tracks = [
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ];

    it('returns null for empty tracks', () => {
      expect(getPreviousTrack([], null, false, 'off')).toBeNull();
    });

    it('returns last track when no current track', () => {
      expect(getPreviousTrack(tracks, null, false, 'off')).toEqual({ id: '3' });
    });

    it('returns previous track sequentially', () => {
      expect(getPreviousTrack(tracks, tracks[2], false, 'off')).toEqual({ id: '2' });
      expect(getPreviousTrack(tracks, tracks[1], false, 'off')).toEqual({ id: '1' });
    });

    it('returns null at beginning with repeatMode="off"', () => {
      expect(getPreviousTrack(tracks, tracks[0], false, 'off')).toBeNull();
    });

    it('wraps around with repeatMode="all"', () => {
      expect(getPreviousTrack(tracks, tracks[0], false, 'all')).toEqual({ id: '3' });
    });

    it('returns same track with repeatMode="one"', () => {
      expect(getPreviousTrack(tracks, tracks[1], false, 'one')).toEqual({ id: '2' });
    });
  });
});

describe('errorSerialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeBackendError = (overrides = {}) => ({
    response: {
      data: {
        success: false as const,
        error: {
          type: 'ValidationError',
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          ...overrides,
        },
        timestamp: '2025-06-15T12:00:00Z',
      },
      status: 400,
    },
  });

  describe('isBackendError', () => {
    it('returns true for valid backend error structure', () => {
      expect(isBackendError(makeBackendError())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isBackendError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isBackendError(undefined)).toBe(false);
    });

    it('returns false for plain Error', () => {
      expect(isBackendError(new Error('test'))).toBe(false);
    });

    it('returns false for object without response', () => {
      expect(isBackendError({ message: 'test' })).toBe(false);
    });

    it('returns false for object with response but no data', () => {
      expect(isBackendError({ response: {} })).toBe(false);
    });

    it('returns false when success is not false', () => {
      expect(isBackendError({
        response: { data: { success: true, error: { code: 'X' }, timestamp: '' } },
      })).toBe(false);
    });

    it('returns false when error.code is missing', () => {
      expect(isBackendError({
        response: { data: { success: false, error: { type: 'X', message: 'Z' }, timestamp: '' } },
      })).toBe(false);
    });
  });

  describe('parseBackendError', () => {
    it('returns response data for valid backend error', () => {
      const err = makeBackendError();
      const result = parseBackendError(err);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('throws for non-backend error', () => {
      expect(() => parseBackendError(new Error('test'))).toThrow('Not a backend error response');
    });

    it('throws for null', () => {
      expect(() => parseBackendError(null)).toThrow('Not a backend error response');
    });
  });

  describe('serializeError', () => {
    it('handles backend errors', () => {
      const err = makeBackendError({ field: 'email', details: { min: 3 } });
      const result = serializeError(err, '/api/test', 'corr-1');

      expect(result.name).toBe('ValidationError');
      expect(result.message).toBe('Invalid input');
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.statusCode).toBe(400);
      expect(result.field).toBe('email');
      expect(result.details).toEqual({ min: 3 });
      expect(result.url).toBe('/api/test');
    });

    it('handles standard Error objects', () => {
      const err = new Error('Something broke');
      err.name = 'TypeError';
      const result = serializeError(err);

      expect(result.name).toBe('TypeError');
      expect(result.message).toBe('Something broke');
      expect(result.stack).toBeDefined();
      expect(Array.isArray(result.stack)).toBe(true);
      expect(result.stack!.length).toBeLessThanOrEqual(5);
    });

    it('truncates stack to 5 lines', () => {
      const err = new Error('test');
      err.stack = 'line1\nline2\nline3\nline4\nline5\nline6\nline7';
      const result = serializeError(err);
      expect(result.stack).toHaveLength(5);
    });

    it('includes correlationId on standard errors', () => {
      const result = serializeError(new Error('test'), '/url', 'abc-123');
      expect(result.correlationId).toBe('abc-123');
      expect(result.url).toBe('/url');
    });

    it('handles HTTP errors with response but not backend format', () => {
      const err = {
        response: {
          data: { error: { message: 'Bad request' } },
          status: 400,
        },
        message: 'Request failed',
        config: { url: '/api/foo' },
      };
      const result = serializeError(err);

      expect(result.name).toBe('HTTPError');
      expect(result.message).toBe('Bad request');
      expect(result.statusCode).toBe(400);
      expect(result.url).toBe('/api/foo');
    });

    it('handles generic objects with message', () => {
      const err = { message: 'custom error', name: 'CustomError', code: 'CUSTOM' };
      const result = serializeError(err);

      expect(result.name).toBe('CustomError');
      expect(result.message).toBe('custom error');
      expect(result.code).toBe('CUSTOM');
    });

    it('handles unknown error types (string)', () => {
      const result = serializeError('something went wrong');
      expect(result.name).toBe('UnknownError');
      expect(result.message).toBe('something went wrong');
    });

    it('handles unknown error types (number)', () => {
      const result = serializeError(42);
      expect(result.name).toBe('UnknownError');
      expect(result.message).toBe('42');
    });

    it('uses backend correlationId over provided one', () => {
      const err = {
        response: {
          data: {
            success: false,
            error: { type: 'X', code: 'Y', message: 'Z' },
            timestamp: '2025-01-01',
            correlationId: 'backend-corr',
          },
          status: 500,
        },
      };
      const result = serializeError(err, undefined, 'provided-corr');
      expect(result.correlationId).toBe('backend-corr');
    });
  });

  describe('getTranslatedFriendlyMessage', () => {
    const mockT = vi.fn((key: string, fallback?: string) => `translated:${key}`);

    beforeEach(() => {
      mockT.mockClear();
      mockT.mockImplementation((key: string) => `translated:${key}`);
    });

    it('maps NOT_AUTHENTICATED to errors.pleaseLogin', () => {
      const result = getTranslatedFriendlyMessage({ name: 'Error', message: 'Auth fail', code: 'NOT_AUTHENTICATED' }, mockT);
      expect(mockT).toHaveBeenCalledWith('errors.pleaseLogin', expect.objectContaining({ defaultValue: expect.any(String) }));
      expect(result).toBe('translated:errors.pleaseLogin');
    });

    it('maps INVALID_TOKEN to errors.sessionExpired', () => {
      getTranslatedFriendlyMessage({ name: 'Error', message: 'expired', code: 'INVALID_TOKEN' }, mockT);
      expect(mockT).toHaveBeenCalledWith('errors.sessionExpired', expect.objectContaining({ defaultValue: expect.any(String) }));
    });

    it('maps INSUFFICIENT_PERMISSIONS to errors.noPermission', () => {
      getTranslatedFriendlyMessage({ name: 'Error', message: 'denied', code: 'INSUFFICIENT_PERMISSIONS' }, mockT);
      expect(mockT).toHaveBeenCalledWith('errors.noPermission', expect.objectContaining({ defaultValue: expect.any(String) }));
    });

    it('maps NOT_FOUND to errors.notFound', () => {
      getTranslatedFriendlyMessage({ name: 'Error', message: 'missing', code: 'NOT_FOUND' }, mockT);
      expect(mockT).toHaveBeenCalledWith('errors.notFound', expect.objectContaining({ defaultValue: expect.any(String) }));
    });

    it('maps RATE_LIMIT_EXCEEDED to errors.rateLimitExceeded', () => {
      getTranslatedFriendlyMessage({ name: 'Error', message: 'slow down', code: 'RATE_LIMIT_EXCEEDED' }, mockT);
      expect(mockT).toHaveBeenCalledWith('errors.rateLimitExceeded', expect.objectContaining({ defaultValue: expect.any(String) }));
    });

    it('returns translation for 5xx errors', () => {
      const result = getTranslatedFriendlyMessage({ name: 'Error', message: 'Server error', statusCode: 500 }, mockT);
      expect(mockT).toHaveBeenCalledWith('errors.serviceUnavailable', expect.objectContaining({ defaultValue: expect.any(String) }));
      expect(result).toBe('translated:errors.serviceUnavailable');
    });

    it('returns original message for 4xx without specific code', () => {
      const result = getTranslatedFriendlyMessage({ name: 'Error', message: 'Bad request', statusCode: 400 }, mockT);
      expect(result).toBe('Bad request');
    });

    it('returns generic translation when no status and no code', () => {
      const result = getTranslatedFriendlyMessage({ name: 'Error', message: 'something' }, mockT);
      expect(mockT).toHaveBeenCalledWith('errors.connectionFailed', expect.objectContaining({ defaultValue: expect.any(String) }));
    });
  });

  describe('checkIsBackendUnavailable', () => {
    it('returns true for 502 status', () => {
      const err = { response: { status: 502, data: {} }, message: 'Bad Gateway' };
      expect(checkIsBackendUnavailable(err)).toBe(true);
    });

    it('returns true for 503 status', () => {
      const err = { response: { status: 503, data: {} }, message: 'Service Unavailable' };
      expect(checkIsBackendUnavailable(err)).toBe(true);
    });

    it('returns true for ECONNREFUSED in message', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      expect(checkIsBackendUnavailable(err)).toBe(true);
    });

    it('returns true for network error', () => {
      const err = new Error('Network Error');
      expect(checkIsBackendUnavailable(err)).toBe(true);
    });

    it('returns false for 404', () => {
      const err = { response: { status: 404, data: {} }, message: 'Not found' };
      expect(checkIsBackendUnavailable(err)).toBe(false);
    });

    it('returns false for normal Error', () => {
      const err = new Error('Some validation error');
      expect(checkIsBackendUnavailable(err)).toBe(false);
    });

    it('returns true for "failed to fetch"', () => {
      const err = new Error('Failed to fetch');
      expect(checkIsBackendUnavailable(err)).toBe(true);
    });
  });

  describe('logError', () => {
    it('calls logger.warn for network errors (no status)', () => {
      const err = new Error('Network Error');
      logError(err, 'test-context');
      expect(logger.warn).toHaveBeenCalledWith('Network error (no response)', expect.objectContaining({
        context: 'test-context',
      }));
    });

    it('calls logger.error for 5xx errors', () => {
      const err = makeBackendError();
      (err.response as any).status = 500;
      (err.response.data.error as any).code = 'INTERNAL_ERROR';
      logError(err, 'server-ctx');
      expect(logger.error).toHaveBeenCalledWith('Server Error', undefined, expect.objectContaining({
        context: 'server-ctx',
      }));
    });

    it('calls logger.warn for 4xx errors', () => {
      const err = makeBackendError();
      logError(err, 'client-ctx');
      expect(logger.warn).toHaveBeenCalledWith('Client Error', expect.objectContaining({
        context: 'client-ctx',
      }));
    });

    it('suppresses 404 on /api/v1/auth/me', () => {
      const err = { response: { data: { error: { message: 'Not found' } }, status: 404 }, message: 'Not found' };
      logError(err, 'auth', '/api/v1/auth/me');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('returns serialized error', () => {
      const err = new Error('test');
      const result = logError(err);
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('message', 'test');
    });

    it('passes correlationId through', () => {
      const err = new Error('test');
      const result = logError(err, 'ctx', '/url', 'req-123');
      expect(result.correlationId).toBe('req-123');
      expect(result.url).toBe('/url');
    });
  });
});
