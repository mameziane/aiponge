/**
 * Login User Use Case
 * Handles user authentication with email or phone
 */

import bcrypt from 'bcryptjs';
import { IAuthRepository } from '@domains/auth';
import { User } from '@infrastructure/database/schemas/user-schema';
import { JWTService } from '@infrastructure/services';
import { getLogger } from '@config/service-urls';
import { GuestMigrationService } from '@application/services/GuestMigrationService';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { USER_STATUS, type UserRole } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';
import { RefreshTokenUseCase } from './RefreshTokenUseCase';

const logger = getLogger('login-user-use-case');

export interface LoginUserRequest {
  identifier: string; // Can be email or phone number (E.164 format)
  password: string;
}

export interface LoginUserResponse {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  sessionId?: string;
  error?: string;
  errorCode?:
    | 'INVALID_CREDENTIALS'
    | 'ACCOUNT_SUSPENDED'
    | 'PHONE_NOT_VERIFIED'
    | 'VALIDATION_ERROR'
    | 'SERVER_ERROR'
    | 'ACCOUNT_LOCKED';
  requiresPhoneVerification?: boolean;
  suggestedAction?: string;
  lockedUntil?: Date;
  remainingLockMs?: number;
}

export class LoginUserUseCase {
  constructor(
    private authRepo: IAuthRepository,
    private jwtService: JWTService
  ) {}

