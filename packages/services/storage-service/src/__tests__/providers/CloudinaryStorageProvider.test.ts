import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockUpload = vi.hoisted(() => vi.fn());
const mockDestroy = vi.hoisted(() => vi.fn());
const mockResource = vi.hoisted(() => vi.fn());
const mockResources = vi.hoisted(() => vi.fn());
const mockCloudinaryConfig = vi.hoisted(() => vi.fn());
const mockApiSignRequest = vi.hoisted(() => vi.fn());
const mockHttpGet = vi.hoisted(() => vi.fn());

vi.mock('cloudinary', () => ({
  v2: {
    config: mockCloudinaryConfig,
    uploader: {
      upload: mockUpload,
      destroy: mockDestroy,
    },
    api: {
      resource: mockResource,
      resources: mockResources,
    },
    utils: {
      api_sign_request: mockApiSignRequest,
    },
  },
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
  SERVICE_URLS: {},
}));

vi.mock('../../application/errors', () => ({
  StorageError: {
    serviceUnavailable: (message: string) => new Error(message),
    downloadFailed: (message: string) => new Error(message),
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
  errorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
  errorStack: vi.fn((err: unknown) => err instanceof Error ? err.stack : ''),
  withResilience: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  createIntervalScheduler: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

import { CloudinaryStorageProvider, CloudinaryConfig } from '../../infrastructure/providers/CloudinaryStorageProvider';

describe('CloudinaryStorageProvider', () => {
  let provider: CloudinaryStorageProvider;
  const testConfig: CloudinaryConfig = {
    cloudName: 'test-cloud',
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    folder: 'test-folder',
    useAutoOptimization: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CloudinaryStorageProvider(testConfig);
  });

  describe('upload', () => {
    it('should upload a file to Cloudinary and return URL', async () => {
      mockUpload.mockResolvedValueOnce({
        public_id: 'test-folder/uploads/test-file',
        secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/test-folder/uploads/test-file.png',
      });

      const file = Buffer.from('test file content');
      const path = 'uploads/test-file';
      const options = { contentType: 'image/png', isPublic: true };

      const result = await provider.upload(file, path, options);

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe(
        'https://res.cloudinary.com/test-cloud/image/upload/test-folder/uploads/test-file.png'
      );
      expect(result.location).toBeDefined();
      expect(mockUpload).toHaveBeenCalledWith(
        `data:image/png;base64,${file.toString('base64')}`,
        expect.objectContaining({
          public_id: path,
          folder: testConfig.folder,
          resource_type: 'image',
          use_filename: true,
          unique_filename: false,
          overwrite: true,
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          type: 'upload',
        })
      );
    });

    it('should upload without auto optimization for non-image types', async () => {
      mockUpload.mockResolvedValueOnce({
        public_id: 'test-folder/uploads/doc',
        secure_url: 'https://res.cloudinary.com/test-cloud/raw/upload/test-folder/uploads/doc.pdf',
      });

      const file = Buffer.from('pdf content');
      const path = 'uploads/doc';
      const options = { contentType: 'application/pdf' };

      const result = await provider.upload(file, path, options);

      expect(result.success).toBe(true);
      expect(mockUpload).toHaveBeenCalledWith(
        `data:application/pdf;base64,${file.toString('base64')}`,
        expect.objectContaining({
          resource_type: 'raw',
        })
      );
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          transformation: expect.anything(),
        })
      );
    });

    it('should upload video resource type for video content', async () => {
      mockUpload.mockResolvedValueOnce({
        public_id: 'test-folder/uploads/video',
        secure_url: 'https://res.cloudinary.com/test-cloud/video/upload/test-folder/uploads/video.mp4',
      });

      const file = Buffer.from('video content');
      const path = 'uploads/video';
      const options = { contentType: 'video/mp4' };

      const result = await provider.upload(file, path, options);

      expect(result.success).toBe(true);
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          resource_type: 'video',
        })
      );
    });

    it('should handle audio as video resource type', async () => {
      mockUpload.mockResolvedValueOnce({
        public_id: 'test-folder/uploads/audio',
        secure_url: 'https://res.cloudinary.com/test-cloud/video/upload/test-folder/uploads/audio.mp3',
      });

      const file = Buffer.from('audio content');
      const path = 'uploads/audio';
      const options = { contentType: 'audio/mp3' };

      const result = await provider.upload(file, path, options);

      expect(result.success).toBe(true);
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          resource_type: 'video',
        })
      );
    });

    it('should handle upload errors and return failure result', async () => {
      mockUpload.mockRejectedValueOnce(new Error('Upload failed: quota exceeded'));

      const file = Buffer.from('test content');
      const result = await provider.upload(file, 'test-path');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload failed: quota exceeded');
    });
  });

  describe('download', () => {
    it('should download a file from Cloudinary via HTTP', async () => {
      const fileContent = Buffer.from('downloaded content');
      mockHttpGet.mockResolvedValueOnce({
        success: true,
        data: fileContent.buffer,
        headers: { 'content-type': 'image/png' },
        status: 200,
      });

      const result = await provider.download('test-folder/test-file');

      expect(result.success).toBe(true);
      expect(result.contentType).toBe('image/png');
      expect(mockHttpGet).toHaveBeenCalledWith(
        `https://res.cloudinary.com/${testConfig.cloudName}/image/upload/test-folder/test-file`,
        { responseType: 'arraybuffer' }
      );
    });

    it('should handle download HTTP error', async () => {
      mockHttpGet.mockResolvedValueOnce({
        success: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await provider.download('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle download network error', async () => {
      mockHttpGet.mockRejectedValueOnce(new Error('NetworkError: Connection refused'));

      const result = await provider.download('test-file');

      expect(result.success).toBe(false);
      expect(result.error).toContain('NetworkError');
    });
  });

  describe('delete', () => {
    it('should delete a file from Cloudinary', async () => {
      mockDestroy.mockResolvedValueOnce({ result: 'ok' });

      const result = await provider.delete('test-folder/test-file');

      expect(result.success).toBe(true);
      expect(mockDestroy).toHaveBeenCalledWith('test-folder/test-file');
    });

    it('should handle delete errors', async () => {
      mockDestroy.mockRejectedValueOnce(new Error('Not Found'));

      const result = await provider.delete('nonexistent-file');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not Found');
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      mockResource.mockResolvedValueOnce({ public_id: 'existing-file' });

      const result = await provider.exists('existing-file');

      expect(result).toBe(true);
      expect(mockResource).toHaveBeenCalledWith('existing-file');
    });

    it('should return false for non-existing file', async () => {
      mockResource.mockRejectedValueOnce(new Error('Not found'));

      const result = await provider.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('generateSignedUrl', () => {
    it('should return public URL for read operations', async () => {
      const result = await provider.generateSignedUrl('test-file', 3600, 'read');

      expect(result).toBe(
        `https://res.cloudinary.com/${testConfig.cloudName}/image/upload/test-file`
      );
    });

    it('should generate signed upload URL for write operations', async () => {
      await provider.initialize();
      mockApiSignRequest.mockReturnValueOnce('test-signature');

      const result = await provider.generateSignedUrl('test-file', 3600, 'write');

      expect(result).toContain(`https://api.cloudinary.com/v1_1/${testConfig.cloudName}/upload`);
      expect(result).toContain(`api_key=${testConfig.apiKey}`);
      expect(result).toContain('signature=test-signature');
      expect(mockApiSignRequest).toHaveBeenCalledWith(
        expect.objectContaining({ public_id: 'test-file' }),
        testConfig.apiSecret
      );
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const createdAt = '2025-01-01T00:00:00Z';
      mockResource.mockResolvedValueOnce({
        bytes: 2048,
        created_at: createdAt,
        resource_type: 'image',
        format: 'png',
      });

      const metadata = await provider.getMetadata('test-file');

      expect(metadata).not.toBeNull();
      expect(metadata!.size).toBe(2048);
      expect(metadata!.lastModified).toEqual(new Date(createdAt));
      expect(metadata!.contentType).toBe('image/png');
      expect(mockResource).toHaveBeenCalledWith('test-file');
    });

    it('should return null on error', async () => {
      mockResource.mockRejectedValueOnce(new Error('NotFound'));

      const metadata = await provider.getMetadata('missing');

      expect(metadata).toBeNull();
    });
  });

  describe('listFiles', () => {
    it('should list files with given prefix', async () => {
      mockResources.mockResolvedValueOnce({
        resources: [
          { public_id: 'prefix/file1' },
          { public_id: 'prefix/file2' },
        ],
      });

      const files = await provider.listFiles('prefix/');

      expect(files).toEqual(['prefix/file1', 'prefix/file2']);
      expect(mockResources).toHaveBeenCalledWith({
        type: 'upload',
        prefix: 'prefix/',
        max_results: 500,
      });
    });

    it('should return empty array on error', async () => {
      mockResources.mockRejectedValueOnce(new Error('API error'));

      const files = await provider.listFiles('prefix/');

      expect(files).toEqual([]);
    });
  });

  describe('getPublicUrl', () => {
    it('should generate public URL', () => {
      const url = provider.getPublicUrl('test-file');
      expect(url).toBe(`https://res.cloudinary.com/${testConfig.cloudName}/image/upload/test-file`);
    });
  });

  describe('getProviderInfo', () => {
    it('should return Cloudinary provider info', () => {
      const info = provider.getProviderInfo();
      expect(info.name).toBe('cloudinary');
      expect(info.supportsSignedUrls).toBe(true);
      expect(info.supportsStreaming).toBe(false);
      expect(info.supportsPublicUrls).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle Cloudinary API error on upload', async () => {
      mockUpload.mockRejectedValueOnce(new Error('Invalid API key'));

      const result = await provider.upload(Buffer.from('data'), 'path');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('should handle Cloudinary API error on delete', async () => {
      mockDestroy.mockRejectedValueOnce(new Error('Resource not found'));

      const result = await provider.delete('missing-file');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resource not found');
    });
  });

  describe('cleanup', () => {
    it('should reset client state', async () => {
      await provider.initialize();
      await provider.cleanup();

      mockUpload.mockResolvedValueOnce({
        public_id: 'test',
        secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/test',
      });
      const result = await provider.upload(Buffer.from('data'), 'test');
      expect(result.success).toBe(true);
    });
  });
});
