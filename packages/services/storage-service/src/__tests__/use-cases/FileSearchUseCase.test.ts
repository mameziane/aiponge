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
      this.name = 'DomainError';
      if (cause) this.cause = cause;
    }
  },
  createHttpClient: vi.fn(() => ({
    get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(),
  })),
  ServiceRegistry: {},
  hasService: () => false,
  getServiceUrl: () => 'http://localhost:3002',
  waitForService: vi.fn(),
  listServices: () => [],
  createServiceUrlsConfig: vi.fn(() => ({})),
  errorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
  errorStack: vi.fn((err: unknown) => err instanceof Error ? err.stack : ''),
  withResilience: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  createIntervalScheduler: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  STORAGE_ACCESS_LEVEL: {
    PRIVATE: 'private',
    PUBLIC: 'public',
    SHARED: 'shared',
  },
  PROCESSING_JOB_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
}));

import { FileSearchUseCase } from '../../application/use-cases/FileSearchUseCase';
import { FileEntity } from '../../domains/entities/FileEntity';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';

function createMockFileEntity(overrides: {
  id?: string;
  filename?: string;
  size?: number;
  mimeType?: string;
  isPublic?: boolean;
  tags?: string[];
  uploadedAt?: Date;
} = {}): FileEntity {
  return new FileEntity(
    overrides.id || 'file-1',
    overrides.filename || 'test.txt',
    {
      bucket: 'default',
      key: 'user/user-1/general/test.txt',
      provider: 'local',
    },
    {
      size: overrides.size || 1024,
      mimeType: overrides.mimeType || 'text/plain',
      uploadedAt: overrides.uploadedAt || new Date('2024-06-01'),
      uploadedBy: 'user-1',
      isPublic: overrides.isPublic ?? false,
      tags: overrides.tags || [],
    },
    new Date('2024-06-01'),
    new Date()
  );
}

