import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  mockDbInsertValues,
  mockDbInsert,
  mockDbSelectLimit,
  mockDbSelectWhere,
  mockDbSelectFrom,
  mockDbSelect,
  mockDbUpdateWhere,
  mockDbUpdateSet,
  mockDbUpdate,
  mockDb,
} = vi.hoisted(() => {
  const mockDbInsertValues = vi.fn().mockReturnThis();
  const mockDbInsert = vi.fn().mockReturnValue({ values: mockDbInsertValues });
  const mockDbSelectLimit = vi.fn().mockResolvedValue([]);
  const mockDbSelectWhere = vi.fn().mockReturnValue({ limit: mockDbSelectLimit });
  const mockDbSelectFrom = vi.fn().mockReturnValue({ where: mockDbSelectWhere });
  const mockDbSelect = vi.fn().mockReturnValue({ from: mockDbSelectFrom });
  const mockDbUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockDbUpdateSet = vi.fn().mockReturnValue({ where: mockDbUpdateWhere });
  const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbUpdateSet });
  const mockDb = {
    insert: mockDbInsert,
    select: mockDbSelect,
    update: mockDbUpdate,
  };
  return {
    mockDbInsertValues,
    mockDbInsert,
    mockDbSelectLimit,
    mockDbSelectWhere,
    mockDbSelectFrom,
    mockDbSelect,
    mockDbUpdateWhere,
    mockDbUpdateSet,
    mockDbUpdate,
    mockDb,
  };
});

vi.mock('../../../config/service-urls', () => ({
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
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue('hashed_password'),
  compare: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../infrastructure/database/DatabaseConnectionFactory', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

vi.mock('../../../infrastructure/repositories/CreatorMemberRepository', () => ({
  CreatorMemberRepository: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.createSelfRelationship = vi.fn().mockResolvedValue(undefined);
    this.autoFollowAllLibrarians = vi.fn().mockResolvedValue(0);
  }),
}));

vi.mock('../../../application/services/GuestMigrationService', () => ({
  GuestMigrationService: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.migrateGuestData = vi.fn().mockResolvedValue({
      success: true,
      migrationId: 'migration-1',
      stats: { booksMigrated: 0, tracksMigrated: 0, albumsMigrated: 0 },
    });
    this.getMigrationStatus = vi.fn().mockResolvedValue({ needsRetry: false, status: 'completed' });
    this.findPendingMigrationForUser = vi.fn().mockResolvedValue(null);
    this.retryMigrationCleanup = vi.fn().mockResolvedValue({ success: true });
  }),
}));

vi.mock('../../../infrastructure/database/schemas/user-schema', () => ({
  userSessions: {
    id: 'id',
    userId: 'userId',
    refreshTokenHash: 'refreshTokenHash',
    refreshTokenFamily: 'refreshTokenFamily',
    refreshTokenExpiresAt: 'refreshTokenExpiresAt',
    deviceInfo: 'deviceInfo',
    ipAddress: 'ipAddress',
    userAgent: 'userAgent',
    lastActivityAt: 'lastActivityAt',
    expiresAt: 'expiresAt',
    revoked: 'revoked',
  },
  tokenBlacklist: {},
  TokenRevocationReason: { LOGOUT: 'LOGOUT', SECURITY: 'SECURITY' },
}));

