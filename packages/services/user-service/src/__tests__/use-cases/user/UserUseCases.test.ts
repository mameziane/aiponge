import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  getServiceUrl: vi.fn(() => 'http://mock-service:3000'),
  createServiceHttpClient: vi.fn(() => ({
    deleteWithResponse: vi.fn().mockResolvedValue({ ok: true, status: 200, data: {} }),
    getWithResponse: vi.fn().mockResolvedValue({ ok: true, status: 200, data: {} }),
  })),
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
  DomainErrorCode: {},
  createDomainServiceError: vi.fn(
    () =>
      class MockDomainError extends Error {
        public readonly statusCode: number;
        public readonly code?: string;
        constructor(message: string, statusCode: number = 500, code?: string, _cause?: Error) {
          super(message);
          this.statusCode = statusCode;
          this.code = code;
        }
      }
  ),
  signUserIdHeader: vi.fn(() => ({ 'x-user-id': 'mock' })),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password_123'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  USER_ROLES: { USER: 'user', ADMIN: 'admin', LIBRARIAN: 'librarian' },
  USER_STATUS: { ACTIVE: 'active', INACTIVE: 'inactive' },
  normalizeRole: vi.fn((role: string) => role),
  isValidRole: vi.fn((role: string) => ['user', 'admin', 'librarian'].includes(role)),
}));

vi.mock('@aiponge/shared-contracts/storage', () => ({
  markFileAsOrphaned: vi.fn().mockResolvedValue({ success: true, marked: true }),
}));

vi.mock('../../../application/services/ProfileNameUpdateHelper', () => ({
  ProfileNameUpdateHelper: {
    updateAndSync: vi.fn().mockResolvedValue({
      newDisplayName: 'Updated Name',
      displayNameChanged: true,
    }),
  },
}));

vi.mock('../../../infrastructure/events/UserEventPublisher', () => ({
  UserEventPublisher: {
    userDeleted: vi.fn(),
  },
}));

