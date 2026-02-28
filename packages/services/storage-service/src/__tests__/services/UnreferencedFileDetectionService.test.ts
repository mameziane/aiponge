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
    createdAt: 'created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ type: 'eq', value: val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', conditions: args })),
  sql: Object.assign(vi.fn(), {
    join: vi.fn(),
  }),
}));

import { UnreferencedFileDetectionService } from '../../application/services/UnreferencedFileDetectionService';

function createMockDb() {
  const mockOffset = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  const mockSet = vi.fn();
  const mockExecute = vi.fn();

  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit, returning: vi.fn().mockResolvedValue([]) });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ offset: mockOffset });
  mockOffset.mockResolvedValue([]);

  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });

  mockExecute.mockResolvedValue({ rows: [] });

  return {
    select: mockSelect,
    update: mockUpdate,
    execute: mockExecute,
    _mocks: { mockOffset, mockLimit, mockOrderBy, mockWhere, mockFrom, mockSelect, mockUpdate, mockSet, mockExecute },
  };
}

describe('UnreferencedFileDetectionService', () => {
  let service: UnreferencedFileDetectionService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = new UnreferencedFileDetectionService(
      mockDb as unknown as ConstructorParameters<typeof UnreferencedFileDetectionService>[0]
    );
  });

  describe('detectUnreferencedFiles', () => {
    it('should detect unreferenced files', async () => {
      mockDb._mocks.mockExecute.mockResolvedValueOnce({
        rows: [{ url: 'user/referenced.jpg' }],
      });

      mockDb._mocks.mockOffset.mockResolvedValueOnce([
        { id: 'f1', storagePath: 'user/unreferenced.jpg', publicUrl: null, category: 'avatar', createdAt: new Date() },
        { id: 'f2', storagePath: 'user/referenced.jpg', publicUrl: null, category: 'avatar', createdAt: new Date() },
      ]);

      mockDb._mocks.mockOffset.mockResolvedValueOnce([]);

      const result = await service.detectUnreferencedFiles({ batchSize: 100, dryRun: true });

      expect(result.scannedCount).toBe(2);
      expect(result.unreferencedCount).toBe(1);
      expect(result.unreferencedFiles[0].storagePath).toBe('user/unreferenced.jpg');
    });

    it('should mark unreferenced files as orphaned when not in dry run', async () => {
      mockDb._mocks.mockExecute.mockResolvedValueOnce({ rows: [] });

      mockDb._mocks.mockOffset.mockResolvedValueOnce([
        { id: 'f1', storagePath: 'user/orphan.jpg', publicUrl: null, category: 'avatar', createdAt: new Date() },
      ]);

      const mockUpdateWhere = vi.fn().mockResolvedValue([]);
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      mockDb.update.mockReturnValue({ set: mockUpdateSet });

      mockDb._mocks.mockOffset.mockResolvedValueOnce([]);

      const result = await service.detectUnreferencedFiles({ batchSize: 100, dryRun: false });

      expect(result.unreferencedCount).toBe(1);
      expect(result.markedOrphanedCount).toBe(1);
    });

    it('should handle errors when marking files as orphaned', async () => {
      mockDb._mocks.mockExecute.mockResolvedValueOnce({ rows: [] });

      mockDb._mocks.mockOffset.mockResolvedValueOnce([
        { id: 'f1', storagePath: 'user/error.jpg', publicUrl: null, category: 'avatar', createdAt: new Date() },
      ]);

      const mockUpdateWhere = vi.fn().mockRejectedValue(new Error('DB write error'));
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      mockDb.update.mockReturnValue({ set: mockUpdateSet });

      mockDb._mocks.mockOffset.mockResolvedValueOnce([]);

      const result = await service.detectUnreferencedFiles({ batchSize: 100, dryRun: false });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('DB write error');
    });

    it('should paginate through all files', async () => {
      mockDb._mocks.mockExecute.mockResolvedValueOnce({ rows: [] });

      const batch1 = Array.from({ length: 2 }, (_, i) => ({
        id: `batch1-${i}`,
        storagePath: `path/batch1-${i}.jpg`,
        publicUrl: null,
        category: 'general',
        createdAt: new Date(),
      }));

      const batch2 = [
        {
          id: 'batch2-0',
          storagePath: 'path/batch2-0.jpg',
          publicUrl: null,
          category: 'general',
          createdAt: new Date(),
        },
      ];

      const mockUpdateWhere = vi.fn().mockResolvedValue([]);
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      mockDb.update.mockReturnValue({ set: mockUpdateSet });

      mockDb._mocks.mockOffset.mockResolvedValueOnce(batch1).mockResolvedValueOnce(batch2);

      const result = await service.detectUnreferencedFiles({ batchSize: 2, dryRun: false });

      expect(result.scannedCount).toBe(3);
      expect(result.paginationComplete).toBe(true);
    });

    it('should respect maxIterations limit', async () => {
      mockDb._mocks.mockExecute.mockResolvedValueOnce({ rows: [] });

      const batch = Array.from({ length: 10 }, (_, i) => ({
        id: `f${i}`,
        storagePath: `path/${i}.jpg`,
        publicUrl: null,
        category: 'general',
        createdAt: new Date(),
      }));

      const mockUpdateWhere = vi.fn().mockResolvedValue([]);
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      mockDb.update.mockReturnValue({ set: mockUpdateSet });

      mockDb._mocks.mockOffset.mockResolvedValueOnce(batch).mockResolvedValueOnce(batch);

      const result = await service.detectUnreferencedFiles({ batchSize: 10, maxIterations: 1, dryRun: true });

      expect(result.scannedCount).toBe(10);
      expect(result.paginationComplete).toBe(false);
    });

    it('should complete when no files found', async () => {
      mockDb._mocks.mockExecute.mockResolvedValueOnce({ rows: [] });
      mockDb._mocks.mockOffset.mockResolvedValueOnce([]);

      const result = await service.detectUnreferencedFiles({ batchSize: 100 });

      expect(result.scannedCount).toBe(0);
      expect(result.unreferencedCount).toBe(0);
      expect(result.paginationComplete).toBe(true);
    });

    it('should throw when database query fails', async () => {
      mockDb._mocks.mockExecute.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(service.detectUnreferencedFiles({ batchSize: 100 })).rejects.toThrow('Connection failed');
    });

    it('should log summary after detection', async () => {
      mockDb._mocks.mockExecute.mockResolvedValueOnce({ rows: [] });
      mockDb._mocks.mockOffset.mockResolvedValueOnce([]);

      await service.detectUnreferencedFiles({ batchSize: 100 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Detection completed',
        expect.objectContaining({
          scanned: 0,
          unreferenced: 0,
        })
      );
    });
  });
});
