import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const MockDomainError = vi.hoisted(() => {
  return class DomainError extends Error {
    code: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code || 'UNKNOWN';
      this.name = 'DomainError';
    }
  };
});

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: MockDomainError,
  createHttpClient: vi.fn().mockReturnValue({}),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  errorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
  serializeError: vi.fn((err: unknown) => err),
}));

vi.mock('../../schema/music-schema', () => ({
  favoriteTracks: {
    id: 'id',
    userId: 'userId',
    trackId: 'trackId',
    addedAt: 'addedAt',
    playCount: 'playCount',
    lastPlayedAt: 'lastPlayedAt',
    rating: 'rating',
    notes: 'notes',
    tags: 'tags',
    deletedAt: 'deletedAt',
  },
  favoriteAlbums: {
    id: 'id',
    userId: 'userId',
    albumId: 'albumId',
    addedAt: 'addedAt',
    playCount: 'playCount',
    lastPlayedAt: 'lastPlayedAt',
    rating: 'rating',
    completionRate: 'completionRate',
    favoriteTrackIds: 'favoriteTrackIds',
    deletedAt: 'deletedAt',
  },
  recentlyPlayed: {
    id: 'id',
    userId: 'userId',
    trackId: 'trackId',
    albumId: 'albumId',
    playedAt: 'playedAt',
    duration: 'duration',
    completionRate: 'completionRate',
    context: 'context',
    deviceType: 'deviceType',
    sessionId: 'sessionId',
  },
}));

import { DrizzleLibraryRepository } from '../../infrastructure/database/DrizzleLibraryRepository';

const mockFavoriteTrack = {
  id: 'fav-1',
  userId: 'user-1',
  trackId: 'track-1',
  addedAt: '2025-01-01T00:00:00Z',
  playCount: 5,
  lastPlayedAt: null,
  rating: null,
  notes: null,
  tags: [],
};

const mockFavoriteAlbum = {
  id: 'fav-album-1',
  userId: 'user-1',
  albumId: 'album-1',
  addedAt: '2025-01-01T00:00:00Z',
  playCount: 3,
  lastPlayedAt: null,
  rating: null,
  completionRate: '0',
  favoriteTrackIds: [],
};

const mockRecentlyPlayed = {
  id: 'recent-1',
  userId: 'user-1',
  trackId: 'track-1',
  albumId: null,
  playedAt: '2025-01-01T00:00:00Z',
  duration: 180,
  completionRate: '0.95',
  context: {},
  deviceType: 'web',
  sessionId: 'session-1',
};

function createMockDb() {
  const mockDb: Record<string, ReturnType<typeof vi.fn>> & { _mocks?: Record<string, ReturnType<typeof vi.fn>> } = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockFavoriteTrack]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    query: {},
    transaction: vi.fn(async (fn: (db: typeof mockDb) => unknown) => fn(mockDb)),
    then: undefined,
  };
  return mockDb;
}

