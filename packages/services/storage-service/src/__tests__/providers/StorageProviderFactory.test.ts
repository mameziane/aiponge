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
  logAndTrackError: (error: unknown, message: string) => ({
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
  findWorkspaceRoot: () => '/mock/workspace',
  getUploadsPath: () => '/mock/workspace/uploads',
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

import {
  StorageProviderFactory,
  StorageConfiguration,
} from '../../infrastructure/providers/StorageProviderFactory';

describe('StorageProviderFactory', () => {
  let factory: StorageProviderFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    (StorageProviderFactory as unknown as { instance: undefined }).instance = undefined;
    factory = new StorageProviderFactory();
  });

  describe('createProvider', () => {
    it('should return local provider by default', async () => {
      const provider = await factory.createProvider();
      const info = provider.getProviderInfo();
      expect(info.name).toBe('local');
    });

    it('should return local provider when type is local', async () => {
      const provider = await factory.createProvider({ provider: 'local' });
      const info = provider.getProviderInfo();
      expect(info.name).toBe('local');
    });

    it('should return S3 provider when type is s3 with config', async () => {
      const provider = await factory.createProvider({
        provider: 's3',
        s3: {
          bucket: 'test-bucket',
          region: 'us-east-1',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      });
      const info = provider.getProviderInfo();
      expect(info.name).toBe('s3');
    });

    it('should throw for s3 provider without config', async () => {
      await expect(
        factory.createProvider({ provider: 's3' })
      ).rejects.toThrow();
    });

    it('should throw for cloudinary provider without config', async () => {
      await expect(
        factory.createProvider({ provider: 'cloudinary' })
      ).rejects.toThrow();
    });

    it('should throw for gcs provider without config', async () => {
      await expect(
        factory.createProvider({ provider: 'gcs' })
      ).rejects.toThrow();
    });

    it('should throw for cdn provider (not yet implemented)', async () => {
      await expect(
        factory.createProvider({ provider: 'cdn' })
      ).rejects.toThrow();
    });

    it('should throw for unknown provider type', async () => {
      await expect(
        factory.createProvider({ provider: 'unknown' as unknown as string })
      ).rejects.toThrow();
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = StorageProviderFactory.getInstance();
      const instance2 = StorageProviderFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use provided default config', () => {
      (StorageProviderFactory as unknown as { instance: undefined }).instance = undefined;
      const config: StorageConfiguration = {
        provider: 'local',
        basePath: '/custom/path',
        baseUrl: 'http://custom.url',
      };
      const instance = StorageProviderFactory.getInstance(config);
      expect(instance).toBeDefined();
    });
  });

  describe('getDefaultProvider', () => {
    it('should return provider using default config', async () => {
      const provider = await factory.getDefaultProvider();
      expect(provider).toBeDefined();
      const info = provider.getProviderInfo();
      expect(info.name).toBe('local');
    });
  });

  describe('updateDefaultConfig', () => {
    it('should update default config', async () => {
      factory.updateDefaultConfig({ basePath: '/new/path' });
      const provider = await factory.getDefaultProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = factory.getSupportedProviders();
      expect(providers).toContain('local');
      expect(providers).toContain('s3');
      expect(providers).toContain('cloudinary');
      expect(providers).toContain('gcs');
    });
  });

  describe('validateConfiguration', () => {
    it('should validate local config', () => {
      expect(factory.validateConfiguration({ provider: 'local' })).toBe(true);
    });

    it('should validate s3 config with s3 options', () => {
      expect(
        factory.validateConfiguration({
          provider: 's3',
          s3: {
            bucket: 'b',
            region: 'us-east-1',
            accessKeyId: 'k',
            secretAccessKey: 's',
          },
        })
      ).toBe(true);
    });

    it('should reject s3 config without s3 options', () => {
      expect(factory.validateConfiguration({ provider: 's3' })).toBe(false);
    });

    it('should accept valid cdn config', () => {
      expect(
        factory.validateConfiguration({
          provider: 'cdn',
          cdn: { cdnDomain: 'cdn.example.com', origin: 'http://origin' },
        })
      ).toBe(true);
    });

    it('should reject cdn config without cdn options', () => {
      expect(factory.validateConfiguration({ provider: 'cdn' })).toBe(false);
    });

    it('should reject unknown provider', () => {
      expect(
        factory.validateConfiguration({ provider: 'unknown' as unknown as string })
      ).toBe(false);
    });
  });

  describe('createAndInitializeProvider', () => {
    it('should create and initialize provider', async () => {
      const provider = await factory.createAndInitializeProvider({
        provider: 'local',
        basePath: '/tmp/test-storage',
      });
      expect(provider).toBeDefined();
    });
  });
});
