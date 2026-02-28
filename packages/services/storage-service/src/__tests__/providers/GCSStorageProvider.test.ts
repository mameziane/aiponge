import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockSave = vi.hoisted(() => vi.fn());
const mockDownload = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockExists = vi.hoisted(() => vi.fn());
const mockGetSignedUrl = vi.hoisted(() => vi.fn());
const mockGetMetadata = vi.hoisted(() => vi.fn());
const mockGetFiles = vi.hoisted(() => vi.fn());

const mockFile = vi.hoisted(() =>
  vi.fn(() => ({
    save: mockSave,
    download: mockDownload,
    delete: mockDelete,
    exists: mockExists,
    getSignedUrl: mockGetSignedUrl,
    getMetadata: mockGetMetadata,
  }))
);

const mockBucket = vi.hoisted(() =>
  vi.fn(() => ({
    file: mockFile,
    getFiles: mockGetFiles,
  }))
);

vi.mock('@google-cloud/storage', () => ({
  Storage: class MockStorage {
    constructor(public options: unknown) {}
    bucket = mockBucket;
  },
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
  SERVICE_URLS: {},
}));

vi.mock('../../application/errors', () => ({
  StorageError: {
    serviceUnavailable: (message: string, cause?: Error) => {
      const error = new Error(message);
      if (cause) (error as Error & { cause?: unknown }).cause = cause;
      return error;
    },
  },
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

import { GCSStorageProvider, GCSConfig } from '../../infrastructure/providers/GCSStorageProvider';

describe('GCSStorageProvider', () => {
  let provider: GCSStorageProvider;
  const testConfig: GCSConfig = {
    projectId: 'test-project',
    bucketName: 'test-bucket',
    keyFilename: '/path/to/keyfile.json',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GCSStorageProvider(testConfig);
  });

  describe('upload', () => {
    it('should upload a file to GCS and return URL', async () => {
      mockSave.mockResolvedValueOnce(undefined);

      const file = Buffer.from('test file content');
      const path = 'uploads/test-file.txt';
      const options = { contentType: 'text/plain', isPublic: true };

      const result = await provider.upload(file, path, options);

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe(`https://storage.googleapis.com/${testConfig.bucketName}/${path}`);
      expect(result.location).toBeDefined();
      expect(mockFile).toHaveBeenCalledWith(path);
      expect(mockSave).toHaveBeenCalledWith(file, {
        metadata: {
          contentType: 'text/plain',
          cacheControl: undefined,
          metadata: undefined,
        },
        public: true,
      });
    });

    it('should upload without public flag when not specified', async () => {
      mockSave.mockResolvedValueOnce(undefined);

      const file = Buffer.from('test content');
      const path = 'uploads/private-file.txt';

      const result = await provider.upload(file, path);

      expect(result.success).toBe(true);
      expect(mockSave).toHaveBeenCalledWith(file, {
        metadata: {
          contentType: undefined,
          cacheControl: undefined,
          metadata: undefined,
        },
      });
    });

    it('should handle upload errors and return failure result', async () => {
      mockSave.mockRejectedValueOnce(new Error('AccessDenied'));

      const file = Buffer.from('test content');
      const result = await provider.upload(file, 'test-path.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('AccessDenied');
    });
  });

  describe('download', () => {
    it('should download a file from GCS', async () => {
      const fileContent = Buffer.from('downloaded content');
      mockDownload.mockResolvedValueOnce([fileContent]);
      mockGetMetadata.mockResolvedValueOnce([
        {
          contentType: 'text/plain',
          size: '18',
        },
      ]);

      const result = await provider.download('test-file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fileContent);
      expect(result.contentType).toBe('text/plain');
      expect(result.size).toBe(18);
      expect(mockFile).toHaveBeenCalledWith('test-file.txt');
    });

    it('should handle download errors', async () => {
      mockDownload.mockRejectedValueOnce(new Error('NoSuchKey'));

      const result = await provider.download('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('NoSuchKey');
    });

    it('should handle file not found error', async () => {
      mockDownload.mockRejectedValueOnce(new Error('No such object: test-bucket/missing.txt'));

      const result = await provider.download('missing.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No such object');
    });
  });

  describe('delete', () => {
    it('should delete a file from GCS', async () => {
      mockDelete.mockResolvedValueOnce(undefined);

      const result = await provider.delete('test-file.txt');

      expect(result.success).toBe(true);
      expect(mockFile).toHaveBeenCalledWith('test-file.txt');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      mockDelete.mockRejectedValueOnce(new Error('AccessDenied'));

      const result = await provider.delete('protected-file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('AccessDenied');
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      mockExists.mockResolvedValueOnce([true]);

      const result = await provider.exists('existing-file.txt');

      expect(result).toBe(true);
      expect(mockFile).toHaveBeenCalledWith('existing-file.txt');
    });

    it('should return false for non-existing file', async () => {
      mockExists.mockResolvedValueOnce([false]);

      const result = await provider.exists('nonexistent.txt');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockExists.mockRejectedValueOnce(new Error('NetworkError'));

      const result = await provider.exists('error-file.txt');

      expect(result).toBe(false);
    });
  });

  describe('generateSignedUrl', () => {
    it('should generate signed URL with default expiration', async () => {
      mockGetSignedUrl.mockResolvedValueOnce(['https://storage.googleapis.com/signed-url']);

      const result = await provider.generateSignedUrl('test-file.txt');

      expect(result).toBe('https://storage.googleapis.com/signed-url');
      expect(mockFile).toHaveBeenCalledWith('test-file.txt');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'read',
        })
      );
    });

    it('should generate signed URL for write operation', async () => {
      mockGetSignedUrl.mockResolvedValueOnce(['https://storage.googleapis.com/signed-write-url']);

      const result = await provider.generateSignedUrl('upload-file.txt', 7200, 'write');

      expect(result).toBe('https://storage.googleapis.com/signed-write-url');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'write',
        })
      );
    });

    it('should fallback to public URL on error', async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error('Signing failed'));

      const result = await provider.generateSignedUrl('test-file.txt');

      expect(result).toBe(`https://storage.googleapis.com/${testConfig.bucketName}/test-file.txt`);
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const timeCreated = '2025-01-01T00:00:00Z';
      mockGetMetadata.mockResolvedValueOnce([
        {
          size: '1024',
          timeCreated,
          contentType: 'text/plain',
          md5Hash: 'abc123',
        },
      ]);

      const metadata = await provider.getMetadata('test-file.txt');

      expect(metadata).not.toBeNull();
      expect(metadata!.size).toBe(1024);
      expect(metadata!.lastModified).toEqual(new Date(timeCreated));
      expect(metadata!.contentType).toBe('text/plain');
      expect(metadata!.checksum).toBe('abc123');
      expect(mockFile).toHaveBeenCalledWith('test-file.txt');
    });

    it('should return null on error', async () => {
      mockGetMetadata.mockRejectedValueOnce(new Error('NotFound'));

      const metadata = await provider.getMetadata('missing.txt');

      expect(metadata).toBeNull();
    });
  });

  describe('listFiles', () => {
    it('should list files with given prefix', async () => {
      mockGetFiles.mockResolvedValueOnce([[{ name: 'prefix/file1.txt' }, { name: 'prefix/file2.txt' }]]);

      const files = await provider.listFiles('prefix/');

      expect(files).toEqual(['prefix/file1.txt', 'prefix/file2.txt']);
      expect(mockGetFiles).toHaveBeenCalledWith({ prefix: 'prefix/' });
    });

    it('should return empty array on error', async () => {
      mockGetFiles.mockRejectedValueOnce(new Error('BucketNotFound'));

      const files = await provider.listFiles('prefix/');

      expect(files).toEqual([]);
    });
  });

  describe('getPublicUrl', () => {
    it('should generate public URL without CDN', () => {
      const url = provider.getPublicUrl('test-file.txt');
      expect(url).toBe(`https://storage.googleapis.com/${testConfig.bucketName}/test-file.txt`);
    });

    it('should use CDN domain when configured', () => {
      const cdnProvider = new GCSStorageProvider({
        ...testConfig,
        cdnDomain: 'https://cdn.example.com',
      });
      const url = cdnProvider.getPublicUrl('test-file.txt');
      expect(url).toBe('https://cdn.example.com/test-file.txt');
    });
  });

  describe('getProviderInfo', () => {
    it('should return GCS provider info', () => {
      const info = provider.getProviderInfo();
      expect(info.name).toBe('gcs');
      expect(info.supportsSignedUrls).toBe(true);
      expect(info.supportsStreaming).toBe(true);
      expect(info.supportsPublicUrls).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle network error on upload', async () => {
      mockSave.mockRejectedValueOnce(new Error('NetworkError: Connection refused'));

      const result = await provider.upload(Buffer.from('data'), 'path.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('NetworkError');
    });

    it('should handle network error on download', async () => {
      mockDownload.mockRejectedValueOnce(new Error('NetworkError: timeout'));

      const result = await provider.download('file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('NetworkError');
    });

    it('should handle network error on delete', async () => {
      mockDelete.mockRejectedValueOnce(new Error('NetworkError: Network connectivity issue'));

      const result = await provider.delete('file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('NetworkError');
    });
  });

  describe('cleanup', () => {
    it('should reset client state', async () => {
      await provider.initialize();
      await provider.cleanup();

      mockSave.mockResolvedValueOnce(undefined);
      const result = await provider.upload(Buffer.from('data'), 'test.txt');
      expect(result.success).toBe(true);
    });
  });
});
