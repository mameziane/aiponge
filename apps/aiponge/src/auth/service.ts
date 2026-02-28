/**
 * Authentication Service
 * Handles all auth-related network requests
 */

import { apiClient } from '../lib/axiosApiClient';
import { logger } from '../lib/logger';
import { USER_ROLES, type ServiceResponse } from '@aiponge/shared-contracts';
import type {
  LoginCredentials,
  RegisterData,
  SmsVerificationRequest,
  SmsVerificationData,
  AuthResponse,
  SmsResponse,
  User,
  UserRole,
} from './types';

/**
 * Normalize backend role to frontend UserRole.
 * Backend uses role for authorization (admin/librarian/user). Subscription tier is managed by RevenueCat.
 * - 'admin', 'librarian' → kept as is (administrative roles)
 * - Subscription tier is determined separately via RevenueCat entitlements, not the role field.
 */
function normalizeRole(backendRole: string | undefined): UserRole {
  if (backendRole === USER_ROLES.ADMIN || backendRole === USER_ROLES.LIBRARIAN) {
    return backendRole;
  }
  return USER_ROLES.USER;
}

interface ApiErrorResponse {
  response?: {
    status?: number;
    data?: {
      error?: string | { message?: string };
      errorCode?: string;
      suggestedAction?: string;
    };
  };
  message?: string;
}

function unwrapAuthResponse(raw: AuthResponse | ServiceResponse<AuthResponse>): AuthResponse {
  const maybeWrapped = raw as ServiceResponse<AuthResponse>;
  if (
    maybeWrapped.data &&
    typeof maybeWrapped.data === 'object' &&
    ('token' in maybeWrapped.data || 'user' in maybeWrapped.data)
  ) {
    return { ...maybeWrapped.data, success: raw.success };
  }
  return raw as AuthResponse;
}

