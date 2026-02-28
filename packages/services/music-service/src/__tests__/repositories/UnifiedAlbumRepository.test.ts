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
  CONTENT_VISIBILITY: { SHARED: 'shared', PERSONAL: 'personal', PUBLIC: 'public' },
  VISIBILITY_FILTER: { USER: 'user', PERSONAL: 'personal', SHARED: 'shared', PUBLIC: 'public', ALL: 'all' },
  ALBUM_LIFECYCLE: { ACTIVE: 'active', DRAFT: 'draft', DELETED: 'deleted' },
  TRACK_LIFECYCLE: { PUBLISHED: 'published', ACTIVE: 'active', DRAFT: 'draft' },
  APP: { DEFAULT_DISPLAY_NAME: 'Unknown Artist' },
}));

vi.mock('../../domains/music-catalog/entities/Album', () => ({
  Album: {
    create: vi.fn((data: Record<string, unknown>) => ({
      ...data,
      toJSON: () => data,
    })),
  },
}));

vi.mock('../../schema/music-schema', () => ({
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
    chapterId: 'chapterId',
    status: 'status',
    playCount: 'playCount',
    metadata: 'metadata',
    mood: 'mood',
    deletedAt: 'deletedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  tracks: {
    id: 'id',
    albumId: 'albumId',
    trackNumber: 'trackNumber',
    generationNumber: 'generationNumber',
    status: 'status',
    duration: 'duration',
    deletedAt: 'deletedAt',
  },
}));

import { UnifiedAlbumRepository } from '../../infrastructure/database/UnifiedAlbumRepository';

const mockAlbumRow = {
  id: 'album-1',
  title: 'Test Album',
  userId: 'user-1',
  description: 'Album by TestUser',
  genres: ['pop', 'rock'],
  artworkUrl: 'https://example.com/art.jpg',
  releaseDate: new Date('2025-01-01'),
  type: 'album',
  totalTracks: 10,
  totalDuration: 3600,
  isExplicit: false,
  visibility: 'shared',
  chapterId: 'chapter-1',
  status: 'active',
  playCount: 50,
  metadata: { displayName: 'TestUser', recordLabel: 'Test Records', catalogNumber: 'TR-001' },
  mood: null,
  deletedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
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
    returning: vi.fn().mockResolvedValue([mockAlbumRow]),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rowCount: 0 }),
    query: {},
    transaction: vi.fn(async (fn: (db: typeof mockDb) => unknown) => fn(mockDb)),
    then: undefined,
  };
  return mockDb;
}

