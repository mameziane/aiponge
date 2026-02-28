import { eq, and, lt, desc, isNull } from 'drizzle-orm';
import type { IIdentityRepository } from '@domains/identity/repositories/IIdentityRepository';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import {
  users,
  User,
  NewUser,
  smsVerificationCodes,
  SmsVerificationCode,
  NewSmsVerificationCode,
  passwordResetTokens,
  PasswordResetToken,
  NewPasswordResetToken,
} from '@infrastructure/database/schemas/user-schema';
import { usrProfiles } from '@infrastructure/database/schemas/profile-schema';
import { getLogger } from '@config/service-urls';
import { AuthError } from '@application/errors';

const logger = getLogger('identity-repository');

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export class IdentityRepositoryImpl implements IIdentityRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createUser(user: NewUser): Promise<User> {
    try {
      const [created] = await this.db.insert(users).values(user).returning();
      logger.info('User created', { userId: created.id, email: created.email });
      return created;
    } catch (error) {
      logger.error('Failed to create user', { error, email: user.email });
      throw error;
    }
  }

  async findUserById(id: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return result[0] ?? null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
      .limit(1);
    return result[0] ?? null;
  }

  async findUserByPhone(phoneE164: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.phoneE164, phoneE164), isNull(users.deletedAt)))
      .limit(1);
    return result[0] ?? null;
  }

  async findUserByIdentifier(identifier: string): Promise<User | null> {
    if (identifier.startsWith('+')) {
      return this.findUserByPhone(identifier);
    }
    if (identifier.includes('@')) {
      return this.findUserByEmail(identifier);
    }
    return this.findUserById(identifier);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    try {
      const [updated] = await this.db
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning();
      if (!updated) throw AuthError.userNotFound(id);
      return updated;
    } catch (error) {
      logger.error('Failed to update user', { error, userId: id });
      throw error;
    }
  }

  async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    } catch (error) {
      logger.error('Failed to update last login', { error, userId });
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await this.db.delete(users).where(eq(users.id, userId));
      logger.info('User deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user', { error, userId });
      throw error;
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.findUserById(userId);
  }

  /**
   * ATOMIC OPERATION: Create user and profile in single transaction
   * This ensures either both are created or neither (rollback on failure)
   */
  async registerUserWithProfile(userData: NewUser): Promise<User> {
    try {
      const result = await this.db.transaction(async tx => {
        const [user] = await tx.insert(users).values(userData).returning();

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

  async createSmsVerificationCode(data: NewSmsVerificationCode): Promise<SmsVerificationCode> {
    const result = await this.db.insert(smsVerificationCodes).values(data).returning();
    return result[0];
  }

  async findLatestSmsCode(phoneE164: string, purpose: string): Promise<SmsVerificationCode | null> {
    const result = await this.db
      .select()
      .from(smsVerificationCodes)
      .where(and(eq(smsVerificationCodes.phoneE164, phoneE164), eq(smsVerificationCodes.purpose, purpose)))
      .orderBy(desc(smsVerificationCodes.createdAt))
      .limit(1);
    return result[0] ?? null;
  }

  async updateSmsVerificationCode(id: string, data: Partial<SmsVerificationCode>): Promise<SmsVerificationCode> {
    const result = await this.db
      .update(smsVerificationCodes)
      .set(data)
      .where(eq(smsVerificationCodes.id, id))
      .returning();
    return result[0];
  }

  async cleanupExpiredSmsCode(phoneE164: string): Promise<void> {
    await this.db
      .delete(smsVerificationCodes)
      .where(and(eq(smsVerificationCodes.phoneE164, phoneE164), lt(smsVerificationCodes.expiresAt, new Date())));
  }

  async createPasswordResetToken(data: NewPasswordResetToken): Promise<PasswordResetToken> {
    const result = await this.db.insert(passwordResetTokens).values(data).returning();
    return result[0];
  }

  async findPasswordResetTokenByEmail(email: string): Promise<PasswordResetToken | null> {
    const result = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.email, email.toLowerCase()))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);
    return result[0] ?? null;
  }

  async findPasswordResetTokenByToken(token: string): Promise<PasswordResetToken | null> {
    const result = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
    return result[0] ?? null;
  }

  async updatePasswordResetToken(id: string, data: Partial<PasswordResetToken>): Promise<PasswordResetToken> {
    const result = await this.db
      .update(passwordResetTokens)
      .set(data)
      .where(eq(passwordResetTokens.id, id))
      .returning();
    return result[0];
  }

  async deletePasswordResetToken(id: string): Promise<void> {
    await this.db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, id));
  }

  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    await this.db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date()));
  }

  async incrementFailedLoginAttempts(userId: string): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw AuthError.userNotFound(userId);
    }

    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    let lockedUntil: Date | null = null;

    if (newAttempts >= LOCKOUT_THRESHOLD) {
      lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }

    await this.db
      .update(users)
      .set({
        failedLoginAttempts: newAttempts,
        lockedUntil,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

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
  }

  async isAccountLocked(userId: string): Promise<{ locked: boolean; lockedUntil: Date | null; remainingMs: number }> {
    const user = await this.findUserById(userId);
    if (!user || !user.lockedUntil) {
      return { locked: false, lockedUntil: null, remainingMs: 0 };
    }

    const now = Date.now();
    const lockExpiry = new Date(user.lockedUntil).getTime();

    if (now >= lockExpiry) {
      await this.resetFailedLoginAttempts(userId);
      return { locked: false, lockedUntil: null, remainingMs: 0 };
    }

    return {
      locked: true,
      lockedUntil: user.lockedUntil,
      remainingMs: lockExpiry - now,
    };
  }
}
