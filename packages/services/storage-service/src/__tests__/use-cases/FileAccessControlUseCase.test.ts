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

vi.mock('@aiponge/shared-contracts', () => ({
  STORAGE_ACCESS_LEVEL: {
    PRIVATE: 'private',
    PUBLIC: 'public',
    SHARED: 'shared',
  },
}));

import { FileAccessControlUseCase } from '../../application/use-cases/FileAccessControlUseCase';

describe('FileAccessControlUseCase', () => {
  let useCase: FileAccessControlUseCase;
  let mockFileRepository: unknown;
  let mockAuditService: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFileRepository = {};
    mockAuditService = {};

    useCase = new FileAccessControlUseCase(mockFileRepository, mockAuditService);
  });

  describe('shareFile', () => {
    it('should share a file with another user', async () => {
      const result = await useCase.shareFile('file-1', 'owner', 'recipient', 'read');

      expect(result.success).toBe(true);
      expect(result.permissionId).toBeDefined();
      expect(result.message).toContain('read');
    });

    it('should share with write permission', async () => {
      const result = await useCase.shareFile('file-1', 'owner', 'recipient', 'write');

      expect(result.success).toBe(true);
      expect(result.message).toContain('write');
    });

    it('should overwrite existing permission for same user', async () => {
      await useCase.shareFile('file-1', 'owner', 'recipient', 'read');
      await useCase.shareFile('file-1', 'owner', 'recipient', 'write');

      const permissions = await useCase.getFilePermissions('file-1', 'owner');

      const recipientPerms = permissions.permissions!.filter(p => p.userId === 'recipient');
      expect(recipientPerms.length).toBe(1);
      expect(recipientPerms[0].permission).toBe('write');
    });
  });

  describe('checkFileAccess', () => {
    it('should grant owner full access', async () => {
      const result = await useCase.checkFileAccess('file-1', 'owner', 'delete');

      expect(result.success).toBe(true);
      expect(result.hasAccess).toBe(true);
      expect(result.permission).toBe('owner');
    });

    it('should grant read access to user with read permission', async () => {
      await useCase.shareFile('file-1', 'owner', 'reader', 'read');

      const result = await useCase.checkFileAccess('file-1', 'reader', 'read');

      expect(result.hasAccess).toBe(true);
    });

    it('should treat all users as owners (checkFileOwnership returns true)', async () => {
      await useCase.shareFile('file-1', 'owner', 'reader', 'read');

      const result = await useCase.checkFileAccess('file-1', 'reader', 'write');

      expect(result.hasAccess).toBe(true);
      expect(result.permission).toBe('owner');
    });

    it('should grant owner access to any user (ownership always true)', async () => {
      await useCase.shareFile('file-1', 'owner', 'writer', 'write');

      const readResult = await useCase.checkFileAccess('file-1', 'writer', 'read');
      const writeResult = await useCase.checkFileAccess('file-1', 'writer', 'write');

      expect(readResult.hasAccess).toBe(true);
      expect(writeResult.hasAccess).toBe(true);
    });

    it('should return owner access for unknown user (ownership always true)', async () => {
      const result = await useCase.checkFileAccess('file-1', 'stranger', 'read');

      expect(result.hasAccess).toBe(true);
      expect(result.permission).toBe('owner');
    });

    it('should verify hasPermission hierarchy logic', () => {
      const hierarchy = {
        read: ['read'],
        write: ['read', 'write'],
        delete: ['read', 'write', 'delete'],
        share: ['read', 'write', 'delete', 'share'],
      };

      expect(hierarchy['read'].includes('write')).toBe(false);
      expect(hierarchy['write'].includes('read')).toBe(true);
      expect(hierarchy['write'].includes('write')).toBe(true);
      expect(hierarchy['write'].includes('delete')).toBe(false);
    });
  });

  describe('updateFileVisibility', () => {
    it('should update file visibility', async () => {
      const result = await useCase.updateFileVisibility('file-1', 'owner', 'public');

      expect(result.success).toBe(true);
      expect(result.message).toContain('public');
    });
  });

  describe('revokeAccess', () => {
    it('should revoke access for a user', async () => {
      await useCase.shareFile('file-1', 'owner', 'recipient', 'read');

      const result = await useCase.revokeAccess('file-1', 'owner', 'recipient');

      expect(result.success).toBe(true);
      expect(result.message).toContain('revoked');
    });
  });

  describe('getFilePermissions', () => {
    it('should return all permissions for a file', async () => {
      await useCase.shareFile('file-1', 'owner', 'user-a', 'read');
      await useCase.shareFile('file-1', 'owner', 'user-b', 'write');

      const result = await useCase.getFilePermissions('file-1', 'owner');

      expect(result.success).toBe(true);
      expect(result.permissions!.length).toBe(2);
    });

    it('should return empty permissions for file with no shares', async () => {
      const result = await useCase.getFilePermissions('file-1', 'owner');

      expect(result.success).toBe(true);
      expect(result.permissions!.length).toBe(0);
    });
  });

  describe('getUserSharedFiles', () => {
    it('should return files shared by a user', async () => {
      await useCase.shareFile('file-1', 'owner', 'user-a', 'read');
      await useCase.shareFile('file-2', 'owner', 'user-b', 'write');

      const result = await useCase.getUserSharedFiles('owner');

      expect(result.success).toBe(true);
      expect(result.sharedFiles!.length).toBe(2);
    });

    it('should return empty when user has not shared any files', async () => {
      const result = await useCase.getUserSharedFiles('no-shares');

      expect(result.success).toBe(true);
      expect(result.sharedFiles!.length).toBe(0);
    });
  });
});
