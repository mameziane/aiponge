/**
 * Authenticate User Use Case
 */

import { IAuthRepository } from '@domains/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getLogger } from '@config/service-urls';
import { AuthError } from '@application/errors';
import { USER_STATUS, normalizeRole, type UserRole } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('authenticate-user-use-case');

export interface AuthenticateUserRequest {
  email: string;
  password: string;
}

export interface AuthenticateUserResponse {
  success: boolean;
  token: string;
  user?: {
    id: string;
    email: string;
    role: UserRole;
    status: string;
    profile: {
      firstName: string;
      lastName: string;
      displayName: string;
      avatarUrl?: string;
      onboardingCompleted: boolean;
    };
  };
  error?: string;
}

export class AuthenticateUserUseCase {
  constructor(private authRepository: IAuthRepository) {}

  async execute(request: AuthenticateUserRequest): Promise<AuthenticateUserResponse> {
    try {
      logger.info('Authenticating user', { email: request.email });

      this.validateRequest(request);

      const user = await this.authRepository.findUserByEmail(request.email.toLowerCase());
      if (!user) {
        return { success: false, token: '', error: 'Invalid credentials' };
      }

      const passwordValid = await bcrypt.compare(request.password, user.passwordHash);
      if (!passwordValid) {
        return { success: false, token: '', error: 'Invalid credentials' };
      }

      if (user.status !== USER_STATUS.ACTIVE) {
        return { success: false, token: '', error: `Account is ${user.status}` };
      }

      await this.authRepository.updateLastLogin(user.id);

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw AuthError.internalError('JWT_SECRET is required for token signing');
      }

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        jwtSecret,
        { expiresIn: process.env.NODE_ENV === 'production' ? '7d' : '90d' }
      );

      let profile: Record<string, unknown> = {};
      try {
        profile = typeof user.profile === 'string' ? JSON.parse(user.profile) : user.profile || {};
      } catch {
        profile = {};
      }

      const toString = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

      const userData = {
        id: user.id,
        email: user.email,
        role: normalizeRole(user.role),
        status: typeof user.status === 'string' ? user.status : 'active',
        profile: {
          firstName: toString(profile.firstName, ''),
          lastName: toString(profile.lastName, ''),
          displayName: toString(profile.displayName, user.email),
          avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined,
          onboardingCompleted: typeof profile.onboardingCompleted === 'boolean' ? profile.onboardingCompleted : false,
        },
      };

      return {
        success: true,
        token,
        user: userData,
      };
    } catch (error) {
      logger.error('Authentication failed', { error: serializeError(error) });
      return {
        success: false,
        token: '',
        error: 'Authentication failed',
      };
    }
  }

  private validateRequest(request: AuthenticateUserRequest): void {
    if (!request.email || !request.email.includes('@')) {
      throw AuthError.validationError('email', 'Invalid email address');
    }

    if (!request.password || request.password.trim().length === 0) {
      throw AuthError.validationError('password', 'Password is required');
    }
  }
}
