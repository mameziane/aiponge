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
}));

import { GenerateSignedUrlUseCase } from '../../application/use-cases/GenerateSignedUrlUseCase';
import { StorageError } from '../../application/errors';
import { FileEntity } from '../../domains/entities/FileEntity';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';

function createMockFileEntity(overrides: Partial<{ uploadedBy: string; isPublic: boolean }> = {}): FileEntity {
  return new FileEntity(
    'file-123',
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

describe('GenerateSignedUrlUseCase', () => {
  let useCase: GenerateSignedUrlUseCase;
  let mockProvider: IStorageProvider;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      generateSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com/file?token=abc'),
      getMetadata: vi.fn(),
      listFiles: vi.fn(),
      getPublicUrl: vi.fn(),
      getProviderInfo: vi.fn().mockReturnValue({
        name: 's3',
        supportsSignedUrls: true,
        supportsStreaming: true,
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

    useCase = new GenerateSignedUrlUseCase(mockProvider, mockRepository);
  });

  describe('successful signed URL generation', () => {
    it('should generate a signed URL with default expiration', async () => {
      const result = await useCase.execute({ fileId: 'file-123', userId: 'user-1' });

      expect(result.signedUrl).toBe('https://signed-url.example.com/file?token=abc');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockProvider.generateSignedUrl).toHaveBeenCalledWith('user/user-1/general/test.txt', 3600, 'read');
    });

    it('should use custom expiration time', async () => {
      const result = await useCase.execute({
        fileId: 'file-123',
        userId: 'user-1',
        expiresIn: 7200,
      });

      expect(result.expiresAt).toBeDefined();
      expect(mockProvider.generateSignedUrl).toHaveBeenCalledWith('user/user-1/general/test.txt', 7200, 'read');
    });

    it('should pass correct operation type', async () => {
      await useCase.execute({
        fileId: 'file-123',
        userId: 'user-1',
        operation: 'write',
      });

      expect(mockProvider.generateSignedUrl).toHaveBeenCalledWith(expect.any(String), 3600, 'write');
    });

    it('should set correct expiresAt date', async () => {
      const before = Date.now();
      const result = await useCase.execute({
        fileId: 'file-123',
        userId: 'user-1',
        expiresIn: 1800,
      });
      const after = Date.now();

      const expectedMin = before + 1800 * 1000;
      const expectedMax = after + 1800 * 1000;

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('provider does not support signed URLs', () => {
    it('should throw when provider does not support signed URLs', async () => {
      (mockProvider.getProviderInfo as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'local',
        supportsSignedUrls: false,
      });

      await expect(useCase.execute({ fileId: 'file-123', userId: 'user-1' })).rejects.toThrow(
        'does not support signed URLs'
      );
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

      await expect(useCase.execute({ fileId: 'file-123', userId: 'hacker' })).rejects.toThrow(
        'You do not have permission'
      );
    });
  });
});
