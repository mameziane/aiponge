export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  profile: unknown;
  preferences: unknown;
  metadata: unknown;
  emailVerified: boolean | null;
  isGuest: boolean;
  isSystemAccount: boolean;
  phoneNumber: string | null;
  phoneE164: string | null;
  phoneVerified: boolean | null;
  preferredAuthChannel: string | null;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUser {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  profile: unknown;
  preferences?: unknown;
  metadata?: unknown;
  emailVerified?: boolean | null;
  isGuest?: boolean;
  isSystemAccount?: boolean;
  phoneNumber?: string | null;
  phoneE164?: string | null;
  phoneVerified?: boolean | null;
  preferredAuthChannel?: string | null;
  lastLoginAt?: Date | null;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SmsVerificationCode {
  id: string;
  userId: string | null;
  phoneE164: string;
  code: string;
  purpose: string;
  expiresAt: Date;
  attemptCount: number;
  verifiedAt: Date | null;
  lastSentAt: Date;
  metadata: unknown;
  createdAt: Date;
}

export interface NewSmsVerificationCode {
  id?: string;
  userId?: string | null;
  phoneE164: string;
  code: string;
  purpose: string;
  expiresAt: Date;
  attemptCount?: number;
  verifiedAt?: Date | null;
  lastSentAt: Date;
  metadata?: unknown;
  createdAt?: Date;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  email: string;
  code: string;
  token: string | null;
  expiresAt: Date;
  verified: boolean;
  usedAt: Date | null;
  createdAt: Date;
}

export interface NewPasswordResetToken {
  id: string;
  userId: string;
  email: string;
  code: string;
  token?: string | null;
  expiresAt: Date;
  verified?: boolean;
  usedAt?: Date | null;
  createdAt?: Date;
}
