/**
 * Register User Use Case
 */

import { IAuthRepository } from '@domains/auth';
import { ISubscriptionRepository } from '@domains/subscriptions';
import { ICreditRepository } from '@domains/credits';
import { NewUser } from '@infrastructure/database/schemas/user-schema';
import { USER_ROLES, USER_STATUS } from '@aiponge/shared-contracts';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getLogger } from '@config/service-urls';
import { AuthError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('register-user-use-case');

const STARTING_CREDITS = 100;

export interface RegisterUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  language?: string;
  timezone?: string;
}

export interface RegisterUserResponse {
  success: boolean;
  userId?: string;
  error?: string;
}

export class RegisterUserUseCase {
  constructor(
    private authRepository: IAuthRepository,
    private subscriptionRepository: ISubscriptionRepository,
    private creditRepository: ICreditRepository
  ) {}

  async execute(request: RegisterUserRequest): Promise<RegisterUserResponse> {
    try {
      logger.info('Registering new user', { email: request.email });

      this.validateRequest(request);

      const existingUser = await this.authRepository.findUserByEmail(request.email);
      if (existingUser) {
        return { success: false, error: 'User already exists' };
      }

      const passwordHash = await bcrypt.hash(request.password, 10);

      const userData: NewUser = {
        id: randomUUID(),
        email: request.email.toLowerCase(),
        passwordHash,
        role: USER_ROLES.USER,
        status: USER_STATUS.ACTIVE,
        profile: {
          firstName: request.firstName,
          lastName: request.lastName,
          displayName: `${request.firstName} ${request.lastName}`.trim(),
          language: request.language || 'en',
          timezone: request.timezone,
          onboardingCompleted: false,
          termsAcceptedAt: new Date().toISOString(),
          privacyPolicyAcceptedAt: new Date().toISOString(),
        },
        preferences: {
          emailNotifications: true,
          pushNotifications: true,
          weeklyDigest: true,
          marketingEmails: false,
          theme: 'auto',
          contentLanguage: request.language || 'en',
        },
        emailVerified: false,
      };

      const user = await this.authRepository.registerUserWithProfile(userData);

      logger.info('User registered successfully', { userId: user.id });

      try {
        await this.subscriptionRepository.initializeUserSubscription(user.id);
      } catch (subError) {
        logger.error('Subscription initialization failed (non-blocking)', {
          userId: user.id,
          error: subError instanceof Error ? subError.message : String(subError),
        });
      }

      try {
        await this.creditRepository.initializeCredits(user.id, STARTING_CREDITS);
        logger.info('Credits initialized for new user', { userId: user.id, startingBalance: STARTING_CREDITS });
      } catch (creditError) {
        logger.error('Credit initialization failed (non-blocking)', {
          userId: user.id,
          error: creditError instanceof Error ? creditError.message : String(creditError),
        });
      }

      return {
        success: true,
        userId: user.id,
      };
    } catch (error) {
      logger.error('Failed to register user', { error: serializeError(error) });
      return {
        success: false,
        error: 'Failed to register user',
      };
    }
  }

  private validateRequest(request: RegisterUserRequest): void {
    if (!request.email || !request.email.includes('@')) {
      throw AuthError.validationError('email', 'Invalid email address');
    }

    if (!request.password || request.password.length < 6) {
      throw AuthError.passwordRequirementsNotMet('Password must be at least 6 characters');
    }

    if (!request.firstName || request.firstName.trim().length === 0) {
      throw AuthError.validationError('firstName', 'First name is required');
    }

    if (!request.lastName || request.lastName.trim().length === 0) {
      throw AuthError.validationError('lastName', 'Last name is required');
    }
  }
}
