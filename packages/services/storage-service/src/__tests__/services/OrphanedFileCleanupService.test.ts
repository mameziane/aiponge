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

vi.mock('../../schema/storage-schema', () => ({
  files: {
    id: 'id',
    storagePath: 'storage_path',
    publicUrl: 'public_url',
    status: 'status',
    orphanedAt: 'orphaned_at',
    updatedAt: 'updated_at',
    category: 'category',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ type: 'eq', value: val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', conditions: args })),
  lt: vi.fn((_col, val) => ({ type: 'lt', value: val })),
  sql: vi.fn(),
}));

import { OrphanedFileCleanupService } from '../../application/services/OrphanedFileCleanupService';

function createMockDb() {
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockUpdateWhereResult = Promise.resolve(undefined) as Promise<undefined> & {
    returning: ReturnType<typeof vi.fn>;
  };
  mockUpdateWhereResult.returning = mockReturning;
  const mockUpdateWhere = vi.fn().mockReturnValue(mockUpdateWhereResult);
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    select: mockSelect,
    update: mockUpdate,
    _mocks: { mockReturning, mockUpdateWhere, mockSet, mockFrom, mockLimit, mockSelectWhere, mockSelect, mockUpdate },
  };
}

function createMockStorageProvider() {
  return {
    upload: vi.fn(),
    download: vi.fn(),
    delete: vi.fn().mockResolvedValue({ success: true }),
    exists: vi.fn(),
    generateSignedUrl: vi.fn(),
    getMetadata: vi.fn(),
    listFiles: vi.fn(),
    getPublicUrl: vi.fn(),
    getProviderInfo: vi.fn(),
    initialize: vi.fn(),
    cleanup: vi.fn(),
  };
}

describe('OrphanedFileCleanupService', () => {
  let service: OrphanedFileCleanupService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockStorageProvider: ReturnType<typeof createMockStorageProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockStorageProvider = createMockStorageProvider();
    service = new OrphanedFileCleanupService(
      mockDb as unknown as Parameters<typeof OrphanedFileCleanupService.prototype.constructor>[0],
      mockStorageProvider as unknown as Parameters<typeof OrphanedFileCleanupService.prototype.constructor>[1]
    );
  });

  describe('markFileAsOrphaned', () => {
    it('should mark a file as orphaned by URL', async () => {
      mockDb._mocks.mockReturning.mockResolvedValueOnce([{ id: 'file-1' }]);

      const result = await service.markFileAsOrphaned('/uploads/user/avatar.jpg');
      expect(result).toBe(true);
    });

    it('should return false when no file found', async () => {
      mockDb._mocks.mockReturning.mockResolvedValueOnce([]);

      const result = await service.markFileAsOrphaned('/uploads/nonexistent.jpg');
      expect(result).toBe(false);
    });

    it('should return false for empty URL', async () => {
      const result = await service.markFileAsOrphaned('');
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockDb._mocks.mockReturning.mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await service.markFileAsOrphaned('/uploads/error.jpg');
      expect(result).toBe(false);
    });

    it('should extract storage path from absolute URL', async () => {
      mockDb._mocks.mockReturning.mockResolvedValueOnce([{ id: 'file-1' }]);

      const result = await service.markFileAsOrphaned('https://example.com/uploads/user/avatar.jpg');
      expect(result).toBe(true);
    });

    it('should extract storage path from bare path', async () => {
      mockDb._mocks.mockReturning.mockResolvedValueOnce([{ id: 'file-1' }]);

      const result = await service.markFileAsOrphaned('user/avatar.jpg');
      expect(result).toBe(true);
    });
  });

  describe('cleanupOrphanedFiles', () => {
    it('should cleanup orphaned files past grace period', async () => {
      const orphanedFiles = [
        {
          id: 'f1',
          storagePath: '/path/1.jpg',
          publicUrl: null,
          orphanedAt: new Date('2020-01-01'),
          category: 'avatar',
        },
        {
          id: 'f2',
          storagePath: '/path/2.jpg',
          publicUrl: null,
          orphanedAt: new Date('2020-01-01'),
          category: 'track',
        },
      ];

      mockDb._mocks.mockLimit.mockResolvedValueOnce(orphanedFiles);
      mockStorageProvider.delete.mockResolvedValue({ success: true });
      mockDb._mocks.mockReturning.mockResolvedValue([]);

      const result = await service.cleanupOrphanedFiles({ gracePeriodHours: 24, batchSize: 100 });

      expect(result.deletedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle deletion failures', async () => {
      const orphanedFiles = [
        {
          id: 'f1',
          storagePath: '/path/fail.jpg',
          publicUrl: null,
          orphanedAt: new Date('2020-01-01'),
          category: 'avatar',
        },
      ];

      mockDb._mocks.mockLimit.mockResolvedValueOnce(orphanedFiles);
      mockStorageProvider.delete.mockResolvedValue({ success: false, error: 'Provider error' });

      const result = await service.cleanupOrphanedFiles({ gracePeriodHours: 24, batchSize: 100 });

      expect(result.deletedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Provider error');
    });

    it('should handle exceptions during deletion', async () => {
      const orphanedFiles = [
        {
          id: 'f1',
          storagePath: '/path/throw.jpg',
          publicUrl: null,
          orphanedAt: new Date('2020-01-01'),
          category: 'avatar',
        },
      ];

      mockDb._mocks.mockLimit.mockResolvedValueOnce(orphanedFiles);
      mockStorageProvider.delete.mockRejectedValue(new Error('Network timeout'));

      const result = await service.cleanupOrphanedFiles({ gracePeriodHours: 24, batchSize: 100 });

      expect(result.failedCount).toBe(1);
      expect(result.errors[0]).toContain('Network timeout');
    });

    it('should skip files in dry run mode', async () => {
      const orphanedFiles = [
        {
          id: 'f1',
          storagePath: '/path/dry.jpg',
          publicUrl: null,
          orphanedAt: new Date('2020-01-01'),
          category: 'avatar',
        },
      ];

      mockDb._mocks.mockLimit.mockResolvedValueOnce(orphanedFiles);

      const result = await service.cleanupOrphanedFiles({ dryRun: true, gracePeriodHours: 24, batchSize: 100 });

      expect(result.skippedCount).toBe(1);
      expect(result.deletedCount).toBe(0);
      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
    });

    it('should return empty result when no orphaned files found', async () => {
      mockDb._mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await service.cleanupOrphanedFiles({ gracePeriodHours: 24, batchSize: 100 });

      expect(result.deletedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
    });

    it('should log summary after cleanup', async () => {
      mockDb._mocks.mockLimit.mockResolvedValueOnce([]);

      await service.cleanupOrphanedFiles({ gracePeriodHours: 24, batchSize: 100 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleanup completed',
        expect.objectContaining({
          deleted: 0,
          failed: 0,
          skipped: 0,
        })
      );
    });

    it('should throw when database query fails', async () => {
      mockDb._mocks.mockLimit.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.cleanupOrphanedFiles({ gracePeriodHours: 24, batchSize: 100 })).rejects.toThrow('DB error');
    });
  });

  describe('getOrphanedFilesStats', () => {
    it('should return orphaned file statistics', async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ total: 10, readyForDeletion: 5, withinGracePeriod: 5 }]),
      });

      const stats = await service.getOrphanedFilesStats();

      expect(stats.totalOrphaned).toBe(10);
      expect(stats.readyForDeletion).toBe(5);
      expect(stats.withinGracePeriod).toBe(5);
    });
  });
});
