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

import { ResumableUploadUseCase } from '../../application/use-cases/ResumableUploadUseCase';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';
import type { IStorageRepository } from '../../application/interfaces/IStorageRepository';
import { StorageLocation } from '../../domains/value-objects/StorageLocation';

describe('ResumableUploadUseCase', () => {
  let useCase: ResumableUploadUseCase;
  let mockTempProvider: IStorageProvider;
  let mockFinalProvider: IStorageProvider;
  let mockRepository: IStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTempProvider = {
      upload: vi.fn().mockResolvedValue({ success: true }),
      download: vi.fn().mockImplementation((path: string) => {
        const chunkMatch = path.match(/chunk-(\d+)/);
        const idx = chunkMatch ? parseInt(chunkMatch[1]) : 0;
        const chunkData = Buffer.alloc(1024, idx);
        return Promise.resolve({ success: true, data: chunkData });
      }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      exists: vi.fn(),
      generateSignedUrl: vi.fn(),
      getMetadata: vi.fn(),
      listFiles: vi.fn(),
      getPublicUrl: vi.fn(),
      getProviderInfo: vi.fn().mockReturnValue({ name: 'local-temp' }),
      initialize: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as IStorageProvider;

    mockFinalProvider = {
      upload: vi.fn().mockResolvedValue({
        success: true,
        location: new StorageLocation('local', 'uploads/final-file.txt'),
        publicUrl: '/api/storage/files/final-id',
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

    useCase = new ResumableUploadUseCase(mockRepository, mockTempProvider, mockFinalProvider);
  });

  describe('execute - chunk upload', () => {
    it('should create session and upload first chunk', async () => {
      const result = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 3072,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
        tags: ['music'],
      });

      expect(result.success).toBe(true);
      expect(result.uploadId).toBeDefined();
      expect(result.chunkUploaded).toBe(1);
      expect(result.totalChunks).toBe(3);
      expect(result.progress).toBeCloseTo(33.33, 0);
      expect(result.isComplete).toBe(false);
    });

    it('should reuse existing session with uploadId', async () => {
      const first = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
      });

      const second = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 1,
        uploadId: first.uploadId,
        contentType: 'audio',
      });

      expect(second.uploadId).toBe(first.uploadId);
      expect(second.chunkUploaded).toBe(2);
      expect(second.isComplete).toBe(true);
    });

    it('should reject duplicate chunk uploads', async () => {
      const first = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
      });

      const duplicate = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 0,
        uploadId: first.uploadId,
        contentType: 'audio',
      });

      expect(duplicate.success).toBe(false);
      expect(duplicate.error).toContain('already uploaded');
    });

    it('should reject invalid chunk index', async () => {
      const first = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
      });

      const result = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 5,
        uploadId: first.uploadId,
        contentType: 'audio',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid chunk index');
    });
  });

  describe('getUploadStatus', () => {
    it('should return upload progress', async () => {
      const upload = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 3072,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
      });

      const status = await useCase.getUploadStatus(upload.uploadId);

      expect(status.success).toBe(true);
      expect(status.chunkUploaded).toBe(1);
      expect(status.totalChunks).toBe(3);
      expect(status.missingChunks).toEqual([1, 2]);
    });

    it('should return error for non-existent session', async () => {
      const status = await useCase.getUploadStatus('non-existent');

      expect(status.success).toBe(false);
      expect(status.error).toContain('not found');
    });
  });

  describe('cancelUpload', () => {
    it('should cancel an upload session', async () => {
      const upload = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
      });

      const result = await useCase.cancelUpload(upload.uploadId, 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('cancelled');
    });

    it('should reject cancellation by non-owner', async () => {
      const upload = await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
      });

      const result = await useCase.cancelUpload(upload.uploadId, 'user-2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('permissions');
    });

    it('should fail for non-existent session', async () => {
      const result = await useCase.cancelUpload('non-existent', 'user-1');

      expect(result.success).toBe(false);
    });
  });

  describe('getUserUploads', () => {
    it('should list uploads for a user', async () => {
      await useCase.execute({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        originalName: 'file1.mp3',
        mimeType: 'audio/mpeg',
        totalSize: 2048,
        chunkSize: 1024,
        chunkIndex: 0,
        contentType: 'audio',
      });

      const result = await useCase.getUserUploads('user-1');

      expect(result.success).toBe(true);
      expect(result.uploads!.length).toBe(1);
      expect(result.uploads![0].originalName).toBe('file1.mp3');
    });

    it('should return empty for user with no uploads', async () => {
      const result = await useCase.getUserUploads('user-no-uploads');

      expect(result.success).toBe(true);
      expect(result.uploads!.length).toBe(0);
    });
  });
});
