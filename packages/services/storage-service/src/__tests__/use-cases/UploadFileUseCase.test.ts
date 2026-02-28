import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
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

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ format: 'jpeg', width: 100, height: 100 }),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed')),
  })),
}));

vi.mock('../../../src/infrastructure/services/ImageProcessingService', () => ({
  ImageProcessingService: {
    getInstance: () => ({
      isProcessableImage: vi.fn().mockReturnValue(false),
      processImage: vi.fn().mockResolvedValue({
        main: { buffer: Buffer.from('processed'), width: 512, height: 512 },
        thumbnail: { buffer: Buffer.from('thumb'), width: 128, height: 128 },
      }),
    }),
  },
}));

vi.mock('../../../src/infrastructure/events/StorageEventPublisher', () => ({
  StorageEventPublisher: {
    assetUploaded: vi.fn(),
  },
}));

import { UploadFileUseCase } from '../../application/use-cases/UploadFileUseCase';
import { StorageError } from '../../application/errors';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';
import { StorageLocation } from '../../domains/value-objects/StorageLocation';

describe('UploadFileUseCase', () => {
  let useCase: UploadFileUseCase;
  let mockProvider: IStorageProvider;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      upload: vi.fn().mockResolvedValue({
        success: true,
        location: new StorageLocation('local', 'user/test-user/general/test-id.txt', 'http://localhost/uploads/test.txt'),
        publicUrl: 'http://localhost/uploads/test.txt',
      }),
      download: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      generateSignedUrl: vi.fn(),
      getMetadata: vi.fn(),
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
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findByPath: vi.fn(),
      findByUserId: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      updateMetadata: vi.fn(),
      findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(),
      search: vi.fn(),
    } as unknown as IStorageRepository;

    useCase = new UploadFileUseCase(mockProvider, mockRepository);
  });

  describe('successful upload', () => {
    it('should upload a file successfully', async () => {
      const request = {
        file: Buffer.from('test content'),
        originalName: 'test.txt',
        contentType: 'text/plain',
        userId: 'user-123',
      };

      const result = await useCase.execute(request);

      expect(result).toBeDefined();
      expect(result.fileId).toBeDefined();
      expect(result.storageLocation).toBeDefined();
      expect(mockProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('user/user-123/general/'),
        expect.objectContaining({
          contentType: 'text/plain',
        })
      );
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            mimeType: 'text/plain',
            uploadedBy: 'user-123',
          }),
        })
      );
    });

    it('should generate correct file path with userId', async () => {
      const request = {
        file: Buffer.from('test content'),
        originalName: 'test.txt',
        contentType: 'text/plain',
        userId: 'user-123',
        category: 'track' as const,
      };

      await useCase.execute(request);

      const uploadCall = (mockProvider.upload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(uploadCall[1]).toContain('user/user-123/tracks/');
    });

    it('should use anonymous folder when no userId', async () => {
      const request = {
        file: Buffer.from('test content'),
        originalName: 'test.txt',
        contentType: 'text/plain',
      };

      await useCase.execute(request);

      const uploadCall = (mockProvider.upload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(uploadCall[1]).toContain('user/anonymous/');
    });

    it('should store metadata in repository', async () => {
      const request = {
        file: Buffer.from('test content'),
        originalName: 'test.txt',
        contentType: 'text/plain',
        userId: 'user-123',
        tags: ['tag1', 'tag2'],
        isPublic: true,
      };

      await useCase.execute(request);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            mimeType: 'text/plain',
            uploadedBy: 'user-123',
            isPublic: true,
            tags: ['tag1', 'tag2'],
          }),
        })
      );
    });
  });

  describe('validation', () => {
    it('should reject empty file', async () => {
      const request = {
        file: Buffer.alloc(0),
        originalName: 'test.txt',
      };

      await expect(useCase.execute(request)).rejects.toThrow(StorageError);
    });

    it('should reject missing filename', async () => {
      const request = {
        file: Buffer.from('test content'),
        originalName: '',
      };

      await expect(useCase.execute(request)).rejects.toThrow(StorageError);
    });

    it('should reject file exceeding size limit', async () => {
      const request = {
        file: Buffer.alloc(101 * 1024 * 1024),
        originalName: 'large.txt',
      };

      await expect(useCase.execute(request)).rejects.toThrow(StorageError);
    });

    it('should reject filenames with invalid characters', async () => {
      const request = {
        file: Buffer.from('test content'),
        originalName: 'test\x00file.txt',
      };

      await expect(useCase.execute(request)).rejects.toThrow(StorageError);
    });
  });

  describe('provider failure', () => {
    it('should throw when provider upload fails', async () => {
      (mockProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Disk full',
      });

      const request = {
        file: Buffer.from('test content'),
        originalName: 'test.txt',
        contentType: 'text/plain',
      };

      await expect(useCase.execute(request)).rejects.toThrow(StorageError);
    });
  });

  describe('category-based file paths', () => {
    it('should use avatars folder for avatar category', async () => {
      const request = {
        file: Buffer.from('test'),
        originalName: 'avatar.txt',
        userId: 'user-1',
        category: 'avatar' as const,
      };

      await useCase.execute(request);

      const uploadCall = (mockProvider.upload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(uploadCall[1]).toContain('/avatars/');
    });

    it('should use artworks folder for track-artwork category', async () => {
      const request = {
        file: Buffer.from('test'),
        originalName: 'art.txt',
        userId: 'user-1',
        category: 'track-artwork' as const,
      };

      await useCase.execute(request);

      const uploadCall = (mockProvider.upload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(uploadCall[1]).toContain('/artworks/');
    });
  });
});
