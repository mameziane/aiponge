import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockHttpGet = vi.hoisted(() => vi.fn());

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
    get: mockHttpGet,
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

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('compressed-image')),
  })),
}));

import { DownloadExternalFileUseCase } from '../../application/use-cases/DownloadExternalFileUseCase';
import { StorageError } from '../../application/errors';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';
import { StorageLocation } from '../../domains/value-objects/StorageLocation';

describe('DownloadExternalFileUseCase', () => {
  let useCase: DownloadExternalFileUseCase;
  let mockProvider: IStorageProvider;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngBody = Buffer.alloc(100, 0);
    const pngBuffer = Buffer.concat([pngHeader, pngBody]);

    mockHttpGet.mockResolvedValue(pngBuffer);

    mockProvider = {
      upload: vi.fn().mockResolvedValue({
        success: true,
        location: new StorageLocation('local', 'uploads/test-file.png', '/uploads/test-file.png'),
        publicUrl: '/uploads/test-file.png',
      }),
      download: vi.fn(),
      delete: vi.fn(),
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

    useCase = new DownloadExternalFileUseCase(mockProvider, mockRepository);
  });

  describe('successful download', () => {
    it('should download from external URL and save to storage', async () => {
      const result = await useCase.execute({
        taskId: 'task-123',
        externalUrl: 'https://example.com/image.png',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.localPath).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
      expect(result.format).toBe('png');
      expect(result.fileId).toBeDefined();
      expect(mockProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('uploads/'),
        expect.objectContaining({
          contentType: 'image/png',
        })
      );
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            mimeType: 'image/png',
            uploadedBy: 'system',
            isPublic: false,
          }),
        })
      );
    });

    it('should handle base64 data URLs', async () => {
      const base64Content = Buffer.from('test-image-content').toString('base64');
      const dataUrl = `data:image/png;base64,${base64Content}`;

      const result = await useCase.execute({
        taskId: 'task-123',
        externalUrl: dataUrl,
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('png');
    });

    it('should save to custom destination path', async () => {
      const result = await useCase.execute({
        taskId: 'task-123',
        externalUrl: 'https://example.com/image.png',
        destinationPath: 'user/user-1/artworks',
      });

      expect(result.success).toBe(true);
      expect(result.localPath).toContain('user/user-1/artworks');
    });

    it('should extract userId from destination path', async () => {
      await useCase.execute({
        taskId: 'task-123',
        externalUrl: 'https://example.com/image.png',
        destinationPath: 'user/user-42/tracks',
      });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            uploadedBy: 'user-42',
          }),
        })
      );
    });
  });

  describe('file type detection', () => {
    it('should detect MP3 from magic bytes (ID3)', async () => {
      const mp3Header = Buffer.from([0x49, 0x44, 0x33, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const mp3Body = Buffer.alloc(100, 0);
      mockHttpGet.mockResolvedValue(Buffer.concat([mp3Header, mp3Body]));

      const result = await useCase.execute({
        taskId: 'task-123',
        externalUrl: 'https://example.com/audio',
      });

      expect(result.format).toBe('mp3');
    });

    it('should detect JPEG from magic bytes', async () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
      const jpegBody = Buffer.alloc(100, 0);
      mockHttpGet.mockResolvedValue(Buffer.concat([jpegHeader, jpegBody]));

      const result = await useCase.execute({
        taskId: 'task-123',
        externalUrl: 'https://example.com/photo',
      });

      expect(result.format).toBe('jpg');
    });
  });

  describe('error handling', () => {
    it('should throw on invalid data URL format', async () => {
      await expect(
        useCase.execute({
          taskId: 'task-123',
          externalUrl: 'data:invalid-format',
        })
      ).rejects.toThrow('Invalid data URL format');
    });

    it('should throw when provider upload fails', async () => {
      (mockProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Disk full',
      });

      await expect(
        useCase.execute({
          taskId: 'task-123',
          externalUrl: 'https://example.com/image.png',
        })
      ).rejects.toThrow(StorageError);
    });

    it('should throw when external download fails', async () => {
      mockHttpGet.mockRejectedValue(new Error('Network error'));

      await expect(
        useCase.execute({
          taskId: 'task-123',
          externalUrl: 'https://example.com/image.png',
        })
      ).rejects.toThrow(StorageError);
    });
  });

  describe('filename generation', () => {
    it('should generate filename with track-art prefix for artwork metadata type', async () => {
      await useCase.execute({
        taskId: 'task-123',
        externalUrl: 'https://example.com/image.png',
        metadata: { type: 'track-artwork' },
      });

      const uploadCall = (mockProvider.upload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(uploadCall[1]).toContain('track-art_');
    });

    it('should use uploads directory when no destination path', async () => {
      const result = await useCase.execute({
        taskId: 'task-123',
        externalUrl: 'https://example.com/image.png',
      });

      expect(result.localPath).toContain('uploads/');
    });
  });
});
