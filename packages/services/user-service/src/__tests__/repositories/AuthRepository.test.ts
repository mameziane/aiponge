import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthRepository } from '../../infrastructure/repositories/AuthRepository';

vi.mock('../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@aiponge/platform-core', () => ({
  serializeError: vi.fn((err: unknown) => err),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    passwordHash: 'hashed_password_123',
    role: 'user',
    status: 'active',
    profile: {},
    phoneE164: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function createMockDb() {
  const mockReturning = vi.fn();
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  const mockSelectWhere = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockDeleteWhere = vi.fn();
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

  return {
    db: {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
    } as unknown as Record<string, unknown>,
    mocks: {
      insert: mockInsert,
      values: mockValues,
      returning: mockReturning,
      select: mockSelect,
      from: mockFrom,
      selectWhere: mockSelectWhere,
      update: mockUpdate,
      set: mockSet,
      updateWhere: mockUpdateWhere,
      updateReturning: mockUpdateReturning,
      delete: mockDelete,
      deleteWhere: mockDeleteWhere,
    },
  };
}

describe('AuthRepository', () => {
  let mockDbResult: ReturnType<typeof createMockDb>;
  let repo: AuthRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult = createMockDb();
    repo = new AuthRepository(mockDbResult.db);
  });

  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        id: 'new-user-id',
        email: 'new@example.com',
        passwordHash: 'hashed_password_123',
        role: 'user',
        status: 'active',
        profile: {},
      };
      const mockUser = createMockUser({ ...userData });
      mockDbResult.mocks.returning.mockResolvedValue([mockUser]);

      const result = await repo.createUser(userData as unknown as Record<string, unknown>);

      expect(result).toBeDefined();
      expect(result.id).toBe(userData.id);
      expect(result.email).toBe(userData.email);
      expect(result.passwordHash).toBe(userData.passwordHash);
      expect(result.role).toBe('user');
      expect(result.status).toBe('active');
      expect(mockDbResult.mocks.insert).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.values).toHaveBeenCalledWith(userData);
      expect(mockDbResult.mocks.returning).toHaveBeenCalled();
    });

    it('should throw error for duplicate email', async () => {
      mockDbResult.mocks.returning.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

      await expect(
        repo.createUser({ email: 'dup@example.com', passwordHash: 'hash' } as unknown as Record<string, unknown>)
      ).rejects.toThrow();
    });
  });

  describe('findUserById', () => {
    it('should find existing user by ID', async () => {
      const mockUser = createMockUser();
      mockDbResult.mocks.selectWhere.mockResolvedValue([mockUser]);

      const result = await repo.findUserById('test-user-id');

      expect(result).toBeDefined();
      expect(result!.id).toBe('test-user-id');
      expect(result!.email).toBe('test@example.com');
      expect(mockDbResult.mocks.select).toHaveBeenCalledTimes(1);
      expect(mockDbResult.mocks.from).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.selectWhere).toHaveBeenCalledWith(expect.anything());
    });

    it('should return null for non-existent user', async () => {
      mockDbResult.mocks.selectWhere.mockResolvedValue([]);

      const result = await repo.findUserById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by email', async () => {
      const mockUser = createMockUser({ email: 'find@example.com' });
      mockDbResult.mocks.selectWhere.mockResolvedValue([mockUser]);

      const result = await repo.findUserByEmail('find@example.com');

      expect(result).toBeDefined();
      expect(result!.email).toBe('find@example.com');
      expect(mockDbResult.mocks.select).toHaveBeenCalledTimes(1);
      expect(mockDbResult.mocks.from).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.selectWhere).toHaveBeenCalledWith(expect.anything());
    });

    it('should return null for non-existent email', async () => {
      mockDbResult.mocks.selectWhere.mockResolvedValue([]);

      const result = await repo.findUserByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findUserByPhone', () => {
    it('should find user by phone number', async () => {
      const mockUser = createMockUser({ phoneE164: '+15551234567' });
      mockDbResult.mocks.selectWhere.mockResolvedValue([mockUser]);

      const result = await repo.findUserByPhone('+15551234567');

      expect(result).toBeDefined();
      expect(result!.phoneE164).toBe('+15551234567');
      expect(mockDbResult.mocks.select).toHaveBeenCalledTimes(1);
      expect(mockDbResult.mocks.from).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.selectWhere).toHaveBeenCalledWith(expect.anything());
    });

    it('should return null for non-existent phone', async () => {
      mockDbResult.mocks.selectWhere.mockResolvedValue([]);

      const result = await repo.findUserByPhone('+15550000000');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user data', async () => {
      const updatedUser = createMockUser({
        passwordHash: 'new_hash',
        updatedAt: new Date('2025-02-01'),
      });
      mockDbResult.mocks.updateReturning.mockResolvedValue([updatedUser]);

      const result = await repo.updateUser('test-user-id', {
        passwordHash: 'new_hash',
      } as unknown as Record<string, unknown>);

      expect(result.passwordHash).toBe('new_hash');
      expect(mockDbResult.mocks.update).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.set).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: 'new_hash' }));
      expect(mockDbResult.mocks.updateWhere).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.updateReturning).toHaveBeenCalled();
    });

    it('should throw error for non-existent user', async () => {
      mockDbResult.mocks.updateReturning.mockResolvedValue([]);

      await expect(
        repo.updateUser('non-existent-id', { passwordHash: 'new_hash' } as unknown as Record<string, unknown>)
      ).rejects.toThrow('User account not found');
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      mockDbResult.mocks.updateWhere.mockResolvedValue(undefined);

      await repo.updateLastLogin('test-user-id');

      expect(mockDbResult.mocks.update).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastLoginAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
      expect(mockDbResult.mocks.updateWhere).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      mockDbResult.mocks.deleteWhere.mockResolvedValue(undefined);

      await repo.deleteUser('test-user-id');

      expect(mockDbResult.mocks.delete).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.deleteWhere).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('incrementFailedLoginAttempts', () => {
    it('should increment failed login attempts', async () => {
      const mockUser = createMockUser({ failedLoginAttempts: 0 });
      mockDbResult.mocks.selectWhere.mockResolvedValue([mockUser]);
      mockDbResult.mocks.updateWhere.mockResolvedValue(undefined);

      const result = await repo.incrementFailedLoginAttempts('test-user-id');

      expect(result.failedAttempts).toBe(1);
      expect(result.lockedUntil).toBeNull();
      expect(mockDbResult.mocks.select).toHaveBeenCalledTimes(1);
      expect(mockDbResult.mocks.update).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 1,
          lockedUntil: null,
        })
      );
    });

    it('should lock account after 5 failed attempts', async () => {
      const mockUser = createMockUser({ failedLoginAttempts: 4 });
      mockDbResult.mocks.selectWhere.mockResolvedValue([mockUser]);
      mockDbResult.mocks.updateWhere.mockResolvedValue(undefined);

      const result = await repo.incrementFailedLoginAttempts('test-user-id');

      expect(result.failedAttempts).toBe(5);
      expect(result.lockedUntil).toBeDefined();
      expect(result.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(mockDbResult.mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        })
      );
    });
  });

  describe('resetFailedLoginAttempts', () => {
    it('should reset failed login attempts to zero', async () => {
      mockDbResult.mocks.updateWhere.mockResolvedValue(undefined);

      await repo.resetFailedLoginAttempts('test-user-id');

      expect(mockDbResult.mocks.update).toHaveBeenCalledWith(expect.anything());
      expect(mockDbResult.mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
      );
      expect(mockDbResult.mocks.updateWhere).toHaveBeenCalledWith(expect.anything());
    });
  });
});
