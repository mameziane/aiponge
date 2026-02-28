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

import { DownloadFileUseCase } from '../../application/use-cases/DownloadFileUseCase';
import { StorageError } from '../../application/errors';
import { FileEntity } from '../../domains/entities/FileEntity';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';

function createMockFileEntity(
  overrides: Partial<{ id: string; isPublic: boolean; userId: string; uploadedBy: string }> = {}
): FileEntity {
  return new FileEntity(
    overrides.id || 'file-123',
    'test-file.txt',
    {
      bucket: 'default',
      key: 'user/user-1/general/test.txt',
      provider: 'local',
      path: 'user/user-1/general/test.txt',
      publicUrl: 'http://localhost/uploads/test.txt',
    },
    {
      size: 100,
      mimeType: 'text/plain',
      contentType: 'text/plain',
      uploadedAt: new Date(),
      uploadedBy: overrides.uploadedBy || 'user-1',
      isPublic: overrides.isPublic ?? false,
      userId: overrides.userId || 'user-1',
    },
    new Date(),
    new Date()
  );
}

describe('DownloadFileUseCase', () => {
  let useCase: DownloadFileUseCase;
  let mockProvider: IStorageProvider;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      upload: vi.fn(),
      download: vi.fn().mockResolvedValue({
        success: true,
        data: Buffer.from('file content'),
        contentType: 'text/plain',
        size: 12,
      }),
      delete: vi.fn(),
      exists: vi.fn(),
      generateSignedUrl: vi.fn(),
      getMetadata: vi.fn().mockResolvedValue({
        size: 12,
        lastModified: new Date(),
        contentType: 'text/plain',
        checksum: 'abc123',
      }),
      listFiles: vi.fn(),
      getPublicUrl: vi.fn(),
      getProviderInfo: vi.fn().mockReturnValue({
        name: 'local',
        supportsSignedUrls: false,
        supportsStreaming: false,
        supportsPublicUrls: true,
      }),
      initialize: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as IStorageProvider;

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

    useCase = new DownloadFileUseCase(mockProvider, mockRepository);
  });

  describe('successful download', () => {
    it('should download a file by fileId', async () => {
      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('text/plain');
      expect(result.originalName).toBe('test-file.txt');
      expect(result.size).toBe(12);
    });

    it('should download a file by filePath', async () => {
      (mockRepository.findByPath as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockFileEntity({ isPublic: true })
      );

      const result = await useCase.execute({ filePath: 'user/user-1/general/test.txt', userId: 'user-1' });

      expect(result).toBeDefined();
      expect(mockProvider.download).toHaveBeenCalledWith('user/user-1/general/test.txt');
    });

    it('should include caching metadata in response', async () => {
      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result.lastModified).toBeDefined();
      expect(result.checksum).toBe('abc123');
    });

    it('should return isPublic flag for cache control', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockFileEntity({ isPublic: true }));

      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result.isPublic).toBe(true);
    });
  });

  describe('validation', () => {
    it('should throw when neither fileId nor filePath provided', async () => {
      await expect(useCase.execute({})).rejects.toThrow(StorageError);
    });
  });

  describe('file not found', () => {
    it('should throw FILE_NOT_FOUND when file does not exist', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(useCase.execute({ fileId: 'non-existent' })).rejects.toThrow('File not found');
    });
  });

  describe('access control', () => {
    it('should throw ACCESS_DENIED when user lacks permission', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockFileEntity({ uploadedBy: 'other-user', isPublic: false })
      );

      await expect(useCase.execute({ fileId: 'file-123', userId: 'unauthorized-user' })).rejects.toThrow(
        'You do not have permission'
      );
    });

    it('should allow download of public files by any user', async () => {
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockFileEntity({ uploadedBy: 'owner', isPublic: true })
      );

      const result = await useCase.execute({ fileId: 'file-123', userId: 'any-user' });
      expect(result).toBeDefined();
    });
  });

  describe('provider failure', () => {
    it('should throw when provider download fails', async () => {
      (mockProvider.download as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'File corrupted',
      });

      await expect(useCase.execute({ fileId: 'file-123', userId: 'user-1' })).rejects.toThrow(StorageError);
    });
  });
});
