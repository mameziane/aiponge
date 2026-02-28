/**
 * Auth Repository Implementation
 * Drizzle ORM-based user authentication data access
 */

import { eq, and, or, desc, lt, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { IAuthRepository } from '../../domains/auth/repositories/IAuthRepository';
import {
  User,
  NewUser,
  users,
  SmsVerificationCode,
  NewSmsVerificationCode,
  smsVerificationCodes,
  PasswordResetToken,
  NewPasswordResetToken,
  passwordResetTokens,
} from '../database/schemas/user-schema';
import { usrProfiles } from '../database/schemas/profile-schema';
import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';
import { AuthError } from '../../application/errors';

const logger = getLogger('auth-repository');

export class AuthRepository implements IAuthRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createUser(userData: NewUser): Promise<User> {
    try {
      const [user] = await this.db.insert(users).values(userData).returning();
      logger.info('User created', { userId: user.id, email: user.email });
      return user;
    } catch (error) {
      logger.error('Failed to create user', { error });
      throw error;
    }
  }

  async findUserById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return user || null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const [user] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)));
      return user || null;
    } catch (error) {
      logger.error('findUserByEmail failed', {
        email,
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorCause: error instanceof Error && 'cause' in error ? error.cause : undefined,
      });
      throw error;
    }
  }

  async findUserByPhone(phoneE164: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.phoneE164, phoneE164), isNull(users.deletedAt)));
    return user || null;
  }

  async findUserByIdentifier(identifier: string): Promise<User | null> {
    // Identifier can be email or phone (E.164 format)
    // Check if it's an email (contains @) or phone
    const isEmail = identifier.includes('@');

    if (isEmail) {
      return this.findUserByEmail(identifier.toLowerCase());
    } else {
      // Assume phone number
      return this.findUserByPhone(identifier);
    }
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning();

    if (!user) throw AuthError.userNotFound();
    return user;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
  }

  /**
   * ATOMIC OPERATION: Create user and profile in single transaction
   * This ensures either both are created or neither (rollback on failure)
   */
  async registerUserWithProfile(userData: NewUser): Promise<User> {
    try {
      const result = await this.db.transaction(async tx => {
        // Create user
        const [user] = await tx.insert(users).values(userData).returning();

        // Create profile (database defaults handle all other fields)
        await tx.insert(usrProfiles).values({
          userId: user.id,
        });

        logger.info('User and profile created atomically', {
          userId: user.id,
          email: user.email,
        });

        return user;
      });

      return result;
    } catch (error) {
      logger.error('Failed to register user with profile (transaction rolled back)', { error });
      throw error;
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.findUserById(userId);
  }

  // SMS Verification operations
  async createSmsVerificationCode(data: NewSmsVerificationCode): Promise<SmsVerificationCode> {
    const [code] = await this.db.insert(smsVerificationCodes).values(data).returning();
    logger.info('SMS verification code created', {
      phoneE164: code.phoneE164,
      purpose: code.purpose,
      expiresAt: code.expiresAt,
    });
    return code;
  }

  async findLatestSmsCode(phoneE164: string, purpose: string): Promise<SmsVerificationCode | null> {
    const [code] = await this.db
      .select()
      .from(smsVerificationCodes)
      .where(and(eq(smsVerificationCodes.phoneE164, phoneE164), eq(smsVerificationCodes.purpose, purpose)))
      .orderBy(desc(smsVerificationCodes.createdAt))
      .limit(1);

    return code || null;
  }

  async updateSmsVerificationCode(id: string, data: Partial<SmsVerificationCode>): Promise<SmsVerificationCode> {
    const [code] = await this.db
      .update(smsVerificationCodes)
      .set(data)
      .where(eq(smsVerificationCodes.id, id))
      .returning();

    if (!code) throw AuthError.invalidToken('SMS verification code not found');
    return code;
  }

  async cleanupExpiredSmsCode(phoneE164: string): Promise<void> {
    await this.db
      .delete(smsVerificationCodes)
      .where(and(eq(smsVerificationCodes.phoneE164, phoneE164), lt(smsVerificationCodes.expiresAt, new Date())));
  }

  // Password Reset Token operations
  async createPasswordResetToken(data: NewPasswordResetToken): Promise<PasswordResetToken> {
    const [resetToken] = await this.db.insert(passwordResetTokens).values(data).returning();
    logger.info('Password reset token created', {
      email: resetToken.email,
      expiresAt: resetToken.expiresAt,
    });
    return resetToken;
  }

  async findPasswordResetTokenByEmail(email: string): Promise<PasswordResetToken | null> {
    const [resetToken] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.email, email.toLowerCase()))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);

    return resetToken || null;
  }

  async findPasswordResetTokenByToken(token: string): Promise<PasswordResetToken | null> {
    const [resetToken] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    return resetToken || null;
  }

  async updatePasswordResetToken(id: string, data: Partial<PasswordResetToken>): Promise<PasswordResetToken> {
    const [resetToken] = await this.db
      .update(passwordResetTokens)
      .set(data)
      .where(eq(passwordResetTokens.id, id))
      .returning();

    if (!resetToken) throw AuthError.invalidToken('Password reset token not found');
    return resetToken;
  }

  async deletePasswordResetToken(id: string): Promise<void> {
    await this.db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, id));
  }

  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    await this.db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date()));
    logger.debug('Cleaned up expired password reset tokens');
  }

  async incrementFailedLoginAttempts(userId: string): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
    const user = await this.findUserById(userId);
    if (!user) throw AuthError.userNotFound();

    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    let lockedUntil: Date | null = null;

    if (newAttempts >= 5) {
      const lockDurations = [5, 15, 30, 60];
      const lockIndex = Math.min(Math.floor((newAttempts - 5) / 5), lockDurations.length - 1);
      const lockMinutes = lockDurations[lockIndex];
      lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    }

    await this.db
      .update(users)
      .set({
        failedLoginAttempts: newAttempts,
        lockedUntil,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    logger.warn('Failed login attempt recorded', {
      userId,
      failedAttempts: newAttempts,
      lockedUntil: lockedUntil?.toISOString(),
    });

    return { failedAttempts: newAttempts, lockedUntil };
  }

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    logger.debug('Reset failed login attempts', { userId });
  }

  async isAccountLocked(userId: string): Promise<{ locked: boolean; lockedUntil: Date | null; remainingMs: number }> {
    const user = await this.findUserById(userId);
    if (!user) {
      return { locked: false, lockedUntil: null, remainingMs: 0 };
    }

    if (!user.lockedUntil) {
      return { locked: false, lockedUntil: null, remainingMs: 0 };
    }

    const now = Date.now();
    const lockTime = user.lockedUntil.getTime();

    if (now >= lockTime) {
      await this.resetFailedLoginAttempts(userId);
      return { locked: false, lockedUntil: null, remainingMs: 0 };
    }

    return {
      locked: true,
      lockedUntil: user.lockedUntil,
      remainingMs: lockTime - now,
    };
  }
}