describe('DrizzleLibraryRepository', () => {
  let repository: DrizzleLibraryRepository;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repository = new DrizzleLibraryRepository(mockDb);
  });

  describe('getFavoriteTracks', () => {
    it('should return favorite tracks for a user', async () => {
      mockDb.offset.mockResolvedValue([mockFavoriteTrack]);

      const result = await repository.getFavoriteTracks('user-1');

      expect(mockDb.select).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockFavoriteTrack]);
    });

    it('should return empty array when no favorites', async () => {
      mockDb.offset.mockResolvedValue([]);

      const result = await repository.getFavoriteTracks('user-1');

      expect(result).toEqual([]);
    });

    it('should respect limit and offset parameters', async () => {
      mockDb.offset.mockResolvedValue([mockFavoriteTrack]);

      await repository.getFavoriteTracks('user-1', 10, 5);

      expect(mockDb.limit).toHaveBeenCalledWith(expect.any(Number));
      expect(mockDb.offset).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should throw on database error', async () => {
      mockDb.offset.mockRejectedValue(new Error('DB error'));

      await expect(repository.getFavoriteTracks('user-1')).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('addFavoriteTrack', () => {
    it('should add a new favorite track', async () => {
      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([mockFavoriteTrack]);

      const result = await repository.addFavoriteTrack('user-1', 'track-1');

      expect(result).toEqual(mockFavoriteTrack);
    });

    it('should return existing if already favorited', async () => {
      mockDb.limit.mockResolvedValue([mockFavoriteTrack]);

      const result = await repository.addFavoriteTrack('user-1', 'track-1');

      expect(result).toEqual(mockFavoriteTrack);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockDb.limit.mockRejectedValue(new Error('DB error'));

      await expect(repository.addFavoriteTrack('user-1', 'track-1')).rejects.toThrow();
    });
  });

  describe('removeFavoriteTrack', () => {
    it('should remove and return true when found', async () => {
      mockDb.returning.mockResolvedValue([mockFavoriteTrack]);

      const result = await repository.removeFavoriteTrack('user-1', 'track-1');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.removeFavoriteTrack('user-1', 'non-existent');

      expect(result).toBe(false);
    });

    it('should throw on database error', async () => {
      mockDb.returning.mockRejectedValue(new Error('DB error'));

      await expect(repository.removeFavoriteTrack('user-1', 'track-1')).rejects.toThrow();
    });
  });

  describe('isFavoriteTrack', () => {
    it('should return true when track is favorited', async () => {
      mockDb.where.mockResolvedValue([{ count: 1 }]);

      const result = await repository.isFavoriteTrack('user-1', 'track-1');

      expect(result).toBe(true);
    });

    it('should return false when track is not favorited', async () => {
      mockDb.where.mockResolvedValue([{ count: 0 }]);

      const result = await repository.isFavoriteTrack('user-1', 'track-1');

      expect(result).toBe(false);
    });
  });

  describe('updateTrackRating', () => {
    it('should update the rating for a favorite track', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateTrackRating('user-1', 'track-1', 5);

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 5 })
      );
    });

    it('should throw on database error', async () => {
      mockDb.where.mockRejectedValue(new Error('DB error'));

      await expect(repository.updateTrackRating('user-1', 'track-1', 5)).rejects.toThrow();
    });
  });

  describe('getFavoriteAlbums', () => {
    it('should return favorite albums for a user', async () => {
      mockDb.offset.mockResolvedValue([mockFavoriteAlbum]);

      const result = await repository.getFavoriteAlbums('user-1');

      expect(result).toEqual([mockFavoriteAlbum]);
    });

    it('should return empty array when no favorite albums', async () => {
      mockDb.offset.mockResolvedValue([]);

      const result = await repository.getFavoriteAlbums('user-1');

      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockDb.offset.mockRejectedValue(new Error('DB error'));

      await expect(repository.getFavoriteAlbums('user-1')).rejects.toThrow();
    });
  });

  describe('addFavoriteAlbum', () => {
    it('should add a new favorite album', async () => {
      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([mockFavoriteAlbum]);

      const result = await repository.addFavoriteAlbum('user-1', 'album-1');

      expect(result).toEqual(mockFavoriteAlbum);
    });

    it('should return existing if already favorited', async () => {
      mockDb.limit.mockResolvedValue([mockFavoriteAlbum]);

      const result = await repository.addFavoriteAlbum('user-1', 'album-1');

      expect(result).toEqual(mockFavoriteAlbum);
    });
  });

  describe('removeFavoriteAlbum', () => {
    it('should remove and return true when found', async () => {
      mockDb.returning.mockResolvedValue([mockFavoriteAlbum]);

      const result = await repository.removeFavoriteAlbum('user-1', 'album-1');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.removeFavoriteAlbum('user-1', 'album-1');

      expect(result).toBe(false);
    });
  });

  describe('isFavoriteAlbum', () => {
    it('should return true when album is favorited', async () => {
      mockDb.where.mockResolvedValue([{ count: 1 }]);

      const result = await repository.isFavoriteAlbum('user-1', 'album-1');

      expect(result).toBe(true);
    });

    it('should return false when album is not favorited', async () => {
      mockDb.where.mockResolvedValue([{ count: 0 }]);

      const result = await repository.isFavoriteAlbum('user-1', 'album-1');

      expect(result).toBe(false);
    });
  });

  describe('getRecentlyPlayed', () => {
    it('should return recently played tracks', async () => {
      mockDb.limit.mockResolvedValue([mockRecentlyPlayed]);

      const result = await repository.getRecentlyPlayed('user-1');

      expect(result).toEqual([mockRecentlyPlayed]);
    });

    it('should return empty array when no recently played', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.getRecentlyPlayed('user-1');

      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockDb.limit.mockRejectedValue(new Error('DB error'));

      await expect(repository.getRecentlyPlayed('user-1')).rejects.toThrow();
    });
  });

  describe('addRecentlyPlayed', () => {
    it('should add a recently played track', async () => {
      mockDb.values.mockReturnThis();
      mockDb.offset.mockResolvedValue([]);

      await repository.addRecentlyPlayed({
        userId: 'user-1',
        trackId: 'track-1',
        albumId: null,
        duration: 180,
        completionRate: '0.95',
        context: {},
        deviceType: 'web',
        sessionId: 'session-1',
      });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', trackId: 'track-1', duration: 180 })
      );
    });

    it('should throw on database error', async () => {
      mockDb.values.mockRejectedValue(new Error('DB error'));

      await expect(
        repository.addRecentlyPlayed({
          userId: 'user-1',
          trackId: 'track-1',
          albumId: null,
          duration: 180,
          completionRate: '0.95',
          context: {},
          deviceType: 'web',
          sessionId: 'session-1',
        })
      ).rejects.toThrow();
    });
  });

  describe('clearRecentlyPlayed', () => {
    it('should clear all recently played for a user', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.clearRecentlyPlayed('user-1');

      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should throw on database error', async () => {
      mockDb.where.mockRejectedValue(new Error('DB error'));

      await expect(repository.clearRecentlyPlayed('user-1')).rejects.toThrow();
    });
  });

  describe('getLibraryStats', () => {
    it('should return library stats computed on the fly', async () => {
      mockDb.where
        .mockResolvedValueOnce([{ count: 10 }])
        .mockResolvedValueOnce([{ count: 3 }]);

      const result = await repository.getLibraryStats('user-1');

      expect(result).toEqual({
        totalTracks: 10,
        totalAlbums: 3,
        totalPlayTime: 0,
      });
    });

    it('should return zero stats when no data', async () => {
      mockDb.where
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }]);

      const result = await repository.getLibraryStats('user-1');

      expect(result).toEqual({
        totalTracks: 0,
        totalAlbums: 0,
        totalPlayTime: 0,
      });
    });

    it('should throw on database error', async () => {
      mockDb.where.mockRejectedValue(new Error('DB error'));

      await expect(repository.getLibraryStats('user-1')).rejects.toThrow();
    });
  });
});
