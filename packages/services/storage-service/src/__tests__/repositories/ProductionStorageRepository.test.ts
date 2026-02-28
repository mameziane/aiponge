import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: class DomainError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'DomainError';
      if (cause) this.cause = cause;
    }
  },
  createHttpClient: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  })),
  ServiceRegistry: {},
  hasService: () => false,
  getServiceUrl: () => 'http://localhost:3002',
  waitForService: vi.fn(),
  listServices: () => [],
  createServiceUrlsConfig: vi.fn(() => ({})),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  errorStack: vi.fn((err: unknown) => (err instanceof Error ? err.stack : '')),
  withResilience: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  createIntervalScheduler: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  STORAGE_FILE_LIFECYCLE: {
    ACTIVE: 'active',
    ORPHANED: 'orphaned',
    DELETED: 'deleted',
  },
}));

vi.mock('../../domains/repositories/IStorageRepository', () => ({}));

import { ProductionStorageRepository } from '../../infrastructure/repositories/ProductionStorageRepository';

function createMockFileEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || 'file-1',
    filename: overrides.filename || 'test-file.txt',
    contentType: overrides.contentType || 'text/plain',
    size: overrides.size || 1024,
    storageLocation: {
      provider: 'local',
      path: overrides.path || '/test/path.txt',
      publicUrl: overrides.publicUrl,
      bucket: overrides.bucket || 'default',
    },
    metadata: {
      userId: overrides.userId || 'user-1',
      isPublic: overrides.isPublic ?? false,
      tags: overrides.tags || [],
      uploadedAt: overrides.uploadedAt || new Date(),
      lastAccessedAt: overrides.lastAccessedAt,
      expiresAt: overrides.expiresAt,
      version: overrides.version || 1,
      checksum: overrides.checksum,
    },
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    updateMetadata: vi.fn(),
  } as unknown as ReturnType<typeof createMockStorageFile>;
}