  async execute(request: LoginUserRequest): Promise<LoginUserResponse> {
    try {
      const { identifier, password } = request;

      // Validate
      if (!identifier || !password) {
        return {
          success: false,
          error: 'Email/phone and password are required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      // Find user by email or phone
      const user = await this.authRepo.findUserByIdentifier(identifier);
      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password',
          errorCode: 'INVALID_CREDENTIALS',
          suggestedAction: 'CHECK_CREDENTIALS_OR_REGISTER',
        };
      }

      // Check if account is locked
      const lockStatus = await this.authRepo.isAccountLocked(user.id);
      if (lockStatus.locked) {
        const remainingMinutes = Math.ceil(lockStatus.remainingMs / 60000);
        logger.warn('Login attempt on locked account', { userId: user.id, remainingMinutes });
        return {
          success: false,
          error: `Account is temporarily locked. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
          errorCode: 'ACCOUNT_LOCKED',
          lockedUntil: lockStatus.lockedUntil || undefined,
          remainingLockMs: lockStatus.remainingMs,
          suggestedAction: 'WAIT_AND_RETRY',
        };
      }

      // Block guest users from password login (they should only use guest auth endpoint)
      if (user.isGuest || !user.passwordHash) {
        return {
          success: false,
          error: 'Invalid email or password',
          errorCode: 'INVALID_CREDENTIALS',
          suggestedAction: 'CHECK_CREDENTIALS_OR_REGISTER',
        };
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        const lockResult = await this.authRepo.incrementFailedLoginAttempts(user.id);
        if (lockResult.lockedUntil) {
          const lockMinutes = Math.ceil((lockResult.lockedUntil.getTime() - Date.now()) / 60000);
          return {
            success: false,
            error: `Too many failed attempts. Account locked for ${lockMinutes} minute${lockMinutes > 1 ? 's' : ''}.`,
            errorCode: 'ACCOUNT_LOCKED',
            lockedUntil: lockResult.lockedUntil,
            remainingLockMs: lockResult.lockedUntil.getTime() - Date.now(),
            suggestedAction: 'WAIT_AND_RETRY',
          };
        }
        const attemptsRemaining = 5 - lockResult.failedAttempts;
        return {
          success: false,
          error:
            attemptsRemaining > 0
              ? `Invalid email or password. ${attemptsRemaining} attempt${attemptsRemaining > 1 ? 's' : ''} remaining.`
              : 'Invalid email or password',
          errorCode: 'INVALID_CREDENTIALS',
          suggestedAction: 'RESET_PASSWORD',
        };
      }

      // Check status
      if (user.status !== USER_STATUS.ACTIVE) {
        return {
          success: false,
          error: `Your account is ${user.status}. Please contact support.`,
          errorCode: 'ACCOUNT_SUSPENDED',
        };
      }

      // Check if phone verification is required (for phone-based login)
      const isPhoneLogin = !identifier.includes('@');
      const requiresPhoneVerification = isPhoneLogin && !user.phoneVerified;

      if (requiresPhoneVerification) {
        return {
          success: false,
          error: 'Please verify your phone number to continue',
          errorCode: 'PHONE_NOT_VERIFIED',
          requiresPhoneVerification: true,
          suggestedAction: 'VERIFY_PHONE',
        };
      }

      const loginMethod = identifier.includes('@') ? 'email' : 'phone';
      logger.info('User logged in', {
        userId: user.id,
        email: user.email,
        loginMethod,
      });

      const userRole = user.role as UserRole;
      const token = this.jwtService.generateAccessToken({
        id: user.id,
        email: user.email,
        role: userRole,
        roles: [userRole],
        permissions: [],
      });

      const refreshTokenUseCase = new RefreshTokenUseCase(this.authRepo, this.jwtService);
      const [resetResult, lastLoginResult, sessionResult] = await Promise.allSettled([
        this.authRepo.resetFailedLoginAttempts(user.id),
        this.authRepo.updateLastLogin(user.id),
        refreshTokenUseCase.createSession(user.id),
      ]);

      if (resetResult.status === 'rejected') {
        logger.warn('Failed to reset login attempts', { userId: user.id, error: serializeError(resetResult.reason) });
      }
      if (lastLoginResult.status === 'rejected') {
        logger.warn('Failed to update last login', { userId: user.id, error: serializeError(lastLoginResult.reason) });
      }
      if (sessionResult.status === 'rejected') {
        logger.error('Failed to create session', { userId: user.id, error: serializeError(sessionResult.reason) });
        throw sessionResult.reason;
      }

      const { refreshToken, sessionId } = sessionResult.value;

      // Parse profile JSON to include birthdate, avatarUrl, and name in the returned user
      let profileData: { birthdate?: string; avatarUrl?: string; name?: string } = {};
      try {
        const userProfile = typeof user.profile === 'string' ? JSON.parse(user.profile) : user.profile || {};

        profileData = {
          name: userProfile.name || userProfile.displayName,
          birthdate: userProfile.birthdate,
          avatarUrl: userProfile.avatar || userProfile.avatarUrl,
        };
      } catch {
        // Profile parse is optional - continue with basic user data
      }

      // Return user with profile fields merged
      const enrichedUser = {
        ...user,
        name: profileData.name || user.email.split('@')[0],
        birthdate: profileData.birthdate,
        avatarUrl: profileData.avatarUrl,
      };

      // Check for any pending guest migrations that need retry (background, non-blocking)
      this.checkAndRetryPendingMigrations(user.id).catch(err => {
        logger.error('Background migration retry check failed', {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return { success: true, user: enrichedUser, token, refreshToken, sessionId };
    } catch (error) {
      logger.error('Login failed', { error });
      return {
        success: false,
        error: 'Login failed. Please try again.',
        errorCode: 'SERVER_ERROR',
      };
    }
  }

  /**
   * Background check for partial guest migrations that need cleanup.
   * This is called asynchronously after successful login.
   * Uses the repository method instead of raw SQL for reliable result handling.
   */
  private async checkAndRetryPendingMigrations(userId: string): Promise<void> {
    try {
      const db = getDatabase();
      const guestMigrationService = new GuestMigrationService(db);

      // Use repository method for reliable result handling
      const pendingMigration = await guestMigrationService.findPendingMigrationForUser(userId);

      if (pendingMigration) {
        const { guestUserId } = pendingMigration;
        logger.info('Found pending migration cleanup, attempting retry', {
          userId,
          guestUserId,
        });

        const retryResult = await guestMigrationService.retryMigrationCleanup(guestUserId);
        if (retryResult.success) {
          logger.info('Migration cleanup retry succeeded during login', {
            userId,
            guestUserId,
          });
        } else {
          logger.warn('Migration cleanup retry failed during login', {
            userId,
            guestUserId,
            error: retryResult.error,
          });
        }
      }
    } catch (error) {
      // Non-blocking - log and continue
      logger.error('Pending migration check failed', {
        userId,
        error: serializeError(error),
      });
    }
  }
}