vi.mock('../../../infrastructure/database/DatabaseConnectionFactory', () => ({
  getDatabase: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        catch: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    transaction: vi.fn().mockImplementation(async (cb: Function) => {
      const tx = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
            catch: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      await cb(tx);
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

vi.mock('../../../infrastructure/database/schemas/profile-schema', () => ({
  usrProfiles: { userId: 'userId', onboardingInitialized: 'onboardingInitialized' },
  usrInsights: { userId: 'userId' },
  usrReflections: { userId: 'userId' },
  libBookGenerationRequests: { userId: 'userId' },
  usrUserPatterns: { userId: 'userId' },
  usrUserPersonas: { userId: 'userId' },
  usrProfileAnalytics: { userId: 'userId' },
  usrProfileThemeFrequencies: { userId: 'userId' },
  usrProfileMetrics: { userId: 'userId' },
  usrReminders: { userId: 'userId' },
  usrExpoPushTokens: { userId: 'userId' },
  usrConsentRecords: { userId: 'userId' },
  usrImportBackups: { userId: 'userId' },
  usrRiskFlags: { userId: 'userId' },
}));

vi.mock('../../../infrastructure/database/schemas/library-schema', () => ({
  libBooks: { userId: 'userId', id: 'id' },
  libChapters: { bookId: 'bookId', userId: 'userId' },
  libEntries: { bookId: 'bookId' },
  libIllustrations: { bookId: 'bookId', url: 'url', artworkUrl: 'artworkUrl' },
}));

vi.mock('../../../infrastructure/database/schemas/audit-schema', () => ({
  usrAuditLogs: { userId: 'userId' },
}));

vi.mock('../../../infrastructure/database/schemas/subscription-schema', () => ({
  usrSubscriptions: { userId: 'userId' },
  usrUsageLimits: { userId: 'userId' },
  usrSubscriptionEvents: { userId: 'userId' },
  usrGuestConversionState: { userId: 'userId' },
  usrGuestDataMigrations: { newUserId: 'newUserId' },
}));

vi.mock('../../../infrastructure/database/schemas/user-schema', () => ({
  users: { id: 'id' },
  userCredits: { userId: 'userId' },
  creditTransactions: { userId: 'userId' },
  creditOrders: { userId: 'userId' },
  creditGifts: { senderId: 'senderId', recipientId: 'recipientId' },
  userSessions: { userId: 'userId' },
  passwordResetTokens: { userId: 'userId' },
  smsVerificationCodes: { userId: 'userId' },
  tokenBlacklist: { userId: 'userId' },
}));

vi.mock('../../../infrastructure/services', () => ({
  EncryptionService: {
    getInstance: vi.fn(() => ({
      decrypt: vi.fn((content: string) => content.replace('ENC:', 'DECRYPTED:')),
    })),
  },
}));

vi.mock('../../../infrastructure/repositories/CreatorMemberRepository', () => ({
  CreatorMemberRepository: vi.fn().mockImplementation(() => ({
    createSelfRelationship: vi.fn().mockResolvedValue(undefined),
    addAllUsersToLibrarian: vi.fn().mockResolvedValue(5),
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn(),
  or: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}));

import { CreateUserUseCase, type CreateUserDTO } from '../../../application/use-cases/user/CreateUserUseCase';
import { RegisterUserUseCase, type RegisterUserRequest } from '../../../application/use-cases/user/RegisterUserUseCase';
import {
  UpdateUserUseCase,
  UpdateUserSettingsUseCase,
  ChangePasswordUseCase,
  UpdateUserRoleUseCase,
} from '../../../application/use-cases/user/UpdateUserUseCase';
import { DeleteUserDataUseCase } from '../../../application/use-cases/user/DeleteUserDataUseCase';
import { ExportUserDataUseCase } from '../../../application/use-cases/user/ExportUserDataUseCase';
import { AssignLibrarianRoleUseCase } from '../../../application/use-cases/user/AssignLibrarianRoleUseCase';
import { InitializeUserOnboardingUseCase } from '../../../application/use-cases/onboarding/InitializeUserOnboardingUseCase';
import type { IAuthRepository } from '../../../domains/auth/repositories/IAuthRepository';
import type { ISubscriptionRepository } from '../../../domains/subscriptions/repositories/ISubscriptionRepository';
import type { ICreditRepository } from '../../../domains/credits/repositories/ICreditRepository';

function createMockAuthRepository(): IAuthRepository {
  return {
    createUser: vi.fn(),
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserByPhone: vi.fn(),
    findUserByIdentifier: vi.fn(),
    updateUser: vi.fn(),
    updateLastLogin: vi.fn(),
    deleteUser: vi.fn(),
    getUserById: vi.fn(),
    registerUserWithProfile: vi.fn(),
    createSmsVerificationCode: vi.fn(),
    findLatestSmsCode: vi.fn(),
    updateSmsVerificationCode: vi.fn(),
    cleanupExpiredSmsCode: vi.fn(),
    createPasswordResetToken: vi.fn(),
    findPasswordResetTokenByEmail: vi.fn(),
    findPasswordResetTokenByToken: vi.fn(),
    updatePasswordResetToken: vi.fn(),
    deletePasswordResetToken: vi.fn(),
    cleanupExpiredPasswordResetTokens: vi.fn(),
    incrementFailedLoginAttempts: vi.fn(),
    resetFailedLoginAttempts: vi.fn(),
    isAccountLocked: vi.fn(),
  } as unknown as IAuthRepository;
}

function createMockSubscriptionRepository(): ISubscriptionRepository {
  return {
    createSubscription: vi.fn(),
    getSubscriptionByUserId: vi.fn(),
    getSubscriptionByRevenueCatId: vi.fn(),
    updateSubscription: vi.fn(),
    initializeUserSubscription: vi.fn(),
    getCurrentUsage: vi.fn(),
    incrementUsage: vi.fn(),
    checkUsageLimit: vi.fn(),
    resetMonthlyUsage: vi.fn(),
    hasEntitlement: vi.fn(),
    getSubscriptionTier: vi.fn(),
    createSubscriptionEvent: vi.fn(),
    getSubscriptionEvents: vi.fn(),
    processWebhook: vi.fn(),
  } as unknown as ISubscriptionRepository;
}

function createMockCreditRepository(): ICreditRepository {
  return {
    initializeCredits: vi.fn(),
    getBalance: vi.fn(),
    hasCredits: vi.fn(),
    reserveCredits: vi.fn(),
    commitReservation: vi.fn(),
    cancelReservation: vi.fn(),
    settleReservation: vi.fn(),
    refundCredits: vi.fn(),
    getTransactionHistory: vi.fn(),
    getTransactionById: vi.fn(),
    updateTransactionStatus: vi.fn(),
    cleanupOrphanedReservations: vi.fn(),
  } as unknown as ICreditRepository;
}

function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed_password_123',
    role: 'user',
    status: 'active',
    profile: { firstName: 'John', lastName: 'Doe', displayName: 'John Doe' },
    preferences: { theme: 'auto' },
    metadata: {},
    emailVerified: false,
    isGuest: false,
    isSystemAccount: false,
    phoneNumber: null,
    phoneE164: null,
    phoneVerified: null,
    preferredAuthChannel: null,
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

// ============================================================
// CreateUserUseCase Tests
// ============================================================
describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let mockAuthRepo: IAuthRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    useCase = new CreateUserUseCase(mockAuthRepo);
  });

  it('should create a user successfully', async () => {
    const dto: CreateUserDTO = {
      email: 'new@example.com',
      password: 'password123',
      name: 'John Doe',
    };
    const createdUser = createMockUser({ id: 'test-uuid-1234', email: 'new@example.com' });

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockAuthRepo.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(createdUser);

    const result = await useCase.execute(dto);

    expect(result.id).toBe('test-uuid-1234');
    expect(result.email).toBe('new@example.com');
    expect(result.name).toBe('John Doe');
    expect(result.isActive).toBe(true);
    expect(mockAuthRepo.findUserByEmail).toHaveBeenCalledWith('new@example.com');
    expect(mockAuthRepo.createUser).toHaveBeenCalled();
  });

  it('should throw validation error when email already exists', async () => {
    const dto: CreateUserDTO = {
      email: 'existing@example.com',
      password: 'password123',
      name: 'John Doe',
    };

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

    await expect(useCase.execute(dto)).rejects.toThrow();
    expect(mockAuthRepo.createUser).not.toHaveBeenCalled();
  });

  it('should use default role as USER when no role specified', async () => {
    const dto: CreateUserDTO = {
      email: 'new@example.com',
      password: 'password123',
      name: 'Jane Smith',
    };

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockAuthRepo.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockUser({ email: 'new@example.com' })
    );

    await useCase.execute(dto);

    const createCall = (mockAuthRepo.createUser as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.role).toBe('user');
  });

  it('should parse firstName and lastName from full name', async () => {
    const dto: CreateUserDTO = {
      email: 'new@example.com',
      password: 'password123',
      name: 'Jane Marie Smith',
    };

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockAuthRepo.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockUser({ email: 'new@example.com' })
    );

    await useCase.execute(dto);

    const createCall = (mockAuthRepo.createUser as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.profile.firstName).toBe('Jane');
    expect(createCall.profile.lastName).toBe('Marie Smith');
  });
});

// ============================================================
// RegisterUserUseCase Tests
// ============================================================
describe('RegisterUserUseCase', () => {
  let useCase: RegisterUserUseCase;
  let mockAuthRepo: IAuthRepository;
  let mockSubRepo: ISubscriptionRepository;
  let mockCreditRepo: ICreditRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    mockSubRepo = createMockSubscriptionRepository();
    mockCreditRepo = createMockCreditRepository();
    useCase = new RegisterUserUseCase(mockAuthRepo, mockSubRepo, mockCreditRepo);
  });

  it('should register a user successfully', async () => {
    const request: RegisterUserRequest = {
      email: 'newuser@example.com',
      password: 'secure123',
      firstName: 'Alice',
      lastName: 'Wonder',
    };

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockAuthRepo.registerUserWithProfile as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockUser({ id: 'test-uuid-1234', email: 'newuser@example.com' })
    );
    (mockSubRepo.initializeUserSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockCreditRepo.initializeCredits as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
    expect(result.userId).toBe('test-uuid-1234');
    expect(mockCreditRepo.initializeCredits).toHaveBeenCalledWith('test-uuid-1234', 100);
  });

  it('should return error when user already exists', async () => {
    const request: RegisterUserRequest = {
      email: 'existing@example.com',
      password: 'secure123',
      firstName: 'Bob',
      lastName: 'Smith',
    };

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

    const result = await useCase.execute(request);

    expect(result.success).toBe(false);
    expect(result.error).toBe('User already exists');
  });

  it('should return error for invalid email', async () => {
    const request: RegisterUserRequest = {
      email: 'not-an-email',
      password: 'secure123',
      firstName: 'Bob',
      lastName: 'Smith',
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to register user');
  });

  it('should return error for short password', async () => {
    const request: RegisterUserRequest = {
      email: 'user@example.com',
      password: '12345',
      firstName: 'Bob',
      lastName: 'Smith',
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(false);
  });

  it('should return error for missing firstName', async () => {
    const request: RegisterUserRequest = {
      email: 'user@example.com',
      password: 'secure123',
      firstName: '',
      lastName: 'Smith',
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(false);
  });

  it('should succeed even if subscription initialization fails', async () => {
    const request: RegisterUserRequest = {
      email: 'newuser@example.com',
      password: 'secure123',
      firstName: 'Alice',
      lastName: 'Wonder',
    };

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockAuthRepo.registerUserWithProfile as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockUser({ id: 'test-uuid-1234' })
    );
    (mockSubRepo.initializeUserSubscription as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Subscription service unavailable')
    );
    (mockCreditRepo.initializeCredits as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
  });

  it('should succeed even if credit initialization fails', async () => {
    const request: RegisterUserRequest = {
      email: 'newuser@example.com',
      password: 'secure123',
      firstName: 'Alice',
      lastName: 'Wonder',
    };

    (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockAuthRepo.registerUserWithProfile as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockUser({ id: 'test-uuid-1234' })
    );
    (mockSubRepo.initializeUserSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockCreditRepo.initializeCredits as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Credit service unavailable')
    );

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
  });
});

// ============================================================
// UpdateUserUseCase Tests
// ============================================================
describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
  let mockAuthRepo: IAuthRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    useCase = new UpdateUserUseCase(mockAuthRepo);
  });

  it('should update user profile successfully', async () => {
    const user = createMockUser();
    const updatedUser = createMockUser({ profile: { firstName: 'Updated', lastName: 'Doe', displayName: 'Updated Doe' } });

    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (mockAuthRepo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser);

    const result = await useCase.execute({
      userId: 'user-123',
      firstName: 'Updated',
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
  });

  it('should return error when userId is missing', async () => {
    const result = await useCase.execute({ userId: '' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User ID is required');
  });

  it('should return error when user not found', async () => {
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute({ userId: 'nonexistent' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
  });

  it('should lowercase email when updating', async () => {
    const user = createMockUser();
    const updatedUser = createMockUser({ email: 'newemail@example.com' });

    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (mockAuthRepo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser);

    await useCase.execute({ userId: 'user-123', email: 'NewEmail@Example.COM' });

    const updateCall = (mockAuthRepo.updateUser as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[1].email).toBe('newemail@example.com');
  });
});

// ============================================================
// UpdateUserSettingsUseCase Tests
// ============================================================
describe('UpdateUserSettingsUseCase', () => {
  let useCase: UpdateUserSettingsUseCase;
  let mockAuthRepo: IAuthRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    useCase = new UpdateUserSettingsUseCase(mockAuthRepo);
  });

  it('should update user settings successfully', async () => {
    const user = createMockUser({ preferences: { theme: 'light' } });
    const updatedUser = createMockUser({ preferences: { theme: 'dark' } });

    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (mockAuthRepo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser);

    const result = await useCase.execute('user-123', { theme: 'dark' });

    expect(result.success).toBe(true);
  });

  it('should return error when no settings provided', async () => {
    const result = await useCase.execute('user-123', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('No settings provided');
  });

  it('should return error when user not found', async () => {
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute('user-123', { theme: 'dark' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
  });
});

// ============================================================
// ChangePasswordUseCase Tests
// ============================================================
describe('ChangePasswordUseCase', () => {
  let useCase: ChangePasswordUseCase;
  let mockAuthRepo: IAuthRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    useCase = new ChangePasswordUseCase(mockAuthRepo);
  });

  it('should change password successfully', async () => {
    const user = createMockUser();
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (mockAuthRepo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const bcrypt = await import('bcryptjs');
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const result = await useCase.execute('user-123', 'oldPassword123', 'newPassword456');

    expect(result.success).toBe(true);
  });

  it('should reject short passwords', async () => {
    const result = await useCase.execute('user-123', '12345', 'newPassword456');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Password must be at least 6 characters');
  });

  it('should reject incorrect current password', async () => {
    const user = createMockUser();
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const bcrypt = await import('bcryptjs');
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const result = await useCase.execute('user-123', 'wrongPassword', 'newPassword456');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Current password is incorrect');
  });
});

// ============================================================
// UpdateUserRoleUseCase Tests
// ============================================================
describe('UpdateUserRoleUseCase', () => {
  let useCase: UpdateUserRoleUseCase;
  let mockAuthRepo: IAuthRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    useCase = new UpdateUserRoleUseCase(mockAuthRepo);
  });

  it('should reject admin role assignment', async () => {
    const result = await useCase.execute('user-123', 'admin' as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid role');
  });

  it('should reject librarian role assignment', async () => {
    const result = await useCase.execute('user-123', 'librarian' as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid role');
  });
});

// ============================================================
// DeleteUserDataUseCase Tests (GDPR Article 17)
// ============================================================
describe('DeleteUserDataUseCase', () => {
  let useCase: DeleteUserDataUseCase;
  let mockAuthRepo: IAuthRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    useCase = new DeleteUserDataUseCase(mockAuthRepo);
  });

  it('should throw forbidden error when user tries to delete another users data', async () => {
    await expect(
      useCase.execute({
        userId: 'user-123',
        requestingUserId: 'other-user-456',
        requestingUserRole: 'user' as any,
      })
    ).rejects.toThrow();
  });

  it('should throw when user not found', async () => {
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: 'user-123',
        requestingUserId: 'user-123',
        requestingUserRole: 'user' as any,
      })
    ).rejects.toThrow();
  });

  it('should throw forbidden error for system accounts', async () => {
    const systemUser = createMockUser({ isSystemAccount: true });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(systemUser);

    await expect(
      useCase.execute({
        userId: 'user-123',
        requestingUserId: 'user-123',
        requestingUserRole: 'user' as any,
      })
    ).rejects.toThrow();
  });

  it('should include audit trail in result on successful deletion', async () => {
    const user = createMockUser({ isSystemAccount: false });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const result = await useCase.execute({
      userId: 'user-123',
      requestingUserId: 'user-123',
      requestingUserRole: 'user' as any,
    });

    expect(result.success).toBe(true);
    expect(result.auditTrail).toBeDefined();
    expect(result.auditTrail.requestingUserId).toBe('user-123');
    expect(result.auditTrail.requestedAt).toBeInstanceOf(Date);
    expect(result.auditTrail.completedAt).toBeInstanceOf(Date);
    expect(result.deletedUserId).toBe('user-123');
  });

  it('should mark deletion as GDPR compliant when all services succeed', async () => {
    const user = createMockUser({ isSystemAccount: false });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const result = await useCase.execute({
      userId: 'user-123',
      requestingUserId: 'user-123',
      requestingUserRole: 'user' as any,
    });

    expect(result.gdprCompliant).toBe(true);
    expect(result.externalServices.musicService.success).toBe(true);
    expect(result.externalServices.analyticsService.success).toBe(true);
    expect(result.externalServices.storageService.success).toBe(true);
    expect(result.externalServices.systemService.success).toBe(true);
  });

  it('should include deleted record counts in result', async () => {
    const user = createMockUser({ isSystemAccount: false });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const result = await useCase.execute({
      userId: 'user-123',
      requestingUserId: 'user-123',
      requestingUserRole: 'user' as any,
    });

    expect(result.deletedRecords).toBeDefined();
    expect(typeof result.deletedRecords.entries).toBe('number');
    expect(typeof result.deletedRecords.user).toBe('boolean');
    expect(typeof result.deletedRecords.profile).toBe('boolean');
  });
});

