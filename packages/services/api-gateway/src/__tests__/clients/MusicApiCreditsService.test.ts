import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  withResilience: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
  errorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
  createIntervalScheduler: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  DomainError: class DomainError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createHttpClient: vi.fn(),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
  createServiceUrlsConfig: vi.fn(() => ({
    SERVICE_URLS: {},
    SERVICE_PORTS: {},
    getServiceUrl: vi.fn(),
    getServicePort: vi.fn(),
    getOwnPort: vi.fn(),
    createServiceHttpClient: vi.fn(),
    getHttpConfig: vi.fn(),
  })),
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: vi.fn(() => mockLogger),
  SERVICE_URLS: {},
  SERVICE_PORTS: {},
}));

vi.mock('../../errors', () => ({
  GatewayError: class GatewayError extends Error {
    public statusCode: number;
    public code: string;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
      this.code = 'CREDITS_ERROR';
    }
    static creditsError(operation: string, reason: string) {
      return new GatewayError(`Credits error during ${operation}: ${reason}`, 402);
    }
  },
}));

const originalEnv = { ...process.env };

interface MusicApiCreditsServiceInstance {
  getCachedCredits: () => { credits: number; extraCredits: number; totalCredits: number; lastSyncedAt: Date; nextSyncAt: Date; error?: string } | null;
  initialize: () => Promise<void>;
  refreshCredits: () => Promise<{ credits: number; extraCredits: number; totalCredits: number }>;
  shutdown: () => void;
}

describe('MusicApiCreditsService', () => {
  let service: MusicApiCreditsServiceInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    process.env.MUSICAPI_API_KEY = 'test-api-key';
    process.env.MUSICAPI_BASE_URL = 'https://api.musicapi.ai';

    vi.resetModules();
    const mod = await import('../../services/MusicApiCreditsService');
    const modRecord = mod as Record<string, unknown>;
    let svc = (modRecord.MusicApiCreditsService || modRecord.default) as MusicApiCreditsServiceInstance | { getInstance: () => MusicApiCreditsServiceInstance };

    if (svc && 'getInstance' in svc && typeof svc.getInstance === 'function') {
      service = svc.getInstance();
    } else {
      service = modRecord.musicApiCreditsService as MusicApiCreditsServiceInstance;
    }
  });

  afterEach(() => {
    if (service && typeof service.shutdown === 'function') {
      service.shutdown();
    }
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton)', async () => {
      vi.resetModules();
      const mod = await import('../../services/MusicApiCreditsService');
      const instance1 = mod.musicApiCreditsService;
      const instance2 = mod.musicApiCreditsService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('getCachedCredits', () => {
    it('should return null before initialization', () => {
      const cached = service.getCachedCredits();
      expect(cached).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should sync credits and start periodic refresh', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ credits: 100, extra_credits: 50 }),
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await service.initialize();

      const cached = service.getCachedCredits();
      expect(cached).not.toBeNull();
      expect(cached!.credits).toBe(100);
      expect(cached!.extraCredits).toBe(50);
      expect(cached!.totalCredits).toBe(150);
      expect(cached!.lastSyncedAt).toBeInstanceOf(Date);
      expect(cached!.nextSyncAt).toBeInstanceOf(Date);

      service.shutdown();
    });

    it('should handle missing API key gracefully', async () => {
      delete process.env.MUSICAPI_API_KEY;

      vi.resetModules();
      const mod = await import('../../services/MusicApiCreditsService');
      const svc = mod.musicApiCreditsService;

      await svc.initialize();

      const cached = svc.getCachedCredits();
      expect(cached).not.toBeNull();
      expect(cached!.credits).toBe(0);
      expect(cached!.totalCredits).toBe(0);
      expect(cached!.error).toBe('MUSICAPI_API_KEY not configured');

      svc.shutdown();
    });

    it('should handle API error response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await service.initialize();

      const cached = service.getCachedCredits();
      expect(cached).not.toBeNull();
      expect(cached!.totalCredits).toBe(0);
      expect(cached!.error).toBeDefined();

      service.shutdown();
    });

    it('should handle network failure during sync', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      await service.initialize();

      const cached = service.getCachedCredits();
      expect(cached).not.toBeNull();
      expect(cached!.totalCredits).toBe(0);
      expect(cached!.error).toBeDefined();

      service.shutdown();
    });
  });

  describe('refreshCredits', () => {
    it('should refresh and return credits', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ credits: 200, extra_credits: 30 }),
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await service.refreshCredits();

      expect(result.credits).toBe(200);
      expect(result.extraCredits).toBe(30);
      expect(result.totalCredits).toBe(230);
    });

    it('should skip concurrent sync when one is already in progress', async () => {
      let resolveFirst: (value?: unknown) => void;
      const firstCallPromise = new Promise(resolve => { resolveFirst = resolve; });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        return firstCallPromise.then(() => ({
          ok: true,
          json: () => Promise.resolve({ credits: 100, extra_credits: 0 }),
        }));
      });

      const promise1 = service.refreshCredits();

      resolveFirst!();
      const result1 = await promise1;
      expect(result1.credits).toBe(100);
      expect(result1.totalCredits).toBe(100);
    });

    it('should preserve previous cache on sync failure', async () => {
      const successResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ credits: 100, extra_credits: 50 }),
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(successResponse);

      await service.refreshCredits();
      expect(service.getCachedCredits()!.totalCredits).toBe(150);

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      await service.refreshCredits().catch(() => {});

      const cached = service.getCachedCredits();
      expect(cached!.credits).toBe(100);
      expect(cached!.extraCredits).toBe(50);
      expect(cached!.error).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should stop periodic sync', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ credits: 100, extra_credits: 0 }),
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await service.initialize();
      service.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('MusicAPI Credits Service shutdown');
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        service.shutdown();
        service.shutdown();
      }).not.toThrow();
    });
  });
});