function extractErrorDetails(
  error: unknown,
  defaultMessage: string
): {
  errorCode: AuthResponse['errorCode'];
  suggestedAction: AuthResponse['suggestedAction'];
  message: string;
} {
  const apiError = error as ApiErrorResponse;
  const errorData = apiError.response?.data;
  const rawError = errorData?.error;
  return {
    errorCode: errorData?.errorCode as AuthResponse['errorCode'],
    suggestedAction: errorData?.suggestedAction as AuthResponse['suggestedAction'],
    message: (typeof rawError === 'string' ? rawError : rawError?.message) || apiError.message || defaultMessage,
  };
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      logger.debug('AuthService logging in user', { identifier: credentials.identifier });
      const raw = await apiClient.post<AuthResponse>('/api/v1/auth/login', credentials, { timeout: 45000 });
      const response = unwrapAuthResponse(raw);
      logger.debug('AuthService login response received');
      return response;
    } catch (error: unknown) {
      const { errorCode, suggestedAction, message } = extractErrorDetails(error, 'Login failed');
      logger.error('AuthService login failed', error, { errorCode, suggestedAction });

      let errorMessage = message;
      if (errorCode === 'INVALID_CREDENTIALS') {
        if (suggestedAction === 'RESET_PASSWORD') {
          errorMessage += '\n\nForgot your password? Use the password reset option.';
        } else if (suggestedAction === 'CHECK_CREDENTIALS_OR_REGISTER') {
          errorMessage += '\n\nDouble-check your email and password, or create a new account.';
        }
      } else if (errorCode === 'ACCOUNT_SUSPENDED') {
        errorMessage += '\n\nPlease contact support for assistance.';
      } else if (errorCode === 'PHONE_NOT_VERIFIED') {
        errorMessage += "\n\nWe'll send you a verification code.";
      }

      return { success: false, error: errorMessage, errorCode, suggestedAction };
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      logger.debug('AuthService registering user', { email: data.email });
      const raw = await apiClient.post<AuthResponse>('/api/v1/auth/register', data, { timeout: 45000 });
      const response = unwrapAuthResponse(raw);
      logger.debug('AuthService registration response received');
      return response;
    } catch (error: unknown) {
      const { errorCode, suggestedAction, message } = extractErrorDetails(error, 'Registration failed');
      logger.error('AuthService registration failed', error, { errorCode, suggestedAction });

      let errorMessage = message;
      if (errorCode === 'USER_EXISTS' && suggestedAction === 'LOGIN') {
        errorMessage =
          'An account with this email already exists.\n\nPlease log in instead, or use a different email address.';
      } else if (errorCode === 'INVALID_EMAIL') {
        errorMessage = 'Please enter a valid email address.';
      } else if (errorCode === 'INVALID_PASSWORD') {
        errorMessage = 'Password must be at least 6 characters long.';
      }

      return { success: false, error: errorMessage, errorCode, suggestedAction };
    }
  }

  async sendSmsCode(data: SmsVerificationRequest): Promise<SmsResponse> {
    try {
      const response = await apiClient.post<SmsResponse>('/api/v1/auth/sms/send-code', data);
      return response;
    } catch (error: unknown) {
      const { message } = extractErrorDetails(error, 'Failed to send SMS code');
      return { success: false, error: message };
    }
  }

  async verifySmsCode(data: SmsVerificationData): Promise<SmsResponse> {
    try {
      const response = await apiClient.post<SmsResponse>('/api/v1/auth/sms/verify-code', data);
      return response;
    } catch (error: unknown) {
      const { message } = extractErrorDetails(error, 'SMS verification failed');
      return { success: false, error: message };
    }
  }

  async fetchUser(): Promise<User | null> {
    try {
      const raw = await apiClient.get<{
        success: boolean;
        data?: { user: User & { role?: string } };
        user?: User & { role?: string };
      }>('/api/v1/auth/me');

      const userPayload = raw.data?.user ?? raw.user;
      const success = raw.success ?? false;

      if (success && userPayload) {
        const user: User = {
          ...userPayload,
          role: normalizeRole(userPayload.role),
          isGuest: userPayload.isGuest ?? false,
        };
        logger.debug('AuthService user fetched', { userId: user.id, role: user.role, isGuest: user.isGuest });
        return user;
      }

      logger.warn('AuthService API returned success=false or no user');
      return null;
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      const status = apiError.response?.status;
      if (status === 401) {
        logger.debug('AuthService token expired or invalid (401) - session will be cleared');
        return null;
      }
      if (status === 404) {
        logger.debug('AuthService user account not found (404) - session will be cleared');
        return null;
      }

      // Timeout or network errors have no HTTP status - these are transient and
      // the caller (refreshUser) will preserve the session, so warn rather than error.
      if (!status) {
        logger.warn('AuthService failed to fetch user (transient network/timeout error - session will be preserved)', {
          error,
        });
      } else {
        logger.error('AuthService failed to fetch user', error);
      }
      throw error;
    }
  }

  async logout(sessionId?: string): Promise<void> {
    try {
      await apiClient.post('/api/v1/auth/logout', sessionId ? { sessionId } : undefined);
    } catch (error) {
      logger.error('Logout request failed', error);
    }
  }

  async guestAuth(): Promise<AuthResponse> {
    try {
      logger.debug('AuthService creating guest session');
      const raw = await apiClient.post<AuthResponse>('/api/v1/auth/guest', {}, { timeout: 45000 });
      const response = unwrapAuthResponse(raw);
      logger.debug('AuthService guest auth response received', {
        success: response.success,
        hasToken: !!response.token,
        hasUser: !!response.user,
      });
      return response;
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      logger.error('AuthService guest auth error', error, {
        status: apiError.response?.status,
      });
      const rawError = apiError.response?.data?.error;
      return {
        success: false,
        error: (typeof rawError === 'object' ? rawError?.message : rawError) || apiError.message || 'Guest auth failed',
      };
    }
  }

  async deleteAccount(): Promise<{ success: boolean; error?: string }> {
    try {
      logger.debug('AuthService deleting user account');
      const response = await apiClient.delete<{ success: boolean; message?: string; error?: string }>(
        '/api/v1/auth/delete-account'
      );
      logger.debug('AuthService delete account response received');

      if (response.success) {
        return { success: true };
      }

      return {
        success: false,
        error: response.error || 'Failed to delete account',
      };
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      logger.error('AuthService delete account error', error, {
        status: apiError.response?.status,
      });
      const rawError = apiError.response?.data?.error;
      return {
        success: false,
        error:
          (typeof rawError === 'string' ? rawError : rawError?.message) ||
          apiError.message ||
          'Failed to delete account',
      };
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.debug('AuthService requesting password reset', { email });
      const response = await apiClient.post<{ success: boolean; message?: string; error?: string }>(
        '/api/v1/auth/password/request-code',
        { email }
      );
      logger.debug('AuthService password reset request response received');
      return { success: response.success, error: response.error };
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      logger.error('AuthService password reset request failed', error);
      const rawError = apiError.response?.data?.error;
      return {
        success: false,
        error: (typeof rawError === 'string' ? rawError : rawError?.message) || 'Failed to send reset code',
      };
    }
  }

  async verifyResetCode(email: string, code: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      logger.debug('AuthService verifying reset code', { email });
      const response = await apiClient.post<{ success: boolean; token?: string; error?: string }>(
        '/api/v1/auth/password/verify-code',
        { email, code }
      );
      logger.debug('AuthService reset code verification response received');
      return response;
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      logger.error('AuthService reset code verification failed', error);
      const rawError = apiError.response?.data?.error;
      return {
        success: false,
        error: (typeof rawError === 'string' ? rawError : rawError?.message) || 'Code verification failed',
      };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.debug('AuthService resetting password');
      const response = await apiClient.post<{ success: boolean; message?: string; error?: string }>(
        '/api/v1/auth/password/reset-with-token',
        { token, newPassword }
      );
      logger.debug('AuthService password reset response received');
      return { success: response.success, error: response.error };
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      logger.error('AuthService password reset failed', error);
      const rawError = apiError.response?.data?.error;
      return {
        success: false,
        error: (typeof rawError === 'string' ? rawError : rawError?.message) || 'Password reset failed',
      };
    }
  }
}

export const authService = new AuthService();
