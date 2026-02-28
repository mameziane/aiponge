import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
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

import { FileVersioningUseCase } from '../../application/use-cases/FileVersioningUseCase';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';

describe('FileVersioningUseCase', () => {
  let useCase: FileVersioningUseCase;
  let mockProvider: IStorageProvider;
  let mockFileRepository: Record<string, ReturnType<typeof vi.fn>>;
  let mockVersionRepository: Record<string, ReturnType<typeof vi.fn>>;
  let versionStore: Record<string, unknown>[];

  beforeEach(() => {
    vi.clearAllMocks();
    versionStore = [];

    mockProvider = {
      upload: vi.fn().mockResolvedValue({ success: true }),
      download: vi.fn().mockResolvedValue({ success: true, data: Buffer.from('version content') }),
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

    mockFileRepository = {
      save: vi.fn(), findById: vi.fn(), findByPath: vi.fn(), findByUserId: vi.fn(),
      delete: vi.fn(), exists: vi.fn(), updateMetadata: vi.fn(), findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(), search: vi.fn(),
    };

    let versionCounter = 0;

    mockVersionRepository = {
      getVersions: vi.fn().mockImplementation((fileId: string) => {
        return Promise.resolve(versionStore.filter(v => v.fileId === fileId));
      }),
      createVersion: vi.fn().mockImplementation((fileId: string, data: Record<string, unknown>) => {
        versionCounter++;
        const row = {
          id: `version-${Date.now()}-${versionCounter}`,
          fileId,
          versionNumber: versionStore.filter(v => v.fileId === fileId).length + 1,
          versionType: data.versionType,
          storageProvider: data.storageProvider,
          storagePath: data.storagePath,
          contentType: data.contentType,
          fileSize: data.fileSize,
          checksum: data.checksum,
          processingParams: data.processingParams,
          createdAt: new Date(),
        };
        versionStore.push(row);
        return Promise.resolve(row);
      }),
      deleteVersion: vi.fn().mockImplementation((versionId: string) => {
        const idx = versionStore.findIndex(v => v.id === versionId);
        if (idx !== -1) versionStore.splice(idx, 1);
        return Promise.resolve();
      }),
      getLatestVersion: vi.fn().mockImplementation((fileId: string) => {
        const versions = versionStore.filter(v => v.fileId === fileId);
        if (versions.length === 0) return Promise.resolve(null);
        return Promise.resolve(versions[versions.length - 1]);
      }),
    };

    useCase = new FileVersioningUseCase(mockFileRepository, mockVersionRepository, mockProvider);
  });

  describe('createVersion', () => {
    it('should create first version successfully', async () => {
      const result = await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('version 1 content'),
        changeDescription: 'Initial version',
      });

      expect(result.success).toBe(true);
      expect(result.versionId).toBeDefined();
      expect(result.versionNumber).toBe(1);
      expect(mockProvider.upload).toHaveBeenCalled();
    });

    it('should increment version number for subsequent versions', async () => {
      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('version 1'),
      });

      const result = await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('version 2'),
      });

      expect(result.versionNumber).toBe(2);
    });

    it('should reject duplicate content', async () => {
      const content = Buffer.from('same content');

      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: content,
      });

      const result = await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: content,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('identical content');
    });

    it('should handle provider upload failure', async () => {
      (mockProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false });

      const result = await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('content'),
      });

      expect(result.success).toBe(false);
    });
  });

  describe('getVersionHistory', () => {
    it('should return empty history for file with no versions', async () => {
      const result = await useCase.getVersionHistory('file-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.versions).toEqual([]);
    });

    it('should return all versions in history', async () => {
      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('v1'),
      });
      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('v2'),
      });

      const result = await useCase.getVersionHistory('file-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.versions!.length).toBe(2);
      const versionNumbers = result.versions!.map(v => v.versionNumber);
      expect(versionNumbers).toContain(1);
      expect(versionNumbers).toContain(2);
    });
  });

  describe('revertToVersion', () => {
    it('should revert to a previous version', async () => {
      const v1 = await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('v1 content'),
      });

      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('v2 content'),
      });

      const result = await useCase.revertToVersion('file-1', v1.versionId!, 'user-1');

      expect(result.success).toBe(true);
      expect(result.versionNumber).toBe(3);
    });

    it('should fail for non-existent version', async () => {
      const result = await useCase.revertToVersion('file-1', 'non-existent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('deleteVersion', () => {
    it('should delete an inactive version', async () => {
      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('v1'),
      });

      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('v2'),
      });

      const history = await useCase.getVersionHistory('file-1', 'user-1');
      const inactiveVersion = history.versions!.find(v => !v.isActive)!;

      const result = await useCase.deleteVersion('file-1', inactiveVersion.versionId, 'user-1');

      expect(result.success).toBe(true);
      expect(mockProvider.delete).toHaveBeenCalledWith(
        expect.stringContaining('versions/file-1/')
      );
    });

    it('should prevent deletion of active version', async () => {
      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('v1'),
      });

      const history = await useCase.getVersionHistory('file-1', 'user-1');
      const activeVersionId = history.versions!.find(v => v.isActive)!.versionId;

      const result = await useCase.deleteVersion('file-1', activeVersionId, 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('active version');
    });

    it('should fail for non-existent version', async () => {
      const result = await useCase.deleteVersion('file-1', 'non-existent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('compareVersions', () => {
    it('should compare two versions', async () => {
      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('short'),
      });

      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('longer content here'),
      });

      const history = await useCase.getVersionHistory('file-1', 'user-1');
      const v1Id = history.versions![1].versionId;
      const v2Id = history.versions![0].versionId;

      const result = await useCase.compareVersions('file-1', v1Id, v2Id, 'user-1');

      expect(result.success).toBe(true);
      expect(result.comparison).toBeDefined();
      expect(result.comparison!.sizeDiff).not.toBe(0);
      expect(result.comparison!.checksumMatch).toBe(false);
    });

    it('should fail when version not found', async () => {
      const result = await useCase.compareVersions('file-1', 'v1', 'v2', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getVersionContent', () => {
    it('should retrieve content for a version', async () => {
      await useCase.createVersion({
        fileId: 'file-1',
        userId: 'user-1',
        newContent: Buffer.from('version content'),
      });

      const history = await useCase.getVersionHistory('file-1', 'user-1');
      const versionId = history.versions![0].versionId;

      const result = await useCase.getVersionContent('file-1', versionId, 'user-1');

      expect(result.success).toBe(true);
      expect(result.content).toBeInstanceOf(Buffer);
      expect(result.version).toBeDefined();
    });

    it('should fail for non-existent version', async () => {
      const result = await useCase.getVersionContent('file-1', 'non-existent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
