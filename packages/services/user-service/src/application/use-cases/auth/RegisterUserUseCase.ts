/**
 * Register User Use Case
 * Handles user registration with atomic profile creation via repository transaction
 * Welcome books are now seeded globally by the seed system (welcome-books seed module)
 */

import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { IAuthRepository } from '@domains/auth';
import { ISubscriptionRepository } from '@domains/subscriptions';
import { User } from '@infrastructure/database/schemas/user-schema';
import { JWTService } from '@infrastructure/services';
import { USER_ROLES, USER_STATUS, type UserRole } from '@aiponge/shared-contracts';
import { getLogger } from '@config/service-urls';
import { GuestMigrationService } from '@application/services/GuestMigrationService';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { CreatorMemberRepository } from '@infrastructure/repositories/CreatorMemberRepository';
import { serializeError } from '@aiponge/platform-core';
import { RefreshTokenUseCase } from './RefreshTokenUseCase';

const logger = getLogger('register-user-use-case');

export interface RegisterUserRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  phoneNumber?: string;
  guestUserId?: string; // ID of guest account to migrate data from
}

export interface RegisterUserResponse {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  sessionId?: string;
  error?: string;
  errorCode?: 'USER_EXISTS' | 'INVALID_EMAIL' | 'INVALID_PASSWORD' | 'VALIDATION_ERROR' | 'SERVER_ERROR';
  suggestedAction?: string;
  migrationStatus?: {
    migrated: boolean;
    needsRetry?: boolean;
    booksMigrated?: number;
    tracksMigrated?: number;
    albumsMigrated?: number;
  };
}

export class RegisterUserUseCase {
  constructor(
    private authRepo: IAuthRepository,
    private jwtService: JWTService,
    private subscriptionRepo: ISubscriptionRepository
  ) {}

