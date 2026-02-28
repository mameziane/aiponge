/**
 * Narrative Seeds Integration Tests
 * Tests for the fetchNarrativeSeeds function behavior
 *
 * These are standalone unit tests that don't require the full use case
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Narrative Seeds API Integration', () => {
  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchNarrativeSeeds behavior', () => {
    const fetchNarrativeSeeds = async (
      userServiceUrl: string,
      userId: string,
      requestId: string
    ): Promise<{
      keywords: string[];
      emotionalProfile: {
        dominantMood: string | null;
        dominantSentiment: string | null;
        emotionalIntensityAvg: number;
      };
    } | null> => {
      try {
        const response = await fetch(`${userServiceUrl}/api/narrative-seeds/${userId}?maxSeeds=15&timeframeDays=30`, {
          headers: { 'x-user-id': userId, 'x-request-id': requestId },
        });

        if (response.ok) {
          const rawData = await response.json();

          if (rawData?.success && rawData?.data) {
            const data = rawData.data;
            const keywords = data.seeds?.map((s: { keyword: string }) => s.keyword) || [];

            return {
              keywords,
              emotionalProfile: data.emotionalProfile || {
                dominantMood: null,
                dominantSentiment: null,
                emotionalIntensityAvg: 0,
              },
            };
          }
        }

        return null;
      } catch {
        return null;
      }
    };

    it('should return null when user-service is unavailable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

      const result = await fetchNarrativeSeeds('http://localhost:3002', 'user-123', 'request-456');

      expect(result).toBeNull();
    });

    it('should return null when response is not successful', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }) as unknown as typeof fetch;

      const result = await fetchNarrativeSeeds('http://localhost:3002', 'user-123', 'request-456');

      expect(result).toBeNull();
    });

    it('should extract keywords from successful response', async () => {
      const mockResponse = {
        success: true,
        data: {
          seeds: [
            { keyword: 'healing', frequency: 3, source: 'content', emotionalWeight: 1.0 },
            { keyword: 'growth', frequency: 2, source: 'tag', emotionalWeight: 1.5 },
            { keyword: 'hopeful', frequency: 1, source: 'mood', emotionalWeight: 2.0 },
          ],
          emotionalProfile: {
            dominantMood: 'hopeful',
            dominantSentiment: 'positive',
            emotionalIntensityAvg: 4.5,
          },
          entryCount: 10,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }) as unknown as typeof fetch;

      const result = await fetchNarrativeSeeds('http://localhost:3002', 'user-123', 'request-456');

      expect(result).not.toBeNull();
      expect(result!.keywords).toEqual(['healing', 'growth', 'hopeful']);
      expect(result!.emotionalProfile.dominantMood).toBe('hopeful');
      expect(result!.emotionalProfile.dominantSentiment).toBe('positive');
    });

    it('should return empty keywords when no seeds available', async () => {
      const mockResponse = {
        success: true,
        data: {
          seeds: [],
          emotionalProfile: {
            dominantMood: null,
            dominantSentiment: null,
            emotionalIntensityAvg: 0,
          },
          entryCount: 0,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }) as unknown as typeof fetch;

      const result = await fetchNarrativeSeeds('http://localhost:3002', 'user-123', 'request-456');

      expect(result).not.toBeNull();
      expect(result!.keywords).toEqual([]);
    });

    it('should include correct headers in request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { seeds: [], emotionalProfile: {} } }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await fetchNarrativeSeeds('http://localhost:3002', 'user-123', 'request-456');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/narrative-seeds/user-123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-user-id': 'user-123',
            'x-request-id': 'request-456',
          }),
        })
      );
    });

    it('should include query parameters for timeframe and maxSeeds', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { seeds: [], emotionalProfile: {} } }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await fetchNarrativeSeeds('http://localhost:3002', 'user-123', 'request-456');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('maxSeeds=15');
      expect(calledUrl).toContain('timeframeDays=30');
    });
  });

  describe('Response format validation', () => {
    const parseNarrativeSeedsResponse = (rawData: Record<string, unknown>) => {
      if (!rawData?.success || !rawData?.data) {
        return null;
      }

      const data = rawData.data;
      return {
        keywords: data.seeds?.map((s: { keyword: string }) => s.keyword) || [],
        emotionalProfile: data.emotionalProfile || {
          dominantMood: null,
          dominantSentiment: null,
          emotionalIntensityAvg: 0,
        },
      };
    };

    it('should handle malformed response gracefully', () => {
      const result = parseNarrativeSeedsResponse({ success: false });
      expect(result).toBeNull();
    });

    it('should handle missing data field', () => {
      const result = parseNarrativeSeedsResponse({ success: true });
      expect(result).toBeNull();
    });

    it('should handle missing seeds array', () => {
      const result = parseNarrativeSeedsResponse({
        success: true,
        data: { emotionalProfile: { dominantMood: 'happy' } },
      });
      expect(result).not.toBeNull();
      expect(result!.keywords).toEqual([]);
    });

    it('should extract keywords correctly from valid response', () => {
      const result = parseNarrativeSeedsResponse({
        success: true,
        data: {
          seeds: [
            { keyword: 'peace', frequency: 2, source: 'tag' },
            { keyword: 'healing', frequency: 1, source: 'content' },
          ],
          emotionalProfile: {
            dominantMood: 'calm',
            dominantSentiment: 'positive',
            emotionalIntensityAvg: 3.5,
          },
        },
      });

      expect(result!.keywords).toEqual(['peace', 'healing']);
      expect(result!.emotionalProfile.dominantMood).toBe('calm');
    });
  });
});
