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

import { GetFileMetadataUseCase } from '../../application/use-cases/GetFileMetadataUseCase';
import { StorageError } from '../../application/errors';
import { FileEntity } from '../../domains/entities/FileEntity';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';

function createMockFileEntity(
  overrides: Partial<{ uploadedBy: string; isPublic: boolean; tags: string[]; userId: string }> = {}
): FileEntity {
  const now = new Date();
  return new FileEntity(
    'file-123',
    'test-file.txt',
    {
      bucket: 'my-bucket',
      key: 'user/user-1/general/test.txt',
      provider: 'local',
      path: 'user/user-1/general/test.txt',
      publicUrl: 'http://localhost/uploads/test.txt',
    },
    {
      size: 1024,
      mimeType: 'text/plain',
      contentType: 'text/plain',
      uploadedAt: now,
      uploadedBy: overrides.uploadedBy || 'user-1',
      isPublic: overrides.isPublic ?? false,
      tags: overrides.tags || ['document'],
      userId: overrides.userId || 'user-1',
    },
    now,
    now
  );
}

describe('GetFileMetadataUseCase', () => {
  let useCase: GetFileMetadataUseCase;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(createMockFileEntity()),
      findByPath: vi.fn(),
      findByUserId: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      updateMetadata: vi.fn(),
      findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(),
      search: vi.fn(),
    } as unknown as IStorageRepository;

    useCase = new GetFileMetadataUseCase(mockRepository);
  });

  describe('successful metadata retrieval', () => {
    it('should return full metadata for a file', async () => {
      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result.id).toBe('file-123');
      expect(result.originalName).toBe('test-file.txt');
      expect(result.contentType).toBe('text/plain');
      expect(result.size).toBe(1024);
      expect(result.isPublic).toBe(false);
      expect(result.tags).toEqual(['document']);
      expect(result.userId).toBe('user-1');
      expect(result.storageLocation).toEqual({
        provider: 'local',
        path: 'user/user-1/general/test.txt',
        bucket: 'my-bucket',
      });
    });

    it('should include upload and timestamp info', async () => {
      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result.uploadedAt).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('file not found', () => {
    it('should throw FILE_NOT_FOUND when file does not exist', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(useCase.execute({ fileId: 'non-existent', userId: 'user-1' })).rejects.toThrow('File not found');
    });
  });

  describe('access control', () => {
    it('should throw ACCESS_DENIED for unauthorized users', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockFileEntity({ uploadedBy: 'owner', isPublic: false })
      );

      await expect(useCase.execute({ fileId: 'file-123', userId: 'unauthorized' })).rejects.toThrow(
        'You do not have permission'
      );
    });

    it('should allow access to public files', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockFileEntity({ uploadedBy: 'owner', isPublic: true })
      );

      const result = await useCase.execute({ fileId: 'file-123', userId: 'any-user' });
      expect(result.id).toBe('file-123');
    });
  });
});
