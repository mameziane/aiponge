/**
 * Auth Repository Interface
 * Core user authentication operations
 */

import {
  User,
  NewUser,
  SmsVerificationCode,
  NewSmsVerificationCode,
  PasswordResetToken,
  NewPasswordResetToken,
} from '@domains/identity/types';

export interface IAuthRepository {
  // User operations
  createUser(user: NewUser): Promise<User>;
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserByPhone(phoneE164: string): Promise<User | null>;
  findUserByIdentifier(identifier: string): Promise<User | null>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  updateLastLogin(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  getUserById(userId: string): Promise<User | null>;

  // Atomic user + profile creation (transaction-aware)
  registerUserWithProfile(userData: NewUser): Promise<User>;

  // SMS Verification operations
  createSmsVerificationCode(data: NewSmsVerificationCode): Promise<SmsVerificationCode>;
  findLatestSmsCode(phoneE164: string, purpose: string): Promise<SmsVerificationCode | null>;
  updateSmsVerificationCode(id: string, data: Partial<SmsVerificationCode>): Promise<SmsVerificationCode>;
  cleanupExpiredSmsCode(phoneE164: string): Promise<void>;

  // Password Reset Token operations
  createPasswordResetToken(data: NewPasswordResetToken): Promise<PasswordResetToken>;
  findPasswordResetTokenByEmail(email: string): Promise<PasswordResetToken | null>;
  findPasswordResetTokenByToken(token: string): Promise<PasswordResetToken | null>;
  updatePasswordResetToken(id: string, data: Partial<PasswordResetToken>): Promise<PasswordResetToken>;
  deletePasswordResetToken(id: string): Promise<void>;
  cleanupExpiredPasswordResetTokens(): Promise<void>;

  // Account lockout operations
  incrementFailedLoginAttempts(userId: string): Promise<{ failedAttempts: number; lockedUntil: Date | null }>;
  resetFailedLoginAttempts(userId: string): Promise<void>;
  isAccountLocked(userId: string): Promise<{ locked: boolean; lockedUntil: Date | null; remainingMs: number }>;
}
