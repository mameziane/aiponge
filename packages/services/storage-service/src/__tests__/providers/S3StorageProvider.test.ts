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
  logAndTrackError: (error: unknown, message: string, _context: unknown, _code: string, _statusCode: number) => ({
    error: error instanceof Error ? error : new Error(String(error)),
    correlationId: 'test-correlation-id',
  }),
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
  errorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
  errorStack: vi.fn((err: unknown) => err instanceof Error ? err.stack : ''),
  withResilience: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  createIntervalScheduler: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send = mockSend;
    constructor(_config: unknown) {}
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: class { constructor(public params: unknown) {} },
    GetObjectCommand: class { constructor(public params: unknown) {} },
    DeleteObjectCommand: class { constructor(public params: unknown) {} },
    HeadObjectCommand: class { constructor(public params: unknown) {} },
    ListObjectsV2Command: class { constructor(public params: unknown) {} },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com/test'),
}));

import { S3StorageProvider, S3Config } from '../../infrastructure/providers/S3StorageProvider';

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;
  const testConfig: S3Config = {
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new S3StorageProvider(testConfig);
  });

  describe('upload', () => {
    it('should upload a file to S3 and return URL', async () => {
      mockSend.mockResolvedValueOnce({});

      const file = Buffer.from('test file content');
      const path = 'uploads/test-file.txt';
      const options = { contentType: 'text/plain', isPublic: true };

      const result = await provider.upload(file, path, options);

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe(
        `https://test-bucket.s3.us-east-1.amazonaws.com/${path}`
      );
      expect(result.location).toBeDefined();
    });

    it('should handle upload errors and return failure result', async () => {
      mockSend.mockRejectedValueOnce(new Error('AccessDenied'));

      const file = Buffer.from('test content');
      const result = await provider.upload(file, 'test-path.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('download', () => {
    it('should download a file from S3', async () => {
      const fileContent = Buffer.from('downloaded content');
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array(fileContent)),
        },
        ContentType: 'text/plain',
        ContentLength: fileContent.length,
      });

      const result = await provider.download('test-file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.contentType).toBe('text/plain');
    });

    it('should handle download when Body is a Buffer', async () => {
      const fileContent = Buffer.from('buffer content');
      mockSend.mockResolvedValueOnce({
        Body: fileContent,
        ContentType: 'application/octet-stream',
        ContentLength: fileContent.length,
      });

      const result = await provider.download('test-file.bin');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fileContent);
    });

    it('should return failure when no data received', async () => {
      mockSend.mockResolvedValueOnce({ Body: null });

      const result = await provider.download('empty-file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No data received from S3');
    });

    it('should handle download errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));

      const result = await provider.download('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete a file from S3', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.delete('test-file.txt');

      expect(result.success).toBe(true);
    });

    it('should handle delete errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('AccessDenied'));

      const result = await provider.delete('protected-file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.exists('existing-file.txt');

      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      mockSend.mockRejectedValueOnce(new Error('NotFound'));

      const result = await provider.exists('nonexistent.txt');

      expect(result).toBe(false);
    });
  });

  describe('generateSignedUrl', () => {
    it('should generate signed URL with default expiration', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const result = await provider.generateSignedUrl('test-file.txt');

      expect(result).toBe('https://signed-url.example.com/test');
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('should generate signed URL for write operation', async () => {
      const result = await provider.generateSignedUrl('upload-file.txt', 7200, 'write');

      expect(result).toBe('https://signed-url.example.com/test');
    });

    it('should fallback to public URL on error', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      (getSignedUrl as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Signing failed'));

      const result = await provider.generateSignedUrl('test-file.txt');

      expect(result).toBe(
        'https://test-bucket.s3.us-east-1.amazonaws.com/test-file.txt'
      );
    });
  });

  describe('error handling', () => {
    it('should handle AccessDenied error on upload', async () => {
      mockSend.mockRejectedValueOnce(new Error('AccessDenied: Access denied'));

      const result = await provider.upload(Buffer.from('data'), 'path.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('AccessDenied');
    });

    it('should handle NoSuchKey error on download', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey: The specified key does not exist'));

      const result = await provider.download('missing.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('NoSuchKey');
    });

    it('should handle NetworkError on delete', async () => {
      mockSend.mockRejectedValueOnce(new Error('NetworkError: Network connectivity issue'));

      const result = await provider.delete('file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('NetworkError');
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const lastModified = new Date('2025-01-01');
      mockSend.mockResolvedValueOnce({
        ContentLength: 1024,
        LastModified: lastModified,
        ContentType: 'text/plain',
        ETag: '"abc123"',
      });

      const metadata = await provider.getMetadata('test-file.txt');

      expect(metadata).not.toBeNull();
      expect(metadata!.size).toBe(1024);
      expect(metadata!.lastModified).toEqual(lastModified);
      expect(metadata!.contentType).toBe('text/plain');
      expect(metadata!.checksum).toBe('abc123');
    });

    it('should return null on error', async () => {
      mockSend.mockRejectedValueOnce(new Error('NotFound'));

      const metadata = await provider.getMetadata('missing.txt');

      expect(metadata).toBeNull();
    });
  });

  describe('listFiles', () => {
    it('should list files with given prefix', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'prefix/file1.txt' }, { Key: 'prefix/file2.txt' }],
      });

      const files = await provider.listFiles('prefix/');

      expect(files).toEqual(['prefix/file1.txt', 'prefix/file2.txt']);
    });

    it('should return empty array on error', async () => {
      mockSend.mockRejectedValueOnce(new Error('BucketNotFound'));

      const files = await provider.listFiles('prefix/');

      expect(files).toEqual([]);
    });
  });

  describe('getPublicUrl', () => {
    it('should generate public URL without CDN', () => {
      const url = provider.getPublicUrl('test-file.txt');
      expect(url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/test-file.txt');
    });

    it('should use CDN domain when configured', () => {
      const cdnProvider = new S3StorageProvider({
        ...testConfig,
        cdnDomain: 'https://cdn.example.com',
      });
      const url = cdnProvider.getPublicUrl('test-file.txt');
      expect(url).toBe('https://cdn.example.com/test-file.txt');
    });
  });

  describe('getProviderInfo', () => {
    it('should return S3 provider info', () => {
      const info = provider.getProviderInfo();
      expect(info.name).toBe('s3');
      expect(info.supportsSignedUrls).toBe(true);
      expect(info.supportsStreaming).toBe(true);
      expect(info.supportsPublicUrls).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should reset client state', async () => {
      await provider.initialize();
      await provider.cleanup();

      mockSend.mockResolvedValueOnce({});
      const result = await provider.upload(Buffer.from('data'), 'test.txt');
      expect(result.success).toBe(true);
    });
  });
});