describe('UnifiedAlbumRepository', () => {
  let repository: UnifiedAlbumRepository;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repository = new UnifiedAlbumRepository(mockDb);
  });

  describe('create', () => {
    it('should create an album and return AlbumEntity', async () => {
      mockDb.returning.mockResolvedValue([mockAlbumRow]);

      const result = await repository.create({
        id: 'album-1',
        title: 'Test Album',
        userId: 'user-1',
        displayName: 'TestUser',
        genre: ['pop'],
        isCompilation: false,
        status: 'active' as unknown as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'album-1',
          title: 'Test Album',
          userId: 'user-1',
          genres: ['pop'],
        })
      );
      expect(result.id).toBe('album-1');
      expect(result.title).toBe('Test Album');
    });

    it('should throw on database error', async () => {
      mockDb.returning.mockRejectedValue(new Error('DB error'));

      await expect(
        repository.create({
          id: 'album-1',
          title: 'Test Album',
          userId: 'user-1',
          displayName: 'TestUser',
          genre: ['pop'],
          isCompilation: false,
          status: 'active' as unknown as string,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should return album when found', async () => {
      mockDb.limit.mockResolvedValue([mockAlbumRow]);

      const result = await repository.findById('album-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('album-1');
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should apply visibility filter', async () => {
      mockDb.limit.mockResolvedValue([mockAlbumRow]);

      const result = await repository.findById('album-1', 'shared');

      expect(result).not.toBeNull();
      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should throw on database error', async () => {
      mockDb.limit.mockRejectedValue(new Error('DB error'));

      await expect(repository.findById('album-1')).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update album and return updated entity', async () => {
      mockDb.returning.mockResolvedValue([mockAlbumRow]);

      const result = await repository.update({
        id: 'album-1',
        title: 'Updated Album',
        userId: 'user-1',
        displayName: 'TestUser',
        genre: ['pop'],
        isCompilation: false,
        status: 'active' as unknown as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Album',
          userId: 'user-1',
          genres: ['pop'],
          updatedAt: expect.any(Date),
        })
      );
      expect(result.id).toBe('album-1');
    });

    it('should throw when album not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(
        repository.update({
          id: 'non-existent',
          title: 'Updated Album',
          userId: 'user-1',
          displayName: 'TestUser',
          genre: ['pop'],
          isCompilation: false,
          status: 'active' as unknown as string,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should soft delete album and return true', async () => {
      mockDb.where.mockResolvedValue(undefined);

      const result = await repository.delete('album-1');

      expect(result).toBe(true);
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
    });

    it('should return false on database error', async () => {
      mockDb.where.mockRejectedValue(new Error('DB error'));

      const result = await repository.delete('album-1');

      expect(result).toBe(false);
    });
  });

  describe('findByUser', () => {
    it('should return albums for a user', async () => {
      mockDb.offset.mockResolvedValue([mockAlbumRow]);

      const result = await repository.findByUser('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
    });

    it('should return empty array when user has no albums', async () => {
      mockDb.offset.mockResolvedValue([]);

      const result = await repository.findByUser('user-1');

      expect(result).toEqual([]);
    });

    it('should respect options parameters', async () => {
      mockDb.offset.mockResolvedValue([mockAlbumRow]);

      await repository.findByUser('user-1', {
        visibility: 'shared',
        limit: 10,
        offset: 5,
      });

      expect(mockDb.limit).toHaveBeenCalledWith(expect.any(Number));
      expect(mockDb.offset).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should throw on database error', async () => {
      mockDb.offset.mockRejectedValue(new Error('DB error'));

      await expect(repository.findByUser('user-1')).rejects.toThrow();
    });
  });

  describe('findByChapterId', () => {
    it('should return album when found by chapter id', async () => {
      mockDb.limit.mockResolvedValue([mockAlbumRow]);

      const result = await repository.findByChapterId('chapter-1');

      expect(result).not.toBeNull();
      expect(result!.chapterId).toBe('chapter-1');
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findByChapterId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByTitle', () => {
    it('should return albums matching title', async () => {
      mockDb.where.mockResolvedValue([mockAlbumRow]);

      const result = await repository.findByTitle('Test');

      expect(result).toHaveLength(1);
    });

    it('should return empty array for no matches', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.findByTitle('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('searchAlbums', () => {
    it('should search albums by query', async () => {
      mockDb.offset.mockResolvedValue([mockAlbumRow]);

      const result = await repository.searchAlbums('Test');

      expect(result).toHaveLength(1);
    });

    it('should return empty array for no matches', async () => {
      mockDb.offset.mockResolvedValue([]);

      const result = await repository.searchAlbums('nonexistent');

      expect(result).toEqual([]);
    });

    it('should respect limit and offset', async () => {
      mockDb.offset.mockResolvedValue([mockAlbumRow]);

      await repository.searchAlbums('Test', { limit: 5, offset: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(expect.any(Number));
      expect(mockDb.offset).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe('count', () => {
    it('should return album count', async () => {
      mockDb.where.mockResolvedValue([{ count: 42 }]);

      const result = await repository.count();

      expect(result).toBe(42);
    });

    it('should return 0 when no albums', async () => {
      mockDb.where.mockResolvedValue([{ count: 0 }]);

      const result = await repository.count();

      expect(result).toBe(0);
    });

    it('should apply visibility filter', async () => {
      mockDb.where.mockResolvedValue([{ count: 10 }]);

      await repository.count('shared');

      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('updateArtwork', () => {
    it('should update album artwork', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateArtwork('album-1', 'https://example.com/new-art.jpg');

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ artworkUrl: 'https://example.com/new-art.jpg' })
      );
    });

    it('should throw on database error', async () => {
      mockDb.where.mockRejectedValue(new Error('DB error'));

      await expect(repository.updateArtwork('album-1', 'https://example.com/new-art.jpg')).rejects.toThrow();
    });
  });

  describe('updateStatus', () => {
    it('should update album status', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateStatus('album-1', 'active' as unknown as string);

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    });

    it('should throw on database error', async () => {
      mockDb.where.mockRejectedValue(new Error('DB error'));

      await expect(repository.updateStatus('album-1', 'active' as unknown as string)).rejects.toThrow();
    });
  });

  describe('getNextTrackNumber', () => {
    it('should return next track number', async () => {
      mockDb.where.mockResolvedValue([{ maxTrackNumber: 5 }]);

      const result = await repository.getNextTrackNumber('album-1');

      expect(result).toBe(6);
    });

    it('should return 1 when album has no tracks', async () => {
      mockDb.where.mockResolvedValue([{ maxTrackNumber: 0 }]);

      const result = await repository.getNextTrackNumber('album-1');

      expect(result).toBe(1);
    });

    it('should return 1 on database error', async () => {
      mockDb.where.mockRejectedValue(new Error('DB error'));

      const result = await repository.getNextTrackNumber('album-1');

      expect(result).toBe(1);
    });
  });

  describe('findByGenre', () => {
    it('should return albums matching genre', async () => {
      mockDb.offset.mockResolvedValue([mockAlbumRow]);

      const result = await repository.findByGenre('pop');

      expect(result).toHaveLength(1);
    });

    it('should return empty array for no matches', async () => {
      mockDb.offset.mockResolvedValue([]);

      const result = await repository.findByGenre('classical');

      expect(result).toEqual([]);
    });
  });

  describe('ensureValidVisibility', () => {
    it('should return count of updated albums', async () => {
      mockDb.execute.mockResolvedValue({ rowCount: 5 });

      const result = await repository.ensureValidVisibility();

      expect(result).toEqual({ updated: 5 });
    });

    it('should throw on database error', async () => {
      mockDb.execute.mockRejectedValue(new Error('DB error'));

      await expect(repository.ensureValidVisibility()).rejects.toThrow();
    });
  });
});