// ============================================================
// ExportUserDataUseCase Tests (GDPR Article 20)
// ============================================================
describe('ExportUserDataUseCase', () => {
  let useCase: ExportUserDataUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ExportUserDataUseCase();
  });

  it('should throw forbidden error when user tries to export another users data', async () => {
    await expect(
      useCase.execute({
        userId: 'user-123',
        requestingUserId: 'other-user-456',
      })
    ).rejects.toThrow();
  });

  it('should export user data in JSON format by default', async () => {
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const mockDb = getDatabase();

    const mockUser = createMockUser();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn()
          .mockResolvedValueOnce([mockUser])
          .mockResolvedValueOnce([{ userId: 'user-123' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await useCase.execute({
      userId: 'user-123',
      requestingUserId: 'user-123',
    });

    expect(result.format).toBe('json');
    if (result.success && result.data) {
      expect(result.data.exportVersion).toBe('1.0');
      expect(result.data.userId).toBe('user-123');
    }
  });

  it('should include all data sections in exported data', async () => {
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const mockDb = getDatabase();

    const mockUser = createMockUser();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn()
          .mockResolvedValueOnce([mockUser])
          .mockResolvedValueOnce([{ userId: 'user-123' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await useCase.execute({
      userId: 'user-123',
      requestingUserId: 'user-123',
    });

    if (result.success && result.data) {
      expect(result.data.profile).toBeDefined();
      expect(result.data.library).toBeDefined();
      expect(result.data.credits).toBeDefined();
      expect(result.data.consents).toBeDefined();
      expect(result.data.reflections).toBeDefined();
      expect(result.data.reminders).toBeDefined();
      expect(result.data.subscriptions).toBeDefined();
      expect(result.data.insights).toBeDefined();
    }
  });
});

// ============================================================
// AssignLibrarianRoleUseCase Tests
// ============================================================
describe('AssignLibrarianRoleUseCase', () => {
  let useCase: AssignLibrarianRoleUseCase;
  let mockAuthRepo: IAuthRepository;
  let mockCreditRepo: ICreditRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepository();
    mockCreditRepo = createMockCreditRepository();
    useCase = new AssignLibrarianRoleUseCase(mockAuthRepo, mockCreditRepo);
  });

  it('should assign librarian role successfully', async () => {
    const user = createMockUser({ role: 'user' });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (mockCreditRepo.refundCredits as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-1' });
    (mockAuthRepo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockUser({ role: 'librarian', isSystemAccount: true })
    );
    (mockCreditRepo.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue({ currentBalance: 15000 });

    const result = await useCase.execute({
      userId: 'user-123',
      assignedByUserId: 'admin-1',
      reason: 'Promotion',
    });

    expect(result.success).toBe(true);
    expect(result.newRole).toBe('librarian');
    expect(result.creditsAdded).toBe(15000);
    expect(result.previousRole).toBe('user');
  });

  it('should return error when user not found', async () => {
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute({
      userId: 'nonexistent',
      assignedByUserId: 'admin-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
  });

  it('should return error when user is already a librarian', async () => {
    const user = createMockUser({ role: 'librarian' });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const result = await useCase.execute({
      userId: 'user-123',
      assignedByUserId: 'admin-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User is already a librarian');
  });

  it('should return error when trying to demote admin to librarian', async () => {
    const adminUser = createMockUser({ role: 'admin' });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);

    const result = await useCase.execute({
      userId: 'user-123',
      assignedByUserId: 'admin-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot change admin role to librarian');
  });

  it('should abort role assignment if credit allocation fails', async () => {
    const user = createMockUser({ role: 'user' });
    (mockAuthRepo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (mockCreditRepo.refundCredits as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Credit service down')
    );

    const result = await useCase.execute({
      userId: 'user-123',
      assignedByUserId: 'admin-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to allocate librarian credits');
    expect(mockAuthRepo.updateUser).not.toHaveBeenCalled();
  });
});

// ============================================================
// InitializeUserOnboardingUseCase Tests
// ============================================================
describe('InitializeUserOnboardingUseCase', () => {
  let useCase: InitializeUserOnboardingUseCase;
  let mockIntelligenceRepo: any;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIntelligenceRepo = {};
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ onboardingInitialized: false }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    useCase = new InitializeUserOnboardingUseCase(mockIntelligenceRepo, mockDb);
  });

  it('should initialize onboarding successfully', async () => {
    const result = await useCase.execute({ userId: 'user-123' });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Onboarding completed');
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('should return success when onboarding is already initialized (idempotent)', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ onboardingInitialized: true }]),
      }),
    });

    const result = await useCase.execute({ userId: 'user-123' });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Onboarding already completed');
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('should throw when profile not found', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    await expect(useCase.execute({ userId: 'nonexistent' })).rejects.toThrow();
  });
});