describe('FileSearchUseCase', () => {
  let useCase: FileSearchUseCase;
  let mockProvider: IStorageProvider;
  let mockRepository: IStorageRepository;

  const mockFiles = [
    createMockFileEntity({ id: '1', filename: 'song.mp3', size: 5000000, mimeType: 'audio/mpeg', tags: ['music', 'jazz'] }),
    createMockFileEntity({ id: '2', filename: 'photo.png', size: 200000, mimeType: 'image/png', tags: ['photo'], isPublic: true }),
    createMockFileEntity({ id: '3', filename: 'document.pdf', size: 50000, mimeType: 'application/pdf', tags: ['work'] }),
    createMockFileEntity({ id: '4', filename: 'video.mp4', size: 10000000, mimeType: 'video/mp4', tags: ['video'] }),
    createMockFileEntity({ id: '5', filename: 'jazz-track.mp3', size: 4000000, mimeType: 'audio/mpeg', tags: ['music', 'jazz'] }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      upload: vi.fn(), download: vi.fn(), delete: vi.fn(), exists: vi.fn(),
      generateSignedUrl: vi.fn(), getMetadata: vi.fn().mockResolvedValue(null),
      listFiles: vi.fn(), getPublicUrl: vi.fn(),
      getProviderInfo: vi.fn().mockReturnValue({ name: 'local' }),
      initialize: vi.fn(), cleanup: vi.fn(),
    } as unknown as IStorageProvider;

    mockRepository = {
      save: vi.fn(),
      findById: vi.fn().mockImplementation((id: string) => {
        return Promise.resolve(mockFiles.find(f => f.id === id) || null);
      }),
      findByPath: vi.fn(),
      findByUserId: vi.fn().mockResolvedValue(mockFiles),
      delete: vi.fn(),
      exists: vi.fn(),
      updateMetadata: vi.fn(),
      findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(),
      search: vi.fn().mockResolvedValue(mockFiles),
    } as unknown as IStorageRepository;

    useCase = new FileSearchUseCase(mockRepository, mockProvider);
  });

  describe('searchFiles', () => {
    it('should search files successfully', async () => {
      const result = await useCase.searchFiles({ userId: 'user-1' });

      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      expect(result.searchTime).toBeDefined();
    });

    it('should filter by content type', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        contentType: 'audio',
      });

      expect(result.success).toBe(true);
      expect(result.files!.every(f => f.contentType === 'audio')).toBe(true);
    });

    it('should filter by filename', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        filename: 'song',
      });

      expect(result.success).toBe(true);
      expect(result.files!.every(f => f.originalName.toLowerCase().includes('song'))).toBe(true);
    });

    it('should filter by tags', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        tags: ['jazz'],
      });

      expect(result.success).toBe(true);
      expect(result.files!.every(f => f.tags.includes('jazz'))).toBe(true);
    });

    it('should filter by size range', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        sizeRange: { min: 100000, max: 5000000 },
      });

      expect(result.success).toBe(true);
      expect(result.files!.every(f => f.size >= 100000 && f.size <= 5000000)).toBe(true);
    });

    it('should sort by name ascending', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(result.success).toBe(true);
      const names = result.files!.map(f => f.originalName);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it('should sort by size descending', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        sortBy: 'size',
        sortOrder: 'desc',
      });

      expect(result.success).toBe(true);
      for (let i = 1; i < result.files!.length; i++) {
        expect(result.files![i - 1].size).toBeGreaterThanOrEqual(result.files![i].size);
      }
    });

    it('should paginate results', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        limit: 2,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.files!.length).toBeLessThanOrEqual(2);
      expect(result.hasMore).toBe(true);
    });

    it('should validate limit range', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        limit: 200,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Limit');
    });

    it('should validate negative offset', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        offset: -1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Offset');
    });

    it('should validate size range (min > max)', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        sizeRange: { min: 5000, max: 1000 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Size range');
    });

    it('should calculate relevance scores when sorting by relevance', async () => {
      const result = await useCase.searchFiles({
        userId: 'user-1',
        filename: 'song',
        sortBy: 'relevance',
      });

      expect(result.success).toBe(true);
      if (result.files!.length > 0) {
        expect(result.files![0].relevanceScore).toBeDefined();
      }
    });
  });

  describe('getFileStats', () => {
    it('should return file statistics', async () => {
      const result = await useCase.getFileStats('user-1');

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.totalFiles).toBe(5);
      expect(result.stats!.totalSize).toBeGreaterThan(0);
      expect(result.stats!.filesByType).toBeDefined();
      expect(result.stats!.filesByProvider).toBeDefined();
      expect(result.stats!.storageUsage).toBeDefined();
    });

    it('should filter stats by date range', async () => {
      const result = await useCase.getFileStats('user-1', {
        from: new Date('2024-01-01'),
        to: new Date('2024-12-31'),
      });

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
    });
  });

  describe('searchSimilarFiles', () => {
    it('should find similar files', async () => {
      const result = await useCase.searchSimilarFiles('1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
    });

    it('should fail for non-existent file', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await useCase.searchSimilarFiles('non-existent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('searchDuplicateFiles', () => {
    it('should find duplicate files by checksum', async () => {
      const result = await useCase.searchDuplicateFiles('user-1');

      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
    });
  });

  describe('searchByContent', () => {
    it('should search by filename content', async () => {
      const result = await useCase.searchByContent('song', 'user-1');

      expect(result.success).toBe(true);
      expect(result.files!.length).toBeGreaterThan(0);
    });

    it('should search by tag content', async () => {
      const result = await useCase.searchByContent('jazz', 'user-1');

      expect(result.success).toBe(true);
      expect(result.files!.length).toBeGreaterThan(0);
    });

    it('should filter by content types', async () => {
      const result = await useCase.searchByContent('song', 'user-1', ['audio']);

      expect(result.success).toBe(true);
    });

    it('should return empty for non-matching query', async () => {
      const result = await useCase.searchByContent('xyznonexistent', 'user-1');

      expect(result.success).toBe(true);
      expect(result.files!.length).toBe(0);
    });
  });
});
