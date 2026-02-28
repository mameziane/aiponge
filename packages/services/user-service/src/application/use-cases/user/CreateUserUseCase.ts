/**
 * Create User Use Case
 * Handles user registration business logic
 */

import { IAuthRepository } from '@domains/auth';
import { NewUser } from '@infrastructure/database/schemas/user-schema';
import { USER_ROLES, USER_STATUS, normalizeRole, type UserRole } from '@aiponge/shared-contracts';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getLogger } from '@config/service-urls';
import { AuthError } from '@application/errors';

const logger = getLogger('create-user-use-case');

export interface CreateUserDTO {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
}

export interface CreateUserResult {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export class CreateUserUseCase {
  constructor(private authRepository: IAuthRepository) {}

  async execute(dto: CreateUserDTO): Promise<CreateUserResult> {
    logger.info('Creating user', { email: dto.email });

    const existingUser = await this.authRepository.findUserByEmail(dto.email);
    if (existingUser) {
      throw AuthError.validationError('email', `User with email ${dto.email} already exists`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const nameParts = dto.name.split(' ');
    const firstName = dto.firstName || nameParts[0] || 'User';
    const lastName = dto.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

    const userData: NewUser = {
      id: randomUUID(),
      email: dto.email.toLowerCase(),
      passwordHash,
      role: dto.role || USER_ROLES.USER,
      status: USER_STATUS.ACTIVE,
      profile: {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        language: 'en',
        onboardingCompleted: false,
        termsAcceptedAt: new Date().toISOString(),
        privacyPolicyAcceptedAt: new Date().toISOString(),
      },
      preferences: {
        emailNotifications: true,
        pushNotifications: true,
        weeklyDigest: false,
        marketingEmails: false,
        theme: 'auto',
        contentLanguage: 'en',
      },
      emailVerified: false,
    };

    const user = await this.authRepository.createUser(userData);

    logger.info('User created successfully', { userId: user.id, email: user.email });

    return {
      id: user.id,
      email: user.email,
      name: `${firstName} ${lastName}`.trim(),
      role: normalizeRole(user.role),
      isActive: user.status === USER_STATUS.ACTIVE,
    };
  }
}
