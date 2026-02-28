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

vi.mock('@aiponge/shared-contracts', () => ({
  CONTENT_VISIBILITY: { SHARED: 'shared', PERSONAL: 'personal', PUBLIC: 'public' },
  PLAYLIST_LIFECYCLE: { ACTIVE: 'active', DELETED: 'deleted', ARCHIVED: 'archived' },
  VISIBILITY_FILTER: { USER: 'user', PERSONAL: 'personal', SHARED: 'shared', PUBLIC: 'public', ALL: 'all' },
  TRACK_LIFECYCLE: { PUBLISHED: 'published', ACTIVE: 'active', DRAFT: 'draft' },
  ALBUM_LIFECYCLE: { ACTIVE: 'active', DRAFT: 'draft' },
  APP: { DEFAULT_DISPLAY_NAME: 'Unknown' },
  encodeCursor: vi.fn(),
  decodeCursor: vi.fn(),
}));

vi.mock('../../schema/music-schema', () => ({
  playlists: {
    id: 'id',
    name: 'name',
    userId: 'userId',
    status: 'status',
    visibility: 'visibility',
    followerCount: 'followerCount',
    playCount: 'playCount',
    updatedAt: 'updatedAt',
    deletedAt: 'deletedAt',
  },
  playlistTracks: {
    id: 'id',
    playlistId: 'playlistId',
    trackId: 'trackId',
    position: 'position',
    addedAt: 'addedAt',
    addedBy: 'addedBy',
    deletedAt: 'deletedAt',
  },
  playlistFollowers: {
    playlistId: 'playlistId',
    userId: 'userId',
    followedAt: 'followedAt',
  },
  playlistActivities: {
    playlistId: 'playlistId',
    userId: 'userId',
    action: 'action',
    details: 'details',
  },
}));

import { DrizzlePlaylistRepository } from '../../infrastructure/database/DrizzlePlaylistRepository';

