import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));
vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: class DomainError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('@config/service-urls', () => ({
  getLogger: () => mockLogger,
}));

vi.mock('@schema/music-schema', () => ({
  tracks: {
    id: 'id',
    title: 'title',
    userId: 'user_id',
    duration: 'duration',
    fileUrl: 'file_url',
    artworkUrl: 'artwork_url',
    lyricsId: 'lyrics_id',
    hasSyncedLyrics: 'has_synced_lyrics',
    genres: 'genres',
    tags: 'tags',
    language: 'language',
    createdAt: 'created_at',
    playCount: 'play_count',
    metadata: 'metadata',
    status: 'status',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  or: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  CACHE: { MAX_SIZE: 100 },
  APP: { DEFAULT_DISPLAY_NAME: 'Artist' },
  LIBRARY_SOURCE: { SHARED: 'shared', PRIVATE: 'private', ALL: 'all' },
  CONTENT_VISIBILITY: { PERSONAL: 'personal', SHARED: 'shared' },
  TRACK_LIFECYCLE: { PUBLISHED: 'published', ACTIVE: 'active' },
}));

vi.mock('../../application/utils/url-utils', () => ({
  toAbsoluteUrl: (url: string | null) => url || undefined,
}));

const mockGetDatabase = vi.fn();
vi.mock('@infrastructure/database/DatabaseConnectionFactory', () => ({
  getDatabase: () => mockGetDatabase(),
}));

import {
  GetUserLibraryUseCase,
  clearLibraryCache,
  invalidateUserLibraryCache,
} from '../../application/use-cases/library/GetUserLibraryUseCase';
import { LibraryError } from '../../application/errors';

describe('GetUserLibraryUseCase', () => {
  let useCase: GetUserLibraryUseCase;

  const createMockDb = () => {
    const mockOffset = vi.fn().mockResolvedValue([]);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockImplementation(() => ({
      orderBy: mockOrderBy,
    }));
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const mockCountWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere });
    const mockCountSelect = vi.fn().mockReturnValue({ from: mockCountFrom });

    let callCount = 0;
    return {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockCountSelect();
        }
        return mockSelect();
      }),
      execute: vi.fn(),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearLibraryCache();
    useCase = new GetUserLibraryUseCase();
    mockGetDatabase.mockReturnValue(createMockDb());
  });

  describe('Happy path', () => {
    it('should return library response for user', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.userId).toBe('user-1');
      expect(result.source).toBe('shared');
      expect(result.items).toEqual([]);
      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalFavorites).toBe(0);
    });

    it('should return library with correct section', async () => {
      const result = await useCase.execute({ userId: 'user-1', section: 'recent' });

      expect(result.section).toBe('recent');
    });

    it('should default source to shared', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.source).toBe('shared');
    });
  });

  describe('Cache behavior', () => {
    it('should clear user cache without error', () => {
      expect(() => useCase.clearUserCache('user-1')).not.toThrow();
    });

    it('should invalidate user library cache without error', () => {
      expect(() => invalidateUserLibraryCache('user-1')).not.toThrow();
    });

    it('should clear entire library cache without error', () => {
      expect(() => clearLibraryCache()).not.toThrow();
    });

    it('should return cached result on second call', async () => {
      const result1 = await useCase.execute({ userId: 'user-1' });
      const result2 = await useCase.execute({ userId: 'user-1' });

      expect(result1).toEqual(result2);
    });
  });

  describe('Service failures', () => {
    it('should throw LibraryError when database query fails', async () => {
      mockGetDatabase.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      await expect(useCase.execute({ userId: 'user-1' })).rejects.toThrow(LibraryError);
    });

    it('should throw LibraryError with wrapped message', async () => {
      mockGetDatabase.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      try {
        await useCase.execute({ userId: 'user-1' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LibraryError);
        expect(error.message).toContain('Connection refused');
      }
    });
  });
});
