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
  STORAGE_FILE_LIFECYCLE: {
    ACTIVE: 'active',
    ORPHANED: 'orphaned',
    DELETED: 'deleted',
  },
}));

import { SimpleStorageRepository } from '../../infrastructure/repositories/SimpleStorageRepository';
import { FileEntity, FileLocation, FileMetadata } from '../../domains/entities/FileEntity';

function createTestFile(
  overrides: Partial<{
    id: string;
    filename: string;
    path: string;
    userId: string;
    isPublic: boolean;
    expiresAt?: Date;
  }> = {}
): FileEntity {
  const location: FileLocation = {
    bucket: 'test-bucket',
    key: 'test-key',
    provider: 'local',
    path: overrides.path || '/test/path.txt',
  };

  const metadata: FileMetadata = {
    size: 1024,
    mimeType: 'text/plain',
    uploadedAt: new Date(),
    uploadedBy: overrides.userId || 'user-1',
    isPublic: overrides.isPublic ?? false,
    userId: overrides.userId || 'user-1',
    expiresAt: overrides.expiresAt,
  };

  return new FileEntity(overrides.id || 'file-1', overrides.filename || 'test-file.txt', location, metadata);
}

describe('SimpleStorageRepository', () => {
  let repository: SimpleStorageRepository;

  beforeEach(() => {
    repository = new SimpleStorageRepository();
  });

  describe('save', () => {
    it('should save a file entity', async () => {
      const file = createTestFile();
      await repository.save(file);

      const found = await repository.findById('file-1');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('file-1');
    });

    it('should overwrite existing file with same id', async () => {
      const file1 = createTestFile({ filename: 'original.txt' });
      const file2 = createTestFile({ filename: 'updated.txt' });

      await repository.save(file1);
      await repository.save(file2);

      const found = await repository.findById('file-1');
      expect(found!.filename).toBe('updated.txt');
    });
  });

  describe('findById', () => {
    it('should return file by id', async () => {
      const file = createTestFile({ id: 'find-me' });
      await repository.save(file);

      const result = await repository.findById('find-me');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('find-me');
    });

    it('should return null for non-existing id', async () => {
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByPath', () => {
    it('should return file by storage path', async () => {
      const file = createTestFile({ path: '/uploads/avatar.jpg' });
      await repository.save(file);

      const result = await repository.findByPath('/uploads/avatar.jpg');
      expect(result).not.toBeNull();
    });

    it('should return null for non-existing path', async () => {
      const result = await repository.findByPath('/nonexistent/path');
      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return files for a specific user', async () => {
      const file1 = createTestFile({ id: 'f1', userId: 'user-a' });
      const file2 = createTestFile({ id: 'f2', userId: 'user-a' });
      const file3 = createTestFile({ id: 'f3', userId: 'user-b' });

      await repository.save(file1);
      await repository.save(file2);
      await repository.save(file3);

      const results = await repository.findByUserId('user-a');
      expect(results).toHaveLength(2);
      expect(results.every(f => f.metadata.userId === 'user-a')).toBe(true);
    });

    it('should return empty array for user with no files', async () => {
      const results = await repository.findByUserId('unknown-user');
      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete an existing file', async () => {
      const file = createTestFile({ id: 'delete-me' });
      await repository.save(file);

      const result = await repository.delete('delete-me');
      expect(result).toBe(true);

      const found = await repository.findById('delete-me');
      expect(found).toBeNull();
    });

    it('should return false when deleting non-existing file', async () => {
      const result = await repository.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const file = createTestFile({ id: 'exists-file' });
      await repository.save(file);

      const result = await repository.exists('exists-file');
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const result = await repository.exists('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('updateMetadata', () => {
    it('should update metadata of existing file', async () => {
      const file = createTestFile({ id: 'update-me' });
      await repository.save(file);

      const result = await repository.updateMetadata('update-me', { isPublic: true });
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const result = await repository.updateMetadata('nonexistent', { isPublic: true });
      expect(result).toBe(false);
    });
  });

  describe('findExpired', () => {
    it('should find expired files', async () => {
      const pastDate = new Date('2020-01-01');
      const futureDate = new Date('2099-01-01');

      const expiredFile = createTestFile({ id: 'expired', expiresAt: pastDate });
      const activeFile = createTestFile({ id: 'active', expiresAt: futureDate });

      await repository.save(expiredFile);
      await repository.save(activeFile);

      const expired = await repository.findExpired();
      expect(expired).toHaveLength(1);
      expect(expired[0].id).toBe('expired');
    });

    it('should return empty array when no expired files', async () => {
      const file = createTestFile();
      await repository.save(file);

      const expired = await repository.findExpired();
      expect(expired).toEqual([]);
    });
  });

  describe('search', () => {
    it('should filter by userId', async () => {
      const file1 = createTestFile({ id: 'f1', userId: 'user-x' });
      const file2 = createTestFile({ id: 'f2', userId: 'user-y' });

      await repository.save(file1);
      await repository.save(file2);

      const results = await repository.search({ userId: 'user-x' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('f1');
    });

    it('should filter by isPublic', async () => {
      const publicFile = createTestFile({ id: 'pub', isPublic: true });
      const privateFile = createTestFile({ id: 'priv', isPublic: false });

      await repository.save(publicFile);
      await repository.save(privateFile);

      const results = await repository.search({ isPublic: true });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('pub');
    });

    it('should apply limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.save(createTestFile({ id: `f${i}`, userId: 'user-1' }));
      }

      const results = await repository.search({ limit: 2, offset: 1 });
      expect(results).toHaveLength(2);
    });
  });

  describe('markFileAsOrphaned', () => {
    it('should mark an active file as orphaned', async () => {
      const file = createTestFile({ id: 'orphan-me', path: '/uploads/orphan.txt' });
      await repository.save(file);

      const result = await repository.markFileAsOrphaned('/uploads/orphan.txt');
      expect(result).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      const result = await repository.markFileAsOrphaned('/nonexistent/path');
      expect(result).toBe(false);
    });
  });

  describe('findAll', () => {
    it('should return all files', async () => {
      await repository.save(createTestFile({ id: 'f1' }));
      await repository.save(createTestFile({ id: 'f2' }));

      const results = await repository.findAll();
      expect(results).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('should return number of files', async () => {
      await repository.save(createTestFile({ id: 'f1' }));
      await repository.save(createTestFile({ id: 'f2' }));

      const count = await repository.count();
      expect(count).toBe(2);
    });
  });

  describe('close', () => {
    it('should clear all files', async () => {
      await repository.save(createTestFile());
      await repository.close();

      const count = await repository.count();
      expect(count).toBe(0);
    });
  });

  describe('update', () => {
    it('should update an existing file', async () => {
      const file = createTestFile({ id: 'update-file' });
      await repository.save(file);

      const updated = await repository.update('update-file', { filename: 'new-name.txt' });
      expect(updated.filename).toBe('new-name.txt');
    });

    it('should throw for non-existing file', async () => {
      await expect(repository.update('nonexistent', { filename: 'new.txt' })).rejects.toThrow();
    });
  });
});