const mockPlaylist = {
  id: 'playlist-1',
  name: 'My Playlist',
  userId: 'user-1',
  description: 'Test playlist',
  status: 'active',
  visibility: 'shared',
  followerCount: 0,
  playCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockPlaylistTrack = {
  id: 'pt-1',
  playlistId: 'playlist-1',
  trackId: 'track-1',
  position: 1,
  addedAt: new Date(),
  addedBy: 'user-1',
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
    returning: vi.fn().mockResolvedValue([mockPlaylist]),
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

describe('DrizzlePlaylistRepository', () => {
  let repository: DrizzlePlaylistRepository;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repository = new DrizzlePlaylistRepository(mockDb);
  });

  describe('createPlaylist', () => {
    it('should create a playlist and return it', async () => {
      mockDb.returning.mockResolvedValue([mockPlaylist]);

      const result = await repository.createPlaylist({
        name: 'My Playlist',
        userId: 'user-1',
        description: 'Test playlist',
      } as unknown as Record<string, unknown>);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Playlist', userId: 'user-1' })
      );
      expect(result).toEqual(mockPlaylist);
    });

    it('should generate an id if not provided', async () => {
      mockDb.returning.mockResolvedValue([mockPlaylist]);

      await repository.createPlaylist({
        name: 'My Playlist',
        userId: 'user-1',
      } as unknown as Record<string, unknown>);

      const valuesArg = mockDb.values.mock.calls[0][0];
      expect(valuesArg.id).toBeDefined();
    });
  });

  describe('getPlaylistById', () => {
    it('should return playlist when found', async () => {
      mockDb.limit.mockResolvedValue([mockPlaylist]);

      const result = await repository.getPlaylistById('playlist-1');

      expect(result).toEqual(mockPlaylist);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.getPlaylistById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getPlaylistsByUser', () => {
    it('should return playlists for a user', async () => {
      mockDb.orderBy.mockResolvedValue([mockPlaylist]);

      const result = await repository.getPlaylistsByUser('user-1');

      expect(result).toEqual([mockPlaylist]);
    });

    it('should return empty array when user has no playlists', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await repository.getPlaylistsByUser('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('updatePlaylist', () => {
    it('should update playlist fields', async () => {
      await repository.updatePlaylist('playlist-1', { name: 'Updated Name' } as unknown as Record<string, unknown>);

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Name', updatedAt: expect.any(Date) })
      );
    });
  });

  describe('deletePlaylist', () => {
    it('should soft delete a playlist by setting status', async () => {
      await repository.deletePlaylist('playlist-1');

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'deleted', updatedAt: expect.any(Date) })
      );
    });
  });

  describe('addTrackToPlaylist', () => {
    it('should add a track to playlist', async () => {
      mockDb.where.mockResolvedValueOnce([{ maxPos: 3 }]);

      await repository.addTrackToPlaylist('playlist-1', {
        trackId: 'track-1',
        addedBy: 'user-1',
      } as unknown as Record<string, unknown>);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ playlistId: 'playlist-1', trackId: 'track-1' })
      );
    });
  });

  describe('removeTrackFromPlaylist', () => {
    it('should remove track and reorder positions', async () => {
      mockDb.returning.mockResolvedValue([{ ...mockPlaylistTrack, position: 2 }]);

      await repository.removeTrackFromPlaylist('playlist-1', 'track-1');

      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should handle non-existent track gracefully', async () => {
      mockDb.returning.mockResolvedValue([]);

      await repository.removeTrackFromPlaylist('playlist-1', 'non-existent');

      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('getPlaylistTracks', () => {
    it('should return ordered playlist tracks', async () => {
      mockDb.orderBy.mockResolvedValue([mockPlaylistTrack]);

      const result = await repository.getPlaylistTracks('playlist-1');

      expect(result).toEqual([mockPlaylistTrack]);
    });

    it('should return empty array for empty playlist', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await repository.getPlaylistTracks('playlist-1');

      expect(result).toEqual([]);
    });
  });

  describe('reorderPlaylistTracks', () => {
    it('should update positions for each track', async () => {
      await repository.reorderPlaylistTracks('playlist-1', ['track-3', 'track-1', 'track-2']);

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ position: expect.any(Number) })
      );
    });
  });

  describe('followPlaylist', () => {
    it('should follow a playlist when not already following', async () => {
      await repository.followPlaylist('playlist-1', 'user-2');

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ playlistId: 'playlist-1', userId: 'user-2' })
      );
    });

    it('should not duplicate follow if already following', async () => {
      mockDb.limit.mockResolvedValue([{ playlistId: 'playlist-1', userId: 'user-2' }]);

      await repository.followPlaylist('playlist-1', 'user-2');

      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('unfollowPlaylist', () => {
    it('should unfollow and decrement follower count', async () => {
      mockDb.returning.mockResolvedValue([{ playlistId: 'playlist-1', userId: 'user-2' }]);

      await repository.unfollowPlaylist('playlist-1', 'user-2');

      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ followerCount: expect.anything() })
      );
    });

    it('should not update count if not following', async () => {
      mockDb.returning.mockResolvedValue([]);

      await repository.unfollowPlaylist('playlist-1', 'user-2');

      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('searchPlaylists', () => {
    it('should search playlists by query', async () => {
      mockDb.limit.mockResolvedValue([mockPlaylist]);

      const result = await repository.searchPlaylists('My');

      expect(result).toEqual([mockPlaylist]);
    });

    it('should return empty array for no matches', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.searchPlaylists('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getPublicPlaylists', () => {
    it('should return shared playlists', async () => {
      mockDb.limit.mockResolvedValue([mockPlaylist]);

      const result = await repository.getPublicPlaylists(10);

      expect(result).toEqual([mockPlaylist]);
    });
  });

  describe('getTrendingPlaylists', () => {
    it('should return trending playlists ordered by play count', async () => {
      mockDb.limit.mockResolvedValue([mockPlaylist]);

      const result = await repository.getTrendingPlaylists(10);

      expect(result).toEqual([mockPlaylist]);
    });
  });
});