vi.mock('../../../infrastructure/services/EmailService', () => ({
  emailService: {
    sendPasswordResetCode: vi.fn().mockResolvedValue({ success: true }),
    sendPasswordResetConfirmation: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../../infrastructure/services/TokenBlacklistService', () => ({
  TokenBlacklistService: {
    getInstance: vi.fn().mockReturnValue({
      revokeToken: vi.fn().mockResolvedValue(undefined),
      isRevoked: vi.fn().mockResolvedValue(false),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    eq: vi.fn((_col: unknown, val: unknown) => ({ column: _col, value: val })),
    and: vi.fn((...args: unknown[]) => args),
  };
});

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
    verify: vi.fn().mockReturnValue({ userId: 'user-1', email: 'test@example.com', role: 'user' }),
    decode: vi.fn().mockReturnValue({ userId: 'user-1', email: 'test@example.com', role: 'user' }),
    TokenExpiredError: class TokenExpiredError extends Error {},
  },
  sign: vi.fn().mockReturnValue('mock-jwt-token'),
  verify: vi.fn().mockReturnValue({ userId: 'user-1', email: 'test@example.com', role: 'user' }),
  decode: vi.fn().mockReturnValue({ userId: 'user-1', email: 'test@example.com', role: 'user' }),
  TokenExpiredError: class TokenExpiredError extends Error {},
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-v4'),
}));

import bcrypt from 'bcryptjs';
import { RegisterUserUseCase } from '../../../application/use-cases/auth/RegisterUserUseCase';
import { LoginUserUseCase } from '../../../application/use-cases/auth/LoginUserUseCase';
import { AuthenticateUserUseCase } from '../../../application/use-cases/auth/AuthenticateUserUseCase';
import { GuestAuthUseCase } from '../../../application/use-cases/auth/GuestAuthUseCase';
import { RefreshTokenUseCase } from '../../../application/use-cases/auth/RefreshTokenUseCase';
import { ResetPasswordUseCase } from '../../../application/use-cases/auth/ResetPasswordUseCase';
import { RequestPasswordResetUseCase } from '../../../application/use-cases/auth/RequestPasswordResetUseCase';
import { PasswordResetWithCodeUseCase } from '../../../application/use-cases/auth/PasswordResetWithCodeUseCase';
import { SendSmsVerificationCodeUseCase } from '../../../application/use-cases/auth/SendSmsVerificationCodeUseCase';
import { VerifySmsCodeUseCase } from '../../../application/use-cases/auth/VerifySmsCodeUseCase';
import type { IAuthRepository } from '../../../domains/auth/repositories/IAuthRepository';
import type { ISubscriptionRepository } from '../../../domains/subscriptions/repositories/ISubscriptionRepository';
import type { ICreditRepository } from '../../../domains/credits/repositories/ICreditRepository';
import { JWTService } from '../../../infrastructure/services/JWTService';

function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hashed_password',
    role: 'user',
    status: 'active',
    profile: {},
    preferences: {},
    metadata: {},
    emailVerified: true,
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
    ...overrides,
  };
}

function createMockAuthRepo(overrides: Partial<IAuthRepository> = {}): IAuthRepository {
  return {
    createUser: vi.fn().mockResolvedValue(createMockUser()),
    findUserById: vi.fn().mockResolvedValue(null),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserByPhone: vi.fn().mockResolvedValue(null),
    findUserByIdentifier: vi.fn().mockResolvedValue(null),
    updateUser: vi.fn().mockResolvedValue(createMockUser()),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    getUserById: vi.fn().mockResolvedValue(null),
    registerUserWithProfile: vi.fn().mockResolvedValue(createMockUser()),
    createSmsVerificationCode: vi.fn().mockResolvedValue({ id: 'sms-code-1' }),
    findLatestSmsCode: vi.fn().mockResolvedValue(null),
    updateSmsVerificationCode: vi.fn().mockResolvedValue({}),
    cleanupExpiredSmsCode: vi.fn().mockResolvedValue(undefined),
    createPasswordResetToken: vi.fn().mockResolvedValue({ id: 'reset-token-1' }),
    findPasswordResetTokenByEmail: vi.fn().mockResolvedValue(null),
    findPasswordResetTokenByToken: vi.fn().mockResolvedValue(null),
    updatePasswordResetToken: vi.fn().mockResolvedValue({}),
    deletePasswordResetToken: vi.fn().mockResolvedValue(undefined),
    cleanupExpiredPasswordResetTokens: vi.fn().mockResolvedValue(undefined),
    incrementFailedLoginAttempts: vi.fn().mockResolvedValue({ failedAttempts: 1, lockedUntil: null }),
    resetFailedLoginAttempts: vi.fn().mockResolvedValue(undefined),
    isAccountLocked: vi.fn().mockResolvedValue({ locked: false, lockedUntil: null, remainingMs: 0 }),
    ...overrides,
  };
}

