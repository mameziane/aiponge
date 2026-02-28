import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const MockDomainError = vi.hoisted(() => {
  return class DomainError extends Error {
    code: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code || 'UNKNOWN';
      this.name = 'DomainError';
    }
  };
});

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: MockDomainError,
  createHttpClient: vi.fn().mockReturnValue({}),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  getServiceUrl: vi.fn(),
  waitForService: vi.fn(),
  listServices: vi.fn(),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  serializeError: vi.fn((err: unknown) => err),
}));

vi.mock('../../schema/music-schema', () => ({
  streamSessions: {
    id: 'id',
    trackId: 'trackId',
    userId: 'userId',
    status: 'status',
    startedAt: 'startedAt',
    endedAt: 'endedAt',
    duration: 'duration',
    bytesStreamed: 'bytesStreamed',
    bitrate: 'bitrate',
    bufferEvents: 'bufferEvents',
  },
  streamAnalytics: {
    id: 'id',
    trackId: 'trackId',
    userId: 'userId',
    date: 'date',
    totalPlays: 'totalPlays',
    totalDuration: 'totalDuration',
    uniqueListeners: 'uniqueListeners',
    averageCompletion: 'averageCompletion',
    skipRate: 'skipRate',
    averageBitrate: 'averageBitrate',
    bufferEvents: 'bufferEvents',
    qualityAdaptations: 'qualityAdaptations',
    deviceType: 'deviceType',
    country: 'country',
    region: 'region',
  },
}));

import { DrizzleStreamingRepository } from '../../infrastructure/database/DrizzleStreamingRepository';

const mockSession = {
  id: 'session-1',
  trackId: 'track-1',
  userId: 'user-1',
  status: 'active',
  startedAt: new Date(),
  endedAt: null,
  duration: null,
  bytesStreamed: null,
  bitrate: 128,
  bufferEvents: 0,
  quality: 'high',
  deviceType: 'web',
};

function createMockDb() {
  const mockDb: Record<string, ReturnType<typeof vi.fn>> & { _mocks?: Record<string, ReturnType<typeof vi.fn>> } = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockSession]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    query: {},
    transaction: vi.fn(async (fn: (db: typeof mockDb) => unknown) => fn(mockDb)),
    then: undefined,
  };
  return mockDb;
}

describe('DrizzleStreamingRepository', () => {
  let repository: DrizzleStreamingRepository;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repository = new DrizzleStreamingRepository(mockDb);
  });

  describe('createSession', () => {
    it('should insert a new session and return it', async () => {
      const newSession = {
        trackId: 'track-1',
        userId: 'user-1',
        bitrate: 128,
        quality: 'high',
        deviceType: 'web',
      };

      const result = await repository.createSession(newSession as unknown as Record<string, unknown>);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          trackId: 'track-1',
          userId: 'user-1',
          status: 'active',
        })
      );
      expect(result).toEqual(mockSession);
    });

    it('should generate an id if not provided', async () => {
      const newSession = {
        trackId: 'track-1',
        userId: 'user-1',
      };

      await repository.createSession(newSession as unknown as Record<string, unknown>);

      const valuesArg = mockDb.values.mock.calls[0][0];
      expect(valuesArg.id).toBeDefined();
      expect(valuesArg.status).toBe('active');
    });
  });

  describe('getSession', () => {
    it('should return session when found', async () => {
      mockDb.limit.mockResolvedValue([mockSession]);

      const result = await repository.getSession('session-1');

      expect(result).toEqual(mockSession);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.getSession('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session fields', async () => {
      await repository.updateSession('session-1', { status: 'paused' } as unknown as Record<string, unknown>);

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }));
    });
  });

  describe('endSession', () => {
    it('should end session with duration and bytes', async () => {
      await repository.endSession('session-1', {
        duration: 180,
        bytesStreamed: 5000000,
      });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: 180,
          bytesStreamed: 5000000,
          status: 'completed',
        })
      );
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions for a user', async () => {
      mockDb.orderBy.mockResolvedValue([mockSession]);

      const result = await repository.getActiveSessions('user-1');

      expect(result).toEqual([mockSession]);
    });

    it('should return all active sessions when no userId', async () => {
      mockDb.orderBy.mockResolvedValue([mockSession]);

      const result = await repository.getActiveSessions();

      expect(result).toEqual([mockSession]);
    });

    it('should handle empty results', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await repository.getActiveSessions('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getStreamingStats', () => {
    it('should return streaming stats for a track', async () => {
      const stats = {
        totalStreams: 100,
        totalDuration: 5000,
        uniqueListeners: 50,
        averageCompletion: 0,
      };
      mockDb.where.mockResolvedValue([stats]);

      const result = await repository.getStreamingStats('track-1');

      expect(result).toEqual(stats);
    });

    it('should return default stats when no data', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.getStreamingStats('track-1');

      expect(result).toEqual({
        totalStreams: 0,
        totalDuration: 0,
        uniqueListeners: 0,
        averageCompletion: 0,
      });
    });
  });

  describe('getUserStreamingStats', () => {
    it('should return user streaming stats', async () => {
      const stats = {
        totalStreams: 50,
        totalDuration: 3600,
        uniqueTracks: 20,
      };
      mockDb.where.mockResolvedValue([stats]);

      const result = await repository.getUserStreamingStats('user-1');

      expect(result).toEqual(stats);
    });

    it('should return default stats when no data', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.getUserStreamingStats('user-1');

      expect(result).toEqual({
        totalStreams: 0,
        totalDuration: 0,
        uniqueTracks: 0,
      });
    });

    it('should accept custom days parameter', async () => {
      mockDb.where.mockResolvedValue([{ totalStreams: 10, totalDuration: 500, uniqueTracks: 5 }]);

      const result = await repository.getUserStreamingStats('user-1', 7);

      expect(result).toBeDefined();
    });
  });
});
