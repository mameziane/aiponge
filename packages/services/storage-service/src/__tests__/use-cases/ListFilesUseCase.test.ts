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

import { ListFilesUseCase } from '../../application/use-cases/ListFilesUseCase';
import { FileEntity } from '../../domains/entities/FileEntity';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';

function createMockFileEntity(id: string, isPublic = false, uploadedBy = 'user-1'): FileEntity {
  return new FileEntity(
    id,
    `file-${id}.txt`,
    {
      bucket: 'default',
      key: `user/${uploadedBy}/general/${id}.txt`,
      provider: 'local',
      publicUrl: `http://localhost/uploads/${id}.txt`,
    },
    {
      size: 100,
      mimeType: 'text/plain',
      contentType: 'text/plain',
      uploadedAt: new Date(),
      uploadedBy,
      isPublic,
      tags: ['test'],
    },
    new Date(),
    new Date()
  );
}

describe('ListFilesUseCase', () => {
  let useCase: ListFilesUseCase;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByPath: vi.fn(),
      findByUserId: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      updateMetadata: vi.fn(),
      findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(),
      search: vi
        .fn()
        .mockResolvedValue([
          createMockFileEntity('1', false, 'user-1'),
          createMockFileEntity('2', true, 'user-1'),
          createMockFileEntity('3', true, 'other-user'),
        ]),
    } as unknown as IStorageRepository;

    useCase = new ListFilesUseCase(mockRepository);
  });

  describe('listing files', () => {
    it('should list accessible files for a user', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.files).toBeDefined();
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should return file metadata in response', async () => {
      const result = await useCase.execute({ userId: 'user-1' });

      const file = result.files[0];
      expect(file.id).toBeDefined();
      expect(file.originalName).toBeDefined();
      expect(file.isPublic).toBeDefined();
      expect(file.tags).toBeDefined();
      expect(file.createdAt).toBeDefined();
      expect(file.updatedAt).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const manyFiles = Array.from({ length: 5 }, (_, i) => createMockFileEntity(`file-${i}`, true, 'user-1'));
      (mockRepository.search as ReturnType<typeof vi.fn>).mockResolvedValue(manyFiles);

      const result = await useCase.execute({ userId: 'user-1', limit: 2 });

      expect(result.files.length).toBeLessThanOrEqual(2);
    });

    it('should cap limit at 100', async () => {
      await useCase.execute({ userId: 'user-1', limit: 200 });

      expect(mockRepository.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 101 }));
    });

    it('should indicate hasMore when results exceed limit', async () => {
      const manyFiles = Array.from({ length: 4 }, (_, i) => createMockFileEntity(`file-${i}`, true, 'user-1'));
      (mockRepository.search as ReturnType<typeof vi.fn>).mockResolvedValue(manyFiles);

      const result = await useCase.execute({ userId: 'user-1', limit: 3 });

      expect(result.hasMore).toBe(true);
      expect(result.files.length).toBe(3);
    });

    it('should filter by ownedOnly when specified', async () => {
      const result = await useCase.execute({ userId: 'user-1', ownedOnly: true });

      result.files.forEach(file => {
        expect(['1', '2']).toContain(file.id);
      });
    });
  });

  describe('filtering', () => {
    it('should pass contentType filter to repository', async () => {
      await useCase.execute({ contentType: 'image/png' });

      expect(mockRepository.search).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/png' }));
    });

    it('should pass tags filter to repository', async () => {
      await useCase.execute({ tags: ['music', 'audio'] });

      expect(mockRepository.search).toHaveBeenCalledWith(expect.objectContaining({ tags: ['music', 'audio'] }));
    });

    it('should pass isPublic filter to repository', async () => {
      await useCase.execute({ isPublic: true });

      expect(mockRepository.search).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true }));
    });
  });
});
