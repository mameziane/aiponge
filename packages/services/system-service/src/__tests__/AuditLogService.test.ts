import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditLogService, type RecordAuditParams, type AuditQueryParams } from '../domains/audit/AuditLogService';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@aiponge/platform-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
  };
});

vi.mock('../config/service-urls', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

function createMockDb() {
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockLimit = vi.fn();
  const mockOffset = vi.fn(() => ({ /* terminal */ }));
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  mockLimit.mockReturnValue({ offset: mockOffset });

  return {
    db: {
      insert: mockInsert,
      select: mockSelect,
    },
    mocks: { mockInsert, mockValues, mockReturning, mockSelect, mockFrom, mockWhere, mockOrderBy, mockLimit, mockOffset },
  };
}

const MOCK_ENTRY = {
  id: 'entry-1',
  actorId: 'user-123',
  actorType: 'user',
  action: 'profile.update',
  resourceType: 'profile',
  resourceId: 'profile-456',
  metadata: { field: 'name' },
  correlationId: 'corr-789',
  severity: 'info',
  createdAt: new Date('2026-01-15'),
};

describe('AuditLogService', () => {
  let service: AuditLogService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = new AuditLogService(mockDb.db);
  });

  describe('recordAudit', () => {
    it('should insert an audit entry and return it', async () => {
      mockDb.mocks.mockReturning.mockResolvedValue([MOCK_ENTRY]);

      const params: RecordAuditParams = {
        actorId: 'user-123',
        actorType: 'user',
        action: 'profile.update',
        resourceType: 'profile',
        resourceId: 'profile-456',
        metadata: { field: 'name' },
        correlationId: 'corr-789',
        severity: 'info',
      };

      const result = await service.recordAudit(params);

      expect(result).toEqual(MOCK_ENTRY);
      expect(mockDb.mocks.mockInsert).toHaveBeenCalledTimes(1);
      expect(mockDb.mocks.mockValues).toHaveBeenCalledWith({
        actorId: 'user-123',
        actorType: 'user',
        action: 'profile.update',
        resourceType: 'profile',
        resourceId: 'profile-456',
        metadata: { field: 'name' },
        correlationId: 'corr-789',
        severity: 'info',
      });
      expect(mockDb.mocks.mockReturning).toHaveBeenCalled();
    });

    it('should use default values for optional fields', async () => {
      mockDb.mocks.mockReturning.mockResolvedValue([MOCK_ENTRY]);

      const params: RecordAuditParams = {
        actorId: 'user-123',
        actorType: 'admin',
        action: 'system.restart',
      };

      await service.recordAudit(params);

      expect(mockDb.mocks.mockValues).toHaveBeenCalledWith({
        actorId: 'user-123',
        actorType: 'admin',
        action: 'system.restart',
        resourceType: null,
        resourceId: null,
        metadata: {},
        correlationId: null,
        severity: 'info',
      });
    });

    it('should log the audit entry after recording', async () => {
      mockDb.mocks.mockReturning.mockResolvedValue([MOCK_ENTRY]);

      await service.recordAudit({
        actorId: 'user-123',
        actorType: 'user',
        action: 'profile.update',
        resourceType: 'profile',
        resourceId: 'profile-456',
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Audit entry recorded', {
        action: 'profile.update',
        actorType: 'user',
        resourceType: 'profile',
        resourceId: 'profile-456',
      });
    });
  });

  describe('queryAuditLog', () => {
    it('should return all entries when no filters are provided', async () => {
      const entries = [MOCK_ENTRY];
      mockDb.mocks.mockOffset.mockResolvedValue(entries);

      const countMockWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countMockFrom = vi.fn(() => ({ where: countMockWhere }));

      let selectCallCount = 0;
      mockDb.db.select = vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: mockDb.mocks.mockFrom };
        }
        return { from: countMockFrom };
      }) as unknown as Record<string, unknown>;

      const result = await service.queryAuditLog({});

      expect(result.entries).toEqual(entries);
      expect(result.total).toBe(1);
      expect(mockDb.mocks.mockWhere).toHaveBeenCalledWith(undefined);
    });

    it('should build conditions for actorId, action, and severity filters', async () => {
      const entries = [MOCK_ENTRY];
      mockDb.mocks.mockOffset.mockResolvedValue(entries);

      const countMockWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countMockFrom = vi.fn(() => ({ where: countMockWhere }));

      let selectCallCount = 0;
      mockDb.db.select = vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: mockDb.mocks.mockFrom };
        }
        return { from: countMockFrom };
      }) as unknown as Record<string, unknown>;

      const params: AuditQueryParams = {
        actorId: 'user-123',
        action: 'profile.update',
        severity: 'warn',
      };

      await service.queryAuditLog(params);

      expect(mockDb.mocks.mockWhere).toHaveBeenCalled();
      const whereArg = mockDb.mocks.mockWhere.mock.calls[0][0];
      expect(whereArg).toBeDefined();
    });

    it('should respect limit and offset parameters', async () => {
      mockDb.mocks.mockOffset.mockResolvedValue([]);

      const countMockWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countMockFrom = vi.fn(() => ({ where: countMockWhere }));

      let selectCallCount = 0;
      mockDb.db.select = vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: mockDb.mocks.mockFrom };
        }
        return { from: countMockFrom };
      }) as unknown as Record<string, unknown>;

      await service.queryAuditLog({ limit: 10, offset: 20 });

      expect(mockDb.mocks.mockLimit).toHaveBeenCalledWith(10);
      expect(mockDb.mocks.mockOffset).toHaveBeenCalledWith(20);
    });

    it('should use default limit of 50 and offset of 0', async () => {
      mockDb.mocks.mockOffset.mockResolvedValue([]);

      const countMockWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countMockFrom = vi.fn(() => ({ where: countMockWhere }));

      let selectCallCount = 0;
      mockDb.db.select = vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: mockDb.mocks.mockFrom };
        }
        return { from: countMockFrom };
      }) as unknown as Record<string, unknown>;

      await service.queryAuditLog({});

      expect(mockDb.mocks.mockLimit).toHaveBeenCalledWith(50);
      expect(mockDb.mocks.mockOffset).toHaveBeenCalledWith(0);
    });
  });

  describe('getResourceHistory', () => {
    it('should filter by resourceType and resourceId', async () => {
      const entries = [MOCK_ENTRY];
      mockDb.mocks.mockLimit.mockReturnValue(entries);

      const result = await service.getResourceHistory('profile', 'profile-456');

      expect(mockDb.mocks.mockWhere).toHaveBeenCalled();
      const whereArg = mockDb.mocks.mockWhere.mock.calls[0][0];
      expect(whereArg).toBeDefined();
      expect(mockDb.mocks.mockLimit).toHaveBeenCalledWith(50);
    });

    it('should respect custom limit parameter', async () => {
      mockDb.mocks.mockLimit.mockReturnValue([]);

      await service.getResourceHistory('profile', 'profile-456', 10);

      expect(mockDb.mocks.mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe('getActorActivity', () => {
    it('should filter by actorId and compute date range', async () => {
      mockDb.mocks.mockLimit.mockReturnValue([MOCK_ENTRY]);

      const result = await service.getActorActivity('user-123', 7);

      expect(mockDb.mocks.mockWhere).toHaveBeenCalled();
      const whereArg = mockDb.mocks.mockWhere.mock.calls[0][0];
      expect(whereArg).toBeDefined();
      expect(mockDb.mocks.mockLimit).toHaveBeenCalledWith(100);
    });

    it('should use default 30 days and limit 100', async () => {
      mockDb.mocks.mockLimit.mockReturnValue([]);

      await service.getActorActivity('actor-999');

      expect(mockDb.mocks.mockLimit).toHaveBeenCalledWith(100);
      expect(mockDb.mocks.mockWhere).toHaveBeenCalled();
    });
  });
});