describe('ProductionStorageRepository', () => {
  let repository: ProductionStorageRepository;

  beforeEach(() => {
    repository = new ProductionStorageRepository();
  });

  describe('save', () => {
    it('should save a file', async () => {
      const file = createMockFileEntity();
      await repository.save(file);

      const found = await repository.findById('file-1');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('file-1');
    });

    it('should update path index when path changes', async () => {
      const file1 = createMockFileEntity({ path: '/old/path.txt' });
      await repository.save(file1);

      const file2 = createMockFileEntity({ path: '/new/path.txt' });
      await repository.save(file2);

      const foundByOldPath = await repository.findByPath('/old/path.txt');
      expect(foundByOldPath).toBeNull();

      const foundByNewPath = await repository.findByPath('/new/path.txt');
      expect(foundByNewPath).not.toBeNull();
    });
  });

  describe('findById', () => {
    it('should return file by id', async () => {
      await repository.save(createMockFileEntity({ id: 'lookup-id' }));
      const result = await repository.findById('lookup-id');
      expect(result).not.toBeNull();
    });

    it('should return null for non-existing id', async () => {
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByPath', () => {
    it('should find file by path using index', async () => {
      await repository.save(createMockFileEntity({ path: '/indexed/path.txt' }));
      const result = await repository.findByPath('/indexed/path.txt');
      expect(result).not.toBeNull();
    });

    it('should return null for non-existing path', async () => {
      const result = await repository.findByPath('/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find files for a user', async () => {
      await repository.save(createMockFileEntity({ id: 'f1', userId: 'user-a', path: '/a/1' }));
      await repository.save(createMockFileEntity({ id: 'f2', userId: 'user-a', path: '/a/2' }));
      await repository.save(createMockFileEntity({ id: 'f3', userId: 'user-b', path: '/b/1' }));

      const results = await repository.findByUserId('user-a');
      expect(results).toHaveLength(2);
    });

    it('should return empty array for unknown user', async () => {
      const results = await repository.findByUserId('unknown');
      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      await repository.save(createMockFileEntity({ id: 'to-delete', path: '/del/path' }));
      const result = await repository.delete('to-delete');
      expect(result).toBe(true);

      const found = await repository.findById('to-delete');
      expect(found).toBeNull();
    });

    it('should return false for non-existing file', async () => {
      const result = await repository.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('should clean up indexes on delete', async () => {
      await repository.save(createMockFileEntity({ id: 'del-idx', path: '/del/idx', userId: 'u1' }));
      await repository.delete('del-idx');

      const byPath = await repository.findByPath('/del/idx');
      expect(byPath).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      await repository.save(createMockFileEntity({ id: 'ex-file' }));
      expect(await repository.exists('ex-file')).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      expect(await repository.exists('nonexistent')).toBe(false);
    });
  });

  describe('updateMetadata', () => {
    it('should update metadata fields', async () => {
      await repository.save(createMockFileEntity({ id: 'meta-file', tags: ['old'], path: '/meta/path' }));

      const result = await repository.updateMetadata('meta-file', {
        isPublic: true,
        tags: ['new-tag'],
      });
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const result = await repository.updateMetadata('nonexistent', { isPublic: true });
      expect(result).toBe(false);
    });
  });

  describe('findExpired', () => {
    it('should find expired files', async () => {
      const pastDate = new Date('2020-01-01');
      await repository.save(createMockFileEntity({ id: 'expired', expiresAt: pastDate, path: '/exp/1' }));
      await repository.save(createMockFileEntity({ id: 'active', path: '/act/1' }));

      const expired = await repository.findExpired();
      expect(expired.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('search', () => {
    it('should filter by userId', async () => {
      await repository.save(createMockFileEntity({ id: 'sf1', userId: 'search-user', path: '/s/1' }));
      await repository.save(createMockFileEntity({ id: 'sf2', userId: 'other-user', path: '/s/2' }));

      const results = await repository.search({ userId: 'search-user' });
      expect(results).toHaveLength(1);
    });

    it('should filter by contentType', async () => {
      await repository.save(createMockFileEntity({ id: 'ct1', contentType: 'image/png', path: '/ct/1' }));
      await repository.save(createMockFileEntity({ id: 'ct2', contentType: 'text/plain', path: '/ct/2' }));

      const results = await repository.search({ contentType: 'image/png' });
      expect(results).toHaveLength(1);
    });

    it('should filter by isPublic', async () => {
      await repository.save(createMockFileEntity({ id: 'p1', isPublic: true, path: '/p/1' }));
      await repository.save(createMockFileEntity({ id: 'p2', isPublic: false, path: '/p/2' }));

      const results = await repository.search({ isPublic: true });
      expect(results).toHaveLength(1);
    });

    it('should filter by tags', async () => {
      await repository.save(createMockFileEntity({ id: 't1', tags: ['avatar', 'user'], path: '/t/1' }));
      await repository.save(createMockFileEntity({ id: 't2', tags: ['music'], path: '/t/2' }));

      const results = await repository.search({ tags: ['avatar'] });
      expect(results).toHaveLength(1);
    });

    it('should apply pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.save(createMockFileEntity({ id: `pg${i}`, userId: 'u1', path: `/pg/${i}` }));
      }

      const results = await repository.search({ limit: 2, offset: 1 });
      expect(results).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('should return total file count', async () => {
      await repository.save(createMockFileEntity({ id: 'c1', path: '/c/1' }));
      await repository.save(createMockFileEntity({ id: 'c2', path: '/c/2' }));

      const count = await repository.count();
      expect(count).toBe(2);
    });
  });

  describe('getStorageStats', () => {
    it('should return comprehensive stats', async () => {
      await repository.save(
        createMockFileEntity({ id: 'st1', contentType: 'image/png', isPublic: true, path: '/st/1' })
      );
      await repository.save(createMockFileEntity({ id: 'st2', contentType: 'text/plain', path: '/st/2' }));

      const stats = await repository.getStorageStats();
      expect(stats.total).toBe(2);
      expect(stats.byContentType).toBeDefined();
      expect(stats.publicFiles).toBe(1);
    });
  });

  describe('markFileAsOrphaned', () => {
    it('should mark active file as orphaned', async () => {
      await repository.save(createMockFileEntity({ id: 'orph1', path: '/orphan/1' }));

      const result = await repository.markFileAsOrphaned('/orphan/1');
      expect(result).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      const result = await repository.markFileAsOrphaned('/nonexistent');
      expect(result).toBe(false);
    });

    it('should not mark already orphaned file', async () => {
      await repository.save(createMockFileEntity({ id: 'orph2', path: '/orphan/2' }));
      await repository.markFileAsOrphaned('/orphan/2');

      const result = await repository.markFileAsOrphaned('/orphan/2');
      expect(result).toBe(false);
    });
  });
});
