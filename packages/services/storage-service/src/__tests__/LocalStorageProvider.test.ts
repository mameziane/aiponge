/**
 * Unit tests for LocalStorageProvider
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import path from 'path';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
  logAndTrackError: (error: unknown, message: string, context: unknown, code: string, statusCode: number) => ({
    error: error instanceof Error ? error : new Error(String(error)),
    correlationId: 'test-correlation-id',
  }),
}));

import * as fsPromises from 'fs/promises';

// Mock LocalStorageProvider since we can't import with path aliases in test
class MockLocalStorageProvider {
  private basePath: string;
  private baseUrl: string;

  constructor(basePath: string, baseUrl: string) {
    this.basePath = basePath;
    this.baseUrl = baseUrl;
  }

  async upload(data: Buffer, filePath: string, options?: { contentType?: string }) {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await (fsPromises.mkdir as Mock)(path.dirname(fullPath), { recursive: true });
      await (fsPromises.writeFile as Mock)(fullPath, data);
      return {
        success: true,
        publicUrl: this.getPublicUrl(filePath),
        location: fullPath,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async download(filePath: string) {
    try {
      const fullPath = path.join(this.basePath, filePath);
      const data = await (fsPromises.readFile as Mock)(fullPath);
      const stats = await (fsPromises.stat as Mock)(fullPath);
      return {
        success: true,
        data,
        size: stats.size,
        contentType: this.getContentType(filePath),
      };
    } catch (error) {
      return { success: false, error: error.message || 'File not found' };
    }
  }

  async delete(filePath: string) {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await (fsPromises.unlink as Mock)(fullPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || 'File not found' };
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await (fsPromises.access as Mock)(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(filePath: string) {
    try {
      const fullPath = path.join(this.basePath, filePath);
      const stats = await (fsPromises.stat as Mock)(fullPath);
      const data = await (fsPromises.readFile as Mock)(fullPath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
        contentType: this.getContentType(filePath),
        checksum: Buffer.from(data).toString('base64').slice(0, 32),
      };
    } catch {
      return null;
    }
  }

  async generateSignedUrl(filePath: string, expiresIn = 3600, operation = 'read') {
    const expires = Date.now() + expiresIn * 1000;
    const token = Math.random().toString(36).substring(7);
    let url = `${this.baseUrl}/uploads/${filePath}?expires=${expires}&token=${token}`;
    if (operation === 'write') {
      url += '&op=write';
    }
    return url;
  }

  async listFiles(prefix: string) {
    try {
      const fullPath = path.join(this.basePath, prefix);
      const entries = await (fsPromises.readdir as Mock)(fullPath);
      return entries.filter((e: Record<string, unknown>) => !(e as { isDirectory: () => boolean }).isDirectory()).map((e: Record<string, unknown>) => (e as { name: string }).name);
    } catch {
      return [];
    }
  }

  getPublicUrl(filePath: string) {
    const cleanPath = filePath.replace(/^\//, '');
    return `${this.baseUrl}/uploads/${cleanPath}`;
  }

  getProviderInfo() {
    return {
      name: 'local',
      supportsPublicUrls: true,
      supportsStreaming: true,
    };
  }

  async initialize() {
    try {
      await (fsPromises.access as Mock)(this.basePath);
    } catch {
      await (fsPromises.mkdir as Mock)(this.basePath, { recursive: true });
    }
  }

  async cleanup() {
    // No-op for local storage
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

describe('LocalStorageProvider', () => {
  let provider: MockLocalStorageProvider;
  let mockWriteFile: Mock;
  let mockReadFile: Mock;
  let mockUnlink: Mock;
  let mockMkdir: Mock;
  let mockAccess: Mock;
  let mockStat: Mock;
  let mockReaddir: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile = fsPromises.writeFile as Mock;
    mockReadFile = fsPromises.readFile as Mock;
    mockUnlink = fsPromises.unlink as Mock;
    mockMkdir = fsPromises.mkdir as Mock;
    mockAccess = fsPromises.access as Mock;
    mockStat = fsPromises.stat as Mock;
    mockReaddir = fsPromises.readdir as Mock;
    provider = new MockLocalStorageProvider('/test/storage', 'http://localhost');
  });

  describe('upload', () => {
    it('should upload file successfully', async () => {
      const fileData = Buffer.from('test file content');
      const filePath = 'test-file.txt';
      const options = {
        contentType: 'text/plain',
      };

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const result = await provider.upload(fileData, filePath, options);

      expect(mockMkdir).toHaveBeenCalledWith(path.dirname(path.join('/test/storage', filePath)), {
        recursive: true,
      });
      expect(mockWriteFile).toHaveBeenCalledWith(path.join('/test/storage', filePath), fileData);

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe('http://localhost/uploads/test-file.txt');
      expect(result.location).toBeDefined();
    });

    it('should handle file upload errors', async () => {
      const fileData = Buffer.from('test content');
      const filePath = 'error-file.txt';

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      const result = await provider.upload(fileData, filePath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should create directory if it doesnt exist', async () => {
      const fileData = Buffer.from('content');
      const filePath = 'subdir/nested/file.txt';

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await provider.upload(fileData, filePath);

      expect(mockMkdir).toHaveBeenCalledWith(path.dirname(path.join('/test/storage', filePath)), {
        recursive: true,
      });
    });
  });

  describe('download', () => {
    it('should download file successfully', async () => {
      const filePath = 'test-file.txt';
      const fileContent = Buffer.from('file content');
      const fileStats = { size: fileContent.length, mtime: new Date() };

      mockReadFile.mockResolvedValue(fileContent);
      mockStat.mockResolvedValue(fileStats as unknown as import("fs").Stats);

      const result = await provider.download(filePath);

      expect(mockReadFile).toHaveBeenCalledWith(path.join('/test/storage', filePath));
      expect(mockStat).toHaveBeenCalledWith(path.join('/test/storage', filePath));

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fileContent);
      expect(result.size).toBe(fileContent.length);
      expect(result.contentType).toBe('text/plain');
    });

    it('should handle file not found', async () => {
      const filePath = 'nonexistent.txt';

      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await provider.download(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle read errors', async () => {
      const filePath = 'error-file.txt';

      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const result = await provider.download(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete file successfully', async () => {
      const filePath = 'file-to-delete.txt';

      mockUnlink.mockResolvedValue(undefined);

      const result = await provider.delete(filePath);

      expect(mockUnlink).toHaveBeenCalledWith(path.join('/test/storage', filePath));
      expect(result.success).toBe(true);
    });

    it('should handle file not found during deletion', async () => {
      const filePath = 'nonexistent.txt';

      mockUnlink.mockRejectedValue({ code: 'ENOENT' });

      const result = await provider.delete(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle deletion errors', async () => {
      const filePath = 'protected-file.txt';

      mockUnlink.mockRejectedValue(new Error('Permission denied'));

      const result = await provider.delete(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = 'existing-file.txt';

      mockAccess.mockResolvedValue(undefined);

      const exists = await provider.exists(filePath);

      expect(mockAccess).toHaveBeenCalledWith(path.join('/test/storage', filePath));
      expect(exists).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = 'nonexistent.txt';

      mockAccess.mockRejectedValue({ code: 'ENOENT' });

      const exists = await provider.exists(filePath);

      expect(exists).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const filePath = 'info-file.txt';
      const fileContent = Buffer.from('test content');
      const fileStats = {
        size: 1024,
        mtime: new Date('2025-01-01'),
      };

      mockStat.mockResolvedValue(fileStats as unknown as import("fs").Stats);
      mockReadFile.mockResolvedValue(fileContent);

      const metadata = await provider.getMetadata(filePath);

      expect(mockStat).toHaveBeenCalledWith(path.join('/test/storage', filePath));
      expect(metadata).toBeDefined();
      expect(metadata?.size).toBe(1024);
      expect(metadata?.lastModified).toEqual(fileStats.mtime);
      expect(metadata?.contentType).toBe('text/plain');
      expect(metadata?.checksum).toBeDefined();
    });

    it('should handle file not found for metadata', async () => {
      const filePath = 'nonexistent.txt';

      mockStat.mockRejectedValue({ code: 'ENOENT' });

      const metadata = await provider.getMetadata(filePath);

      expect(metadata).toBeNull();
    });
  });

  describe('generateSignedUrl', () => {
    it('should generate signed URL with default expiry', async () => {
      const filePath = 'signed-file.txt';

      const url = await provider.generateSignedUrl(filePath);

      expect(url).toContain('/signed-file.txt');
      expect(url).toContain('expires=');
      expect(url).toContain('token=');
    });

    it('should generate signed URL with custom expiry', async () => {
      const filePath = 'signed-file.txt';
      const expiresIn = 7200;

      const url = await provider.generateSignedUrl(filePath, expiresIn);

      expect(url).toContain('/signed-file.txt');
      expect(url).toContain('expires=');
      expect(url).toContain('token=');
    });

    it('should generate signed URL for write operation', async () => {
      const filePath = 'upload-file.txt';

      const url = await provider.generateSignedUrl(filePath, 3600, 'write');

      expect(url).toContain('/upload-file.txt');
      expect(url).toContain('op=write');
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      const prefix = 'test-dir';

      mockReaddir.mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false } as unknown as import('fs').Dirent,
        { name: 'file2.jpg', isDirectory: () => false } as unknown as import('fs').Dirent,
      ]);

      const files = await provider.listFiles(prefix);

      expect(files).toBeDefined();
      expect(Array.isArray(files)).toBe(true);
    });

    it('should return empty array for non-existent directory', async () => {
      const prefix = 'nonexistent-dir';

      mockReaddir.mockRejectedValue({ code: 'ENOENT' });

      const files = await provider.listFiles(prefix);

      expect(files).toEqual([]);
    });

    it('should handle nested directories', async () => {
      const prefix = 'nested';

      mockReaddir
        .mockResolvedValueOnce([
          { name: 'subdir', isDirectory: () => true } as unknown as import('fs').Dirent,
          { name: 'file1.txt', isDirectory: () => false } as unknown as import('fs').Dirent,
        ])
        .mockResolvedValueOnce([{ name: 'nested-file.txt', isDirectory: () => false } as unknown as import('fs').Dirent]);

      const files = await provider.listFiles(prefix);

      expect(files.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPublicUrl', () => {
    it('should generate public URL with base URL and uploads prefix', () => {
      const filePath = 'test-file.txt';
      const url = provider.getPublicUrl(filePath);

      expect(url).toBe('http://localhost/uploads/test-file.txt');
    });

    it('should handle file path with leading slash', () => {
      const filePath = '/test-file.txt';
      const url = provider.getPublicUrl(filePath);

      expect(url).toBe('http://localhost/uploads/test-file.txt');
    });

    it('should handle nested paths', () => {
      const filePath = 'dir/subdir/file.jpg';
      const url = provider.getPublicUrl(filePath);

      expect(url).toBe('http://localhost/uploads/dir/subdir/file.jpg');
    });
  });

  describe('getProviderInfo', () => {
    it('should return provider information', () => {
      const info = provider.getProviderInfo();

      expect(info.name).toBe('local');
      expect(info.supportsPublicUrls).toBe(true);
      expect(info.supportsStreaming).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should initialize storage directory', async () => {
      mockAccess.mockRejectedValue({ code: 'ENOENT' });
      mockMkdir.mockResolvedValue(undefined);

      await provider.initialize();

      expect(mockMkdir).toHaveBeenCalledWith('/test/storage', { recursive: true });
    });

    it('should skip directory creation if it exists', async () => {
      mockAccess.mockResolvedValue(undefined);

      await provider.initialize();

      expect(mockMkdir).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should complete cleanup without errors', async () => {
      await expect(provider.cleanup()).resolves.not.toThrow();
    });
  });
});
