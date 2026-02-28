/**
 * Authentication Types
 * Core type definitions for the authentication system
 */

import type { UserRole } from '@aiponge/shared-contracts';

export type { UserRole };

export interface Branding {
  organizationName?: string;
  displayName?: string;
  logoUrl?: string;
  tagline?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  name?: string;
  birthdate?: string;
  avatarUrl?: string;
  role: UserRole;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneE164?: string;
  phoneVerified?: boolean;
  preferredAuthChannel?: 'email' | 'phone';
  isGuest: boolean; // True for anonymous guest users, false for registered users
  isSystemAccount?: boolean; // True for admin/librarian system accounts (excluded from GDPR flows)
  organizationId?: string | null; // Links user to their org for shared branding (Practice/Studio tiers)
  organizationBranding?: Branding | null; // Resolved branding from the user's organization
  profile?: {
    languagePreference?: string;
  };
}

export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  user: User | null;
  isAuthenticated: boolean;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
  roleVerified: boolean; // True when role has been confirmed from server (not just from cache)
}

export interface LoginCredentials {
  identifier: string; // email or phone
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username?: string;
  phoneNumber?: string;
  guestUserId?: string; // ID of guest account to migrate data from
}

export interface SmsVerificationRequest {
  phoneE164: string;
  purpose?: 'login' | 'registration' | 'phone_change';
}

export interface SmsVerificationData {
  phoneE164: string;
  code: string;
  purpose?: 'login' | 'registration' | 'phone_change';
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  sessionId?: string;
  user?: User;
  error?: string;
  errorCode?:
    | 'USER_EXISTS'
    | 'INVALID_EMAIL'
    | 'INVALID_PASSWORD'
    | 'INVALID_CREDENTIALS'
    | 'ACCOUNT_SUSPENDED'
    | 'PHONE_NOT_VERIFIED'
    | 'VALIDATION_ERROR'
    | 'SERVER_ERROR';
  suggestedAction?: 'LOGIN' | 'RESET_PASSWORD' | 'CHECK_CREDENTIALS_OR_REGISTER' | 'VERIFY_PHONE';
  requiresPhoneVerification?: boolean;
}

export interface SmsResponse {
  success: boolean;
  verified?: boolean;
  error?: string;
  userId?: string;
}
