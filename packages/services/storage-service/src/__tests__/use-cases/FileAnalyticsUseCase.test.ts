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

import { FileAnalyticsUseCase } from '../../application/use-cases/FileAnalyticsUseCase';
import { FileEntity } from '../../domains/entities/FileEntity';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';

function createMockFileEntity(overrides: {
  id?: string;
  filename?: string;
  size?: number;
  provider?: 'local' | 'aws' | 'gcp' | 'azure';
  createdAt?: Date;
} = {}): FileEntity {
  return new FileEntity(
    overrides.id || 'file-1',
    overrides.filename || 'test.txt',
    {
      bucket: 'default',
      key: 'user/user-1/general/test.txt',
      provider: overrides.provider || 'local',
    },
    {
      size: overrides.size || 1024,
      mimeType: 'text/plain',
      uploadedAt: overrides.createdAt || new Date(),
      uploadedBy: 'user-1',
      isPublic: false,
    },
    overrides.createdAt || new Date(),
    new Date()
  );
}

describe('FileAnalyticsUseCase', () => {
  let useCase: FileAnalyticsUseCase;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockFiles = [
      createMockFileEntity({ id: '1', filename: 'song.mp3', size: 5000000, provider: 'local' }),
      createMockFileEntity({ id: '2', filename: 'image.png', size: 200000, provider: 'aws' }),
      createMockFileEntity({ id: '3', filename: 'doc.pdf', size: 50000, provider: 'local' }),
    ];

    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByPath: vi.fn(),
      findByUserId: vi.fn().mockResolvedValue(mockFiles),
      delete: vi.fn(),
      exists: vi.fn(),
      updateMetadata: vi.fn(),
      findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(),
      search: vi.fn().mockResolvedValue(mockFiles),
    } as unknown as IStorageRepository;

    useCase = new FileAnalyticsUseCase(mockRepository);
  });

  describe('execute', () => {
    it('should return analytics for a user', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.totalFiles).toBe(3);
      expect(result.totalSize).toBe(5250000);
      expect(result.filesByType).toBeDefined();
      expect(result.filesByProvider).toBeDefined();
      expect(result.storageUsage).toBeDefined();
      expect(result.recentActivity).toBeDefined();
      expect(result.trends).toBeDefined();
    });

    it('should group files by extension', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.filesByType['mp3']).toBe(1);
      expect(result.filesByType['png']).toBe(1);
      expect(result.filesByType['pdf']).toBe(1);
    });

    it('should group files by provider', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.filesByProvider['local']).toBe(2);
      expect(result.filesByProvider['aws']).toBe(1);
    });

    it('should calculate storage usage', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.storageUsage.used).toBe(5250000);
      expect(result.storageUsage.available).toBeGreaterThan(0);
      expect(result.storageUsage.percentage).toBeGreaterThan(0);
    });

    it('should return system-wide analytics when no userId', async () => {
      await useCase.execute({});

      expect(mockRepository.search).toHaveBeenCalledWith({ limit: 10000 });
    });

    it('should filter by date range', async () => {
      const oldDate = new Date('2020-01-01');
      const mockFilesWithDates = [
        createMockFileEntity({ id: '1', filename: 'old.txt', createdAt: oldDate }),
        createMockFileEntity({ id: '2', filename: 'new.txt', createdAt: new Date() }),
      ];
      (mockRepository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(mockFilesWithDates);

      const result = await useCase.execute({
        userId: 'user-1',
        startDate: new Date('2024-01-01'),
      });

      expect(result.totalFiles).toBe(1);
    });

    it('should handle repository errors', async () => {
      (mockRepository.findByUserId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      await expect(useCase.execute({ userId: 'user-1' })).rejects.toThrow('Failed to generate file analytics');
    });

    it('should determine upload trend based on recent files', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(['increasing', 'decreasing', 'stable']).toContain(result.trends.uploadTrend);
      expect(['increasing', 'stable']).toContain(result.trends.sizeTrend);
    });
  });
});
