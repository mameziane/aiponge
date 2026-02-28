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
  getAuditService: () => ({ log: vi.fn() }),
  getCorrelationContext: () => ({ correlationId: 'test-corr-id' }),
  DomainError: MockDomainError,
  createHttpClient: vi.fn().mockReturnValue({}),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  serializeError: vi.fn((err: unknown) => err),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  TRACK_LIFECYCLE: { PUBLISHED: 'published', ACTIVE: 'active', DRAFT: 'draft' },
  CONTENT_VISIBILITY: { SHARED: 'shared', PERSONAL: 'personal', PUBLIC: 'public' },
  ALBUM_LIFECYCLE: { ACTIVE: 'active', DRAFT: 'draft' },
  VISIBILITY_FILTER: { USER: 'user', PERSONAL: 'personal', SHARED: 'shared', PUBLIC: 'public', ALL: 'all' },
  APP: { DEFAULT_DISPLAY_NAME: 'Unknown' },
  encodeCursor: vi.fn((data: Record<string, unknown>) => Buffer.from(JSON.stringify(data)).toString('base64')),
  decodeCursor: vi.fn((cursor: string) => JSON.parse(Buffer.from(cursor, 'base64').toString())),
}));

vi.mock('../../schema/music-schema', () => ({
  tracks: {
    id: 'id',
    title: 'title',
    userId: 'userId',
    albumId: 'albumId',
    trackNumber: 'trackNumber',
    generationNumber: 'generationNumber',
    status: 'status',
    playCount: 'playCount',
    genres: 'genres',
    fileUrl: 'fileUrl',
    artworkUrl: 'artworkUrl',
    duration: 'duration',
    fileSize: 'fileSize',
    mimeType: 'mimeType',
    quality: 'quality',
    lyricsId: 'lyricsId',
    hasSyncedLyrics: 'hasSyncedLyrics',
    metadata: 'metadata',
    deletedAt: 'deletedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  albums: {
    id: 'id',
    title: 'title',
    userId: 'userId',
    description: 'description',
    genres: 'genres',
    artworkUrl: 'artworkUrl',
    releaseDate: 'releaseDate',
    type: 'type',
    totalTracks: 'totalTracks',
    totalDuration: 'totalDuration',
    isExplicit: 'isExplicit',
    visibility: 'visibility',
    playCount: 'playCount',
    metadata: 'metadata',
    deletedAt: 'deletedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

import { DrizzleMusicCatalogRepository } from '../../infrastructure/database/DrizzleMusicCatalogRepository';

const mockTrack = {
  id: 'track-1',
  title: 'Test Song',
  userId: 'user-1',
  albumId: null,
  trackNumber: 1,
  generationNumber: 1,
  status: 'published',
  playCount: 0,
  genres: ['pop'],
  fileUrl: 'https://example.com/track.mp3',
  artworkUrl: 'https://example.com/art.jpg',
  duration: 180,
  fileSize: 5000000,
  mimeType: 'audio/mp3',
  quality: 'high',
  lyricsId: null,
  hasSyncedLyrics: false,
  metadata: {},
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAlbum = {
  id: 'album-1',
  title: 'Test Album',
  userId: 'user-1',
  description: 'A test album',
  genres: ['pop'],
  artworkUrl: 'https://example.com/album-art.jpg',
  releaseDate: new Date(),
  type: 'album',
  totalTracks: 10,
  totalDuration: 3600,
  isExplicit: false,
  visibility: 'shared',
  playCount: 100,
  metadata: {},
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
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
    returning: vi.fn().mockResolvedValue([mockTrack]),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
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

describe('DrizzleMusicCatalogRepository', () => {
  let repository: DrizzleMusicCatalogRepository;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repository = new DrizzleMusicCatalogRepository(mockDb);
  });

  describe('saveTrack', () => {
    it('should save a track and return it', async () => {
      mockDb.returning.mockResolvedValue([mockTrack]);

      const result = await repository.saveTrack({
        title: 'Test Song',
        userId: 'user-1',
        fileUrl: 'https://example.com/track.mp3',
      } as unknown as Record<string, unknown>);

      expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test Song', userId: 'user-1' }));
      expect(result).toEqual(mockTrack);
    });

    it('should use provided id when given', async () => {
      mockDb.returning.mockResolvedValue([mockTrack]);

      await repository.saveTrack({
        id: 'custom-id',
        title: 'Test Song',
        userId: 'user-1',
      } as unknown as Record<string, unknown>);

      expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ id: 'custom-id' }));
    });

    it('should generate id when not provided', async () => {
      mockDb.returning.mockResolvedValue([mockTrack]);

      await repository.saveTrack({
        title: 'Test Song',
        userId: 'user-1',
      } as unknown as Record<string, unknown>);

      const valuesArg = mockDb.values.mock.calls[0][0];
      expect(valuesArg.id).toBeDefined();
    });
  });

  describe('findTrackById', () => {
    it('should return track when found', async () => {
      mockDb.limit.mockResolvedValue([mockTrack]);

      const result = await repository.findTrackById('track-1');

      expect(result).toEqual(mockTrack);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findTrackById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findTracksByUserId', () => {
    it('should return tracks for a user', async () => {
      mockDb.orderBy.mockResolvedValue([mockTrack]);

      const result = await repository.findTracksByUserId('user-1');

      expect(result).toEqual([mockTrack]);
    });

    it('should return empty array when no tracks', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await repository.findTracksByUserId('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findTracksByAlbumId', () => {
    it('should return tracks for an album', async () => {
      mockDb.orderBy.mockResolvedValue([mockTrack]);

      const result = await repository.findTracksByAlbumId('album-1');

      expect(result).toEqual([mockTrack]);
    });

    it('should return empty array when album has no tracks', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await repository.findTracksByAlbumId('album-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateTrackPlayCount', () => {
    it('should increment play count', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateTrackPlayCount('track-1');

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ updatedAt: expect.any(Date) }));
    });
  });

  describe('deleteTrack', () => {
    it('should soft delete a track', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.deleteTrack('track-1');

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
    });
  });

  describe('updateTrackAlbumLink', () => {
    it('should update album link', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateTrackAlbumLink('track-1', 'album-1');

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ albumId: 'album-1', updatedAt: expect.any(Date) })
      );
    });

    it('should update album link with track number', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateTrackAlbumLink('track-1', 'album-1', 3);

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ albumId: 'album-1', trackNumber: 3 }));
    });
  });

  describe('saveAlbum', () => {
    it('should save an album and return it', async () => {
      mockDb.returning.mockResolvedValue([mockAlbum]);

      const result = await repository.saveAlbum({
        title: 'Test Album',
        userId: 'user-1',
      } as unknown as Record<string, unknown>);

      expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test Album', userId: 'user-1' }));
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('findAlbumById', () => {
    it('should return album when found', async () => {
      mockDb.limit.mockResolvedValue([mockAlbum]);

      const result = await repository.findAlbumById('album-1');

      expect(result).toEqual(mockAlbum);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findAlbumById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAlbumsByUserId', () => {
    it('should return albums for a user', async () => {
      mockDb.orderBy.mockResolvedValue([mockAlbum]);

      const result = await repository.findAlbumsByUserId('user-1');

      expect(result).toEqual([mockAlbum]);
    });

    it('should return empty array when user has no albums', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await repository.findAlbumsByUserId('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('searchAlbums', () => {
    it('should search albums by query', async () => {
      mockDb.limit.mockResolvedValue([mockAlbum]);

      const result = await repository.searchAlbums('Test');

      expect(result).toEqual([mockAlbum]);
    });

    it('should return empty array for no matches', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.searchAlbums('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getTopAlbums', () => {
    it('should return top albums ordered by play count', async () => {
      mockDb.limit.mockResolvedValue([mockAlbum]);

      const result = await repository.getTopAlbums(10);

      expect(result).toEqual([mockAlbum]);
    });

    it('should handle empty results', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.getTopAlbums();

      expect(result).toEqual([]);
    });
  });

  describe('updateAlbumPlayCount', () => {
    it('should increment album play count', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateAlbumPlayCount('album-1');

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ updatedAt: expect.any(Date) }));
    });
  });

  describe('getCatalogStats', () => {
    it('should return catalog statistics', async () => {
      mockDb.where
        .mockResolvedValueOnce([{ count: 100 }])
        .mockResolvedValueOnce([{ count: 20 }])
        .mockResolvedValueOnce([{ genres: ['pop'] }, { genres: ['rock', 'pop'] }]);

      const result = await repository.getCatalogStats();

      expect(result).toEqual({
        totalTracks: 100,
        totalAlbums: 20,
        totalGenres: 2,
      });
    });

    it('should handle empty catalog', async () => {
      mockDb.where
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const result = await repository.getCatalogStats();

      expect(result).toEqual({
        totalTracks: 0,
        totalAlbums: 0,
        totalGenres: 0,
      });
    });
  });

  describe('searchTracks', () => {
    it('should return paginated results', async () => {
      mockDb.limit.mockResolvedValue([mockTrack]);

      const result = await repository.searchTracks('test', 50);

      expect(result).toEqual({
        items: [mockTrack],
        nextCursor: null,
        hasMore: false,
      });
    });

    it('should indicate hasMore when results exceed limit', async () => {
      const manyTracks = Array(51)
        .fill(mockTrack)
        .map((t, i) => ({ ...t, id: `track-${i}` }));
      mockDb.limit.mockResolvedValue(manyTracks);

      const result = await repository.searchTracks('test', 50);

      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(50);
    });

    it('should return empty results for no matches', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.searchTracks('nonexistent');

      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
    });
  });

  describe('updateHasSyncedLyrics', () => {
    it('should update hasSyncedLyrics flag', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateHasSyncedLyrics('track-1', true);

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ hasSyncedLyrics: true, updatedAt: expect.any(Date) })
      );
    });
  });
});
