import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockAuditService = vi.hoisted(() => ({
  log: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  getAuditService: () => mockAuditService,
  getCorrelationContext: () => ({ correlationId: 'test-correlation-id' }),
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

import { DeleteFileUseCase } from '../../application/use-cases/DeleteFileUseCase';
import { StorageError } from '../../application/errors';
import { FileEntity } from '../../domains/entities/FileEntity';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';

function createMockFileEntity(
  overrides: Partial<{ id: string; uploadedBy: string; isPublic: boolean }> = {}
): FileEntity {
  return new FileEntity(
    overrides.id || 'file-123',
    'test-file.txt',
    {
      bucket: 'default',
      key: 'user/user-1/general/test.txt',
      provider: 'local',
      path: 'user/user-1/general/test.txt',
    },
    {
      size: 100,
      mimeType: 'text/plain',
      uploadedAt: new Date(),
      uploadedBy: overrides.uploadedBy || 'user-1',
      isPublic: overrides.isPublic ?? false,
    },
    new Date(),
    new Date()
  );
}

describe('DeleteFileUseCase', () => {
  let useCase: DeleteFileUseCase;
  let mockProvider: IStorageProvider;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn().mockResolvedValue({ success: true }),
      exists: vi.fn(),
      generateSignedUrl: vi.fn(),
      getMetadata: vi.fn(),
      listFiles: vi.fn(),
      getPublicUrl: vi.fn(),
      getProviderInfo: vi.fn().mockReturnValue({ name: 'local' }),
      initialize: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as IStorageProvider;

    mockRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(createMockFileEntity()),
      findByPath: vi.fn(),
      findByUserId: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      exists: vi.fn(),
      updateMetadata: vi.fn(),
      findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(),
      search: vi.fn(),
    } as unknown as IStorageRepository;

    useCase = new DeleteFileUseCase(mockProvider, mockRepository);
  });

  describe('successful deletion', () => {
    it('should delete file from provider and repository', async () => {
      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('File deleted successfully');
      expect(mockProvider.delete).toHaveBeenCalledWith('user/user-1/general/test.txt');
      expect(mockRepository.delete).toHaveBeenCalledWith('file-123');
    });

    it('should audit log the deletion', async () => {
      await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          targetType: 'file',
          targetId: 'file-123',
        })
      );
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
  });

  describe('partial failure', () => {
    it('should still delete from repository when provider deletion fails', async () => {
      (mockProvider.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Provider error',
      });

      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result.success).toBe(true);
      expect(mockRepository.delete).toHaveBeenCalledWith('file-123');
    });

    it('should throw when repository deletion fails', async () => {
      (mockRepository.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(useCase.execute({ fileId: 'file-123', userId: 'user-1' })).rejects.toThrow(
        'Failed to delete file from database'
      );
    });
  });
});