  async execute(request: RegisterUserRequest): Promise<RegisterUserResponse> {
    try {
      const { email, password, firstName, lastName, role = USER_ROLES.USER } = request;

      // Validate
      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      if (!email.includes('@')) {
        return {
          success: false,
          error: 'Please enter a valid email address',
          errorCode: 'INVALID_EMAIL',
        };
      }

      if (password.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters long',
          errorCode: 'INVALID_PASSWORD',
        };
      }

      // Check if user exists
      const existing = await this.authRepo.findUserByEmail(email.toLowerCase());
      if (existing) {
        return {
          success: false,
          error: 'An account with this email already exists',
          errorCode: 'USER_EXISTS',
          suggestedAction: 'LOGIN',
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // ATOMIC: Create user + profile in single transaction via repository
      const user = await this.authRepo.registerUserWithProfile({
        id: randomUUID(),
        email: email.toLowerCase(),
        passwordHash,
        role,
        status: USER_STATUS.ACTIVE,
        profile: {
          firstName: firstName || '',
          lastName: lastName || '',
          displayName: `${firstName || ''} ${lastName || ''}`.trim() || email.split('@')[0],
          onboardingCompleted: false,
        },
        emailVerified: false,
        phoneNumber: request.phoneNumber, // Save phone number if provided
      });

      logger.info('User registered successfully', { userId: user.id, email: user.email });

      try {
        await this.subscriptionRepo.initializeUserSubscription(user.id);
      } catch (subError) {
        logger.error('Subscription initialization failed (non-blocking)', {
          userId: user.id,
          error: subError instanceof Error ? subError.message : String(subError),
        });
      }

      await this.setupCreatorMemberRelationships(user.id, user.email);

      const { guestDataMigrated, migrationNeedsRetry, migrationStats } = await this.migrateGuestDataIfNeeded(
        request,
        user.id
      );

      const token = this.jwtService.generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        roles: [user.role as UserRole],
        permissions: [],
      });

      const refreshTokenUseCase = new RefreshTokenUseCase(this.authRepo, this.jwtService);
      const { refreshToken, sessionId } = await refreshTokenUseCase.createSession(user.id);

      // Build response with optional migration status
      const response: RegisterUserResponse = { success: true, user, token, refreshToken, sessionId };
      if (guestDataMigrated && migrationStats) {
        response.migrationStatus = {
          migrated: true,
          needsRetry: migrationNeedsRetry,
          ...migrationStats,
        };
      }

      return response;
    } catch (error) {
      logger.error('Registration failed', {
        error: serializeError(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed. Please try again.',
        errorCode: 'SERVER_ERROR',
      };
    }
  }

  private async setupCreatorMemberRelationships(userId: string, email: string): Promise<void> {
    const creatorMemberRepo = new CreatorMemberRepository(getDatabase());

    const selfRelationshipCreated = await this.createSelfRelationshipWithRetry(creatorMemberRepo, userId);
    await this.autoFollowLibrariansWithRetry(creatorMemberRepo, userId);

    if (!selfRelationshipCreated) {
      logger.error('REGISTRATION_INCOMPLETE: User missing self-relationship - content access may be impaired', {
        userId,
        email,
      });
    }
  }

  private async createSelfRelationshipWithRetry(
    repo: InstanceType<typeof CreatorMemberRepository>,
    userId: string
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await repo.createSelfRelationship(userId);
        logger.info('Self-relationship created for new user', { userId });
        return true;
      } catch (selfError) {
        if (attempt === 2) {
          logger.error('CRITICAL: Self-relationship creation failed after retries', {
            userId,
            attempts: attempt + 1,
            error: selfError instanceof Error ? selfError.message : String(selfError),
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
    }
    return false;
  }

  private async autoFollowLibrariansWithRetry(
    repo: InstanceType<typeof CreatorMemberRepository>,
    userId: string
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const count = await repo.autoFollowAllLibrarians(userId);
        if (count > 0) {
          logger.info('User auto-followed librarians', { userId, count });
        } else {
          logger.info('No librarians to auto-follow', { userId });
        }
        return;
      } catch (libError) {
        if (attempt === 1) {
          logger.error('Librarian auto-follow failed after retries', {
            userId,
            attempts: attempt + 1,
            error: libError instanceof Error ? libError.message : String(libError),
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  }

  private async migrateGuestDataIfNeeded(
    request: RegisterUserRequest,
    userId: string
  ): Promise<{
    guestDataMigrated: boolean;
    migrationNeedsRetry: boolean;
    migrationStats?: { booksMigrated: number; tracksMigrated: number; albumsMigrated: number };
  }> {
    if (!request.guestUserId) {
      return { guestDataMigrated: false, migrationNeedsRetry: false };
    }

    // Migrate guest data if guestUserId is provided
    try {
      const guestMigrationService = new GuestMigrationService(getDatabase());
      const migrationResult = await guestMigrationService.migrateGuestData(request.guestUserId, userId);

      if (!migrationResult.success) {
        logger.error('Guest data migration failed (non-blocking)', {
          userId,
          guestUserId: request.guestUserId,
          error: migrationResult.error,
        });
        return { guestDataMigrated: false, migrationNeedsRetry: false };
      }

      const migrationStats = {
        booksMigrated: migrationResult.stats.booksMigrated,
        tracksMigrated: migrationResult.stats.tracksMigrated,
        albumsMigrated: migrationResult.stats.albumsMigrated,
      };
      logger.info('Guest data migrated successfully', {
        userId,
        guestUserId: request.guestUserId,
        migrationId: migrationResult.migrationId,
        stats: migrationResult.stats,
      });

      // Check for partial migration that needs retry
      let migrationNeedsRetry = false;
      const migrationStatus = await guestMigrationService.getMigrationStatus(request.guestUserId);
      if (migrationStatus.needsRetry) {
        migrationNeedsRetry = true;
        logger.warn('MIGRATION_NEEDS_RETRY: Guest migration completed with errors, cleanup pending', {
          userId,
          guestUserId: request.guestUserId,
          status: migrationStatus.status,
          errorMessage: migrationStatus.errorMessage,
          // This log can be monitored by ops to trigger manual or automated retry
        });
      }

      // If guest had books, don't create a new Welcome Book
      if (migrationResult.stats.booksMigrated > 0) {
        logger.info('Skipping Welcome Book creation - guest books were migrated', {
          userId,
          booksMigrated: migrationResult.stats.booksMigrated,
        });
      }

      return { guestDataMigrated: true, migrationNeedsRetry, migrationStats };
    } catch (migrationError) {
      logger.error('Guest data migration threw error (non-blocking)', {
        userId,
        guestUserId: request.guestUserId,
        error: migrationError instanceof Error ? migrationError.message : String(migrationError),
      });
      return { guestDataMigrated: false, migrationNeedsRetry: false };
    }
  }
}