function createMockSubscriptionRepo(): ISubscriptionRepository {
  return {
    createSubscription: vi.fn(),
    getSubscriptionByUserId: vi.fn(),
    getSubscriptionByRevenueCatId: vi.fn(),
    updateSubscription: vi.fn(),
    initializeUserSubscription: vi.fn().mockResolvedValue({}),
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

function createMockCreditRepo(): ICreditRepository {
  return {
    initializeCredits: vi.fn().mockResolvedValue({}),
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

function createTestJwtService(): JWTService {
  return new JWTService({ secret: 'a-test-secret-that-is-at-least-32-characters-long', isProduction: false });
}

describe('Auth Use Cases', () => {
  let mockAuthRepo: IAuthRepository;
  let mockSubscriptionRepo: ISubscriptionRepository;
  let mockCreditRepo: ICreditRepository;
  let jwtService: JWTService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthRepo = createMockAuthRepo();
    mockSubscriptionRepo = createMockSubscriptionRepo();
    mockCreditRepo = createMockCreditRepo();
    jwtService = createTestJwtService();

    mockDbInsertValues.mockReturnThis();
    mockDbSelectLimit.mockResolvedValue([]);
  });

  describe('RegisterUserUseCase', () => {
    let useCase: RegisterUserUseCase;

    beforeEach(() => {
      useCase = new RegisterUserUseCase(mockAuthRepo, jwtService, mockSubscriptionRepo);
      mockDbInsertValues.mockResolvedValue(undefined);
    });

    it('should register a user successfully', async () => {
      const result = await useCase.execute({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockAuthRepo.registerUserWithProfile).toHaveBeenCalled();
      expect(mockSubscriptionRepo.initializeUserSubscription).toHaveBeenCalled();
    });

    it('should return error when email is missing', async () => {
      const result = await useCase.execute({ email: '', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should return error when password is missing', async () => {
      const result = await useCase.execute({ email: 'test@example.com', password: '' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should return error for invalid email format', async () => {
      const result = await useCase.execute({ email: 'invalid-email', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_EMAIL');
    });

    it('should return error for short password', async () => {
      const result = await useCase.execute({ email: 'test@example.com', password: '123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PASSWORD');
    });

    it('should return error when user already exists', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const result = await useCase.execute({ email: 'existing@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('USER_EXISTS');
      expect(result.suggestedAction).toBe('LOGIN');
    });

    it('should handle server errors gracefully', async () => {
      (mockAuthRepo.registerUserWithProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      );

      const result = await useCase.execute({ email: 'new@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SERVER_ERROR');
    });

    it('should continue if subscription initialization fails', async () => {
      (mockSubscriptionRepo.initializeUserSubscription as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Subscription error')
      );

      const result = await useCase.execute({ email: 'new@example.com', password: 'password123' });

      expect(result.success).toBe(true);
    });
  });

  describe('LoginUserUseCase', () => {
    let useCase: LoginUserUseCase;

    beforeEach(() => {
      useCase = new LoginUserUseCase(mockAuthRepo, jwtService);
      mockDbInsertValues.mockResolvedValue(undefined);
    });

    it('should login successfully with valid credentials', async () => {
      const mockUser = createMockUser();
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await useCase.execute({ identifier: 'test@example.com', password: 'password123' });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(mockAuthRepo.resetFailedLoginAttempts).toHaveBeenCalledWith('user-1');
      expect(mockAuthRepo.updateLastLogin).toHaveBeenCalledWith('user-1');
    });

    it('should return error when identifier is missing', async () => {
      const result = await useCase.execute({ identifier: '', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should return error when password is missing', async () => {
      const result = await useCase.execute({ identifier: 'test@example.com', password: '' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should return error when user not found', async () => {
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await useCase.execute({ identifier: 'unknown@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('should return error when account is locked', async () => {
      const mockUser = createMockUser();
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockAuthRepo.isAccountLocked as ReturnType<typeof vi.fn>).mockResolvedValue({
        locked: true,
        lockedUntil: new Date(Date.now() + 300000),
        remainingMs: 300000,
      });

      const result = await useCase.execute({ identifier: 'test@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ACCOUNT_LOCKED');
    });

    it('should return error for guest users attempting password login', async () => {
      const guestUser = createMockUser({ isGuest: true });
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(guestUser);

      const result = await useCase.execute({ identifier: 'guest@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('should return error for users without password hash', async () => {
      const userNoPassword = createMockUser({ passwordHash: null });
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(userNoPassword);

      const result = await useCase.execute({ identifier: 'test@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('should increment failed attempts on wrong password', async () => {
      const mockUser = createMockUser();
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await useCase.execute({ identifier: 'test@example.com', password: 'wrongpassword' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
      expect(mockAuthRepo.incrementFailedLoginAttempts).toHaveBeenCalledWith('user-1');
    });

    it('should lock account after too many failed attempts', async () => {
      const mockUser = createMockUser();
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const lockDate = new Date(Date.now() + 900000);
      (mockAuthRepo.incrementFailedLoginAttempts as ReturnType<typeof vi.fn>).mockResolvedValue({
        failedAttempts: 5,
        lockedUntil: lockDate,
      });

      const result = await useCase.execute({ identifier: 'test@example.com', password: 'wrongpassword' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ACCOUNT_LOCKED');
      expect(result.lockedUntil).toBe(lockDate);
    });

    it('should return error for suspended account', async () => {
      const suspendedUser = createMockUser({ status: 'suspended' });
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(suspendedUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await useCase.execute({ identifier: 'test@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ACCOUNT_SUSPENDED');
    });

    it('should require phone verification for phone login with unverified phone', async () => {
      const phoneUser = createMockUser({ phoneVerified: false });
      (mockAuthRepo.findUserByIdentifier as ReturnType<typeof vi.fn>).mockResolvedValue(phoneUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await useCase.execute({ identifier: '+1234567890', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PHONE_NOT_VERIFIED');
      expect(result.requiresPhoneVerification).toBe(true);
    });
  });

  describe('AuthenticateUserUseCase', () => {
    let useCase: AuthenticateUserUseCase;

    beforeEach(() => {
      useCase = new AuthenticateUserUseCase(mockAuthRepo);
      process.env.JWT_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
    });

    it('should authenticate successfully with valid credentials', async () => {
      const mockUser = createMockUser({ profile: { firstName: 'John', lastName: 'Doe', displayName: 'John Doe' } });
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await useCase.execute({ email: 'test@example.com', password: 'password123' });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockAuthRepo.updateLastLogin).toHaveBeenCalledWith('user-1');
    });

    it('should fail with invalid email', async () => {
      const result = await useCase.execute({ email: 'invalid-email', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
    });

    it('should fail with empty password', async () => {
      const result = await useCase.execute({ email: 'test@example.com', password: '' });

      expect(result.success).toBe(false);
    });

    it('should fail when user not found', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await useCase.execute({ email: 'unknown@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should fail with wrong password', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await useCase.execute({ email: 'test@example.com', password: 'wrongpassword' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should fail for inactive account', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockUser({ status: 'suspended' })
      );
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await useCase.execute({ email: 'test@example.com', password: 'password123' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('suspended');
    });
  });

  describe('GuestAuthUseCase', () => {
    let useCase: GuestAuthUseCase;

    beforeEach(() => {
      useCase = new GuestAuthUseCase(jwtService, mockAuthRepo, mockCreditRepo);
      mockDbInsertValues.mockResolvedValue(undefined);
    });

    it('should create a guest session successfully', async () => {
      const result = await useCase.execute();

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.guestProfile).toBeDefined();
      expect(result.guestProfile!.isGuest).toBe(true);
      expect(result.guestProfile!.freeCredits).toBe(60);
      expect(mockAuthRepo.registerUserWithProfile).toHaveBeenCalled();
      expect(mockCreditRepo.initializeCredits).toHaveBeenCalled();
    });

    it('should work without credit repository', async () => {
      const useCaseNoCreds = new GuestAuthUseCase(jwtService, mockAuthRepo);
      mockDbInsertValues.mockResolvedValue(undefined);

      const result = await useCaseNoCreds.execute();

      expect(result.success).toBe(true);
      expect(result.guestProfile).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      (mockAuthRepo.registerUserWithProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      );

      const result = await useCase.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Guest authentication failed');
    });
  });

  describe('RefreshTokenUseCase', () => {
    let useCase: RefreshTokenUseCase;

    beforeEach(() => {
      useCase = new RefreshTokenUseCase(mockAuthRepo, jwtService);
    });

    it('should return error when refresh token is missing', async () => {
      const result = await useCase.execute({ refreshToken: '', sessionId: 'session-1' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TOKEN');
    });

    it('should return error when session ID is missing', async () => {
      const result = await useCase.execute({ refreshToken: 'token-1', sessionId: '' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TOKEN');
    });

    it('should return error when session not found', async () => {
      mockDbSelectLimit.mockResolvedValue([]);

      const result = await useCase.execute({ refreshToken: 'token-1', sessionId: 'non-existent' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TOKEN');
    });

    it('should detect token reuse on revoked session', async () => {
      mockDbSelectLimit.mockResolvedValue([
        {
          id: 'session-1',
          userId: 'user-1',
          refreshTokenHash: 'hash',
          refreshTokenFamily: 'family-1',
          revoked: true,
          refreshTokenExpiresAt: new Date(Date.now() + 86400000),
        },
      ]);
      mockDbUpdateWhere.mockResolvedValue(undefined);

      const result = await useCase.execute({ refreshToken: 'token-1', sessionId: 'session-1' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOKEN_REUSE_DETECTED');
    });

    it('should return error for expired refresh token', async () => {
      mockDbSelectLimit.mockResolvedValue([
        {
          id: 'session-1',
          userId: 'user-1',
          refreshTokenHash: 'hash',
          refreshTokenFamily: 'family-1',
          revoked: false,
          refreshTokenExpiresAt: new Date(Date.now() - 86400000),
        },
      ]);

      const result = await useCase.execute({ refreshToken: 'token-1', sessionId: 'session-1' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOKEN_EXPIRED');
    });

    it('should create a new session successfully', async () => {
      mockDbInsertValues.mockResolvedValue(undefined);

      const result = await useCase.createSession('user-1');

      expect(result.refreshToken).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe('RequestPasswordResetUseCase', () => {
    let useCase: RequestPasswordResetUseCase;

    beforeEach(() => {
      useCase = new RequestPasswordResetUseCase(mockAuthRepo);
    });

    it('should generate a reset token for existing active user', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const result = await useCase.execute({ email: 'test@example.com', ipAddress: '127.0.0.1' });

      expect(result.token).toBeDefined();
      expect(result.message).toContain('If an account exists');
    });

    it('should return generic message when user not found', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await useCase.execute({ email: 'unknown@example.com', ipAddress: '127.0.0.1' });

      expect(result.token).toBeUndefined();
      expect(result.message).toContain('If an account exists');
    });

    it('should return generic message for inactive user', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockUser({ status: 'suspended' })
      );

      const result = await useCase.execute({ email: 'suspended@example.com', ipAddress: '127.0.0.1' });

      expect(result.token).toBeUndefined();
      expect(result.message).toContain('If an account exists');
    });

    it('should validate and mark tokens correctly', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const genResult = await useCase.execute({ email: 'test@example.com', ipAddress: '127.0.0.1' });
      const token = genResult.token!;

      const validResult = await useCase.validateResetToken(token);
      expect(validResult.valid).toBe(true);
      expect(validResult.email).toBe('test@example.com');

      await useCase.markTokenAsUsed(token);

      const revalidate = await useCase.validateResetToken(token);
      expect(revalidate.valid).toBe(false);
    });

    it('should return invalid for non-existent token', async () => {
      const result = await useCase.validateResetToken('non-existent-token');

      expect(result.valid).toBe(false);
    });
  });

  describe('ResetPasswordUseCase', () => {
    let useCase: ResetPasswordUseCase;
    let requestResetUseCase: RequestPasswordResetUseCase;

    beforeEach(() => {
      requestResetUseCase = new RequestPasswordResetUseCase(mockAuthRepo);
      useCase = new ResetPasswordUseCase(mockAuthRepo, requestResetUseCase);
    });

    it('should reset password successfully with valid token', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const genResult = await requestResetUseCase.execute({ email: 'test@example.com', ipAddress: '127.0.0.1' });
      const token = genResult.token!;

      const result = await useCase.execute({
        token,
        newPassword: 'newPass1',
        ipAddress: '127.0.0.1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('reset successfully');
      expect(mockAuthRepo.updateUser).toHaveBeenCalled();
    });

    it('should throw for invalid token', async () => {
      await expect(
        useCase.execute({ token: 'invalid', newPassword: 'newPass1', ipAddress: '127.0.0.1' })
      ).rejects.toThrow();
    });

    it('should throw for weak password', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const genResult = await requestResetUseCase.execute({ email: 'test@example.com', ipAddress: '127.0.0.1' });

      await expect(
        useCase.execute({ token: genResult.token!, newPassword: 'short', ipAddress: '127.0.0.1' })
      ).rejects.toThrow();
    });
  });

  describe('PasswordResetWithCodeUseCase', () => {
    let useCase: PasswordResetWithCodeUseCase;

    beforeEach(() => {
      useCase = new PasswordResetWithCodeUseCase(mockAuthRepo);
    });

    it('should request reset code for existing user', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const result = await useCase.requestResetCode({ email: 'test@example.com' });

      expect(result.success).toBe(true);
      expect(mockAuthRepo.createPasswordResetToken).toHaveBeenCalled();
    });

    it('should return success even for non-existent user (security)', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await useCase.requestResetCode({ email: 'unknown@example.com' });

      expect(result.success).toBe(true);
      expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();
    });

    it('should return success for guest users (security)', async () => {
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockUser({ isGuest: true })
      );

      const result = await useCase.requestResetCode({ email: 'guest@example.com' });

      expect(result.success).toBe(true);
      expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();
    });

    it('should verify code successfully', async () => {
      const futureDate = new Date(Date.now() + 600000);
      (mockAuthRepo.findPasswordResetTokenByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-1',
        code: '123456',
        expiresAt: futureDate,
        usedAt: null,
      });

      const result = await useCase.verifyCode({ email: 'test@example.com', code: '123456' });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });

    it('should reject invalid code', async () => {
      (mockAuthRepo.findPasswordResetTokenByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000),
        usedAt: null,
      });

      const result = await useCase.verifyCode({ email: 'test@example.com', code: '999999' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid code');
    });

    it('should reject expired code', async () => {
      (mockAuthRepo.findPasswordResetTokenByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-1',
        code: '123456',
        expiresAt: new Date(Date.now() - 600000),
        usedAt: null,
      });

      const result = await useCase.verifyCode({ email: 'test@example.com', code: '123456' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reset password with valid token', async () => {
      const futureDate = new Date(Date.now() + 600000);
      (mockAuthRepo.findPasswordResetTokenByToken as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-1',
        email: 'test@example.com',
        expiresAt: futureDate,
        verified: true,
        usedAt: null,
      });
      (mockAuthRepo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const result = await useCase.resetPassword({ token: 'valid-token', newPassword: 'newPass123' });

      expect(result.success).toBe(true);
      expect(mockAuthRepo.updateUser).toHaveBeenCalled();
    });

    it('should reject weak password on reset', async () => {
      const futureDate = new Date(Date.now() + 600000);
      (mockAuthRepo.findPasswordResetTokenByToken as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-1',
        email: 'test@example.com',
        expiresAt: futureDate,
        verified: true,
        usedAt: null,
      });

      const result = await useCase.resetPassword({ token: 'valid-token', newPassword: 'short' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Password must be');
    });
  });

  describe('SendSmsVerificationCodeUseCase', () => {
    let useCase: SendSmsVerificationCodeUseCase;

    beforeEach(() => {
      useCase = new SendSmsVerificationCodeUseCase(mockAuthRepo);
    });

    it('should send verification code successfully', async () => {
      const result = await useCase.execute({
        phoneE164: '+1234567890',
        purpose: 'registration',
      });

      expect(result.success).toBe(true);
      expect(result.codeId).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(mockAuthRepo.cleanupExpiredSmsCode).toHaveBeenCalledWith('+1234567890');
      expect(mockAuthRepo.createSmsVerificationCode).toHaveBeenCalled();
    });

    it('should reject invalid phone number format', async () => {
      const result = await useCase.execute({
        phoneE164: '1234567890',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid phone number');
    });

    it('should rate limit when code still valid', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000),
        attemptCount: 0,
        lastSentAt: new Date(),
      });

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('wait');
    });

    it('should handle errors gracefully', async () => {
      (mockAuthRepo.cleanupExpiredSmsCode as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      );

      const result = await useCase.execute({ phoneE164: '+1234567890', purpose: 'registration' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send');
    });
  });

  describe('VerifySmsCodeUseCase', () => {
    let useCase: VerifySmsCodeUseCase;

    beforeEach(() => {
      useCase = new VerifySmsCodeUseCase(mockAuthRepo);
    });

    it('should verify code successfully', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'code-1',
        userId: 'user-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000),
        attemptCount: 0,
        verifiedAt: null,
      });

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '123456',
        purpose: 'registration',
      });

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(mockAuthRepo.updateSmsVerificationCode).toHaveBeenCalled();
    });

    it('should reject invalid code format', async () => {
      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '12',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.verified).toBe(false);
    });

    it('should reject when no code found', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '123456',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No verification code found');
    });

    it('should reject expired code', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(Date.now() - 600000),
        attemptCount: 0,
        verifiedAt: null,
      });

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '123456',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject already verified code', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000),
        attemptCount: 0,
        verifiedAt: new Date(),
      });

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '123456',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already been used');
    });

    it('should reject after max attempts exceeded', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000),
        attemptCount: 3,
        verifiedAt: null,
      });

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '123456',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum verification attempts');
    });

    it('should increment attempts on wrong code', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000),
        attemptCount: 0,
        verifiedAt: null,
      });

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '999999',
        purpose: 'registration',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid code');
      expect(mockAuthRepo.updateSmsVerificationCode).toHaveBeenCalledWith('code-1', { attemptCount: 1 });
    });

    it('should update user phone verification when userId exists', async () => {
      (mockAuthRepo.findLatestSmsCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'code-1',
        userId: 'user-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000),
        attemptCount: 0,
        verifiedAt: null,
      });

      const result = await useCase.execute({
        phoneE164: '+1234567890',
        code: '123456',
        purpose: 'phone_change',
      });

      expect(result.success).toBe(true);
      expect(mockAuthRepo.updateUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          phoneE164: '+1234567890',
          phoneVerified: true,
          phoneNumber: '+1234567890',
          preferredAuthChannel: 'phone',
        })
      );
    });
  });
});
