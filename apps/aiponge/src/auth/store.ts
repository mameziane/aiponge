/**
 * Authentication Store
 * Zustand store with SecureStore persistence for authentication state
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from './secureStorage';
import { authService } from './service';
import { invalidateAuthCaches, clearUserCachesOnLogout } from './cacheUtils';
import { clearOnboardingForUser } from '../utils/onboarding';
import { clearLastVisitedTab } from '../stores/lastTabStore';
import { apiClient } from '../lib/axiosApiClient';
import { queryClient } from '../lib/reactQueryClient';
import { logger } from '../lib/logger';
import { USER_ROLES } from '@aiponge/shared-contracts';
import type {
  AuthState,
  LoginCredentials,
  RegisterData,
  SmsVerificationRequest,
  SmsVerificationData,
  User,
  UserRole,
} from './types';

/**
 * Normalize backend role to frontend UserRole.
 * Backend uses role for authorization (admin/librarian/user). Subscription tier is managed by RevenueCat.
 */
function normalizeRole(backendRole: string | undefined): UserRole {
  if (backendRole === USER_ROLES.ADMIN || backendRole === USER_ROLES.LIBRARIAN) {
    return backendRole;
  }
  return USER_ROLES.USER;
}

interface AuthActions {
  // Auth actions
  login: (
    credentials: LoginCredentials
  ) => Promise<{ success: boolean; error?: string; requiresPhoneVerification?: boolean }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  guestAuth: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  sendSmsCode: (data: SmsVerificationRequest) => Promise<{ success: boolean; error?: string }>;
  verifySmsCode: (data: SmsVerificationData) => Promise<{ success: boolean; error?: string; userId?: string }>;

  // User actions
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;

  // Development bypass
  loginAsTestUser: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  token: null,
  refreshToken: null,
  sessionId: null,
  user: null,
  isAuthenticated: false,
  status: 'idle',
  error: null,
  roleVerified: false,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: async credentials => {
        set({ status: 'loading', error: null });

        const response = await authService.login(credentials);

        if (response.success && response.token && response.user) {
          set({
            token: response.token,
            refreshToken: response.refreshToken ?? null,
            sessionId: response.sessionId ?? null,
            user: {
              ...response.user,
              role: normalizeRole(response.user.role),
              isGuest: response.user.isGuest ?? false,
            },
            isAuthenticated: true,
            status: 'authenticated',
            error: null,
            roleVerified: true,
          });

          invalidateAuthCaches().catch(err => {
            logger.error('Auth cache invalidation failed', err);
          });

          return { success: true };
        } else if (response.requiresPhoneVerification) {
          set({ status: 'unauthenticated', error: response.error || null });
          return { success: false, requiresPhoneVerification: true, error: response.error };
        } else {
          set({ status: 'unauthenticated', error: response.error || null });
          return { success: false, error: response.error };
        }
      },

      register: async data => {
        set({ status: 'loading', error: null });

        const response = await authService.register(data);

        if (response.success && response.token && response.user) {
          set({
            token: response.token,
            refreshToken: response.refreshToken ?? null,
            sessionId: response.sessionId ?? null,
            user: {
              ...response.user,
              role: normalizeRole(response.user.role),
              isGuest: false,
            },
            isAuthenticated: true,
            status: 'authenticated',
            error: null,
            roleVerified: true,
          });

          invalidateAuthCaches().catch(err => {
            logger.error('Auth cache invalidation failed', err);
          });

          return { success: true };
        } else {
          set({ status: 'unauthenticated', error: response.error || null });
          return { success: false, error: response.error };
        }
      },

      guestAuth: async () => {
        set({ status: 'loading', error: null });

        const response = await authService.guestAuth();

        if (response.success && response.token && response.user) {
          set({
            token: response.token,
            refreshToken: response.refreshToken ?? null,
            sessionId: response.sessionId ?? null,
            user: {
              ...response.user,
              role: normalizeRole(response.user.role),
              isGuest: true,
            },
            isAuthenticated: true,
            status: 'authenticated',
            error: null,
            roleVerified: true,
          });

          invalidateAuthCaches().catch(err => {
            logger.error('Auth cache invalidation failed', err);
          });

          return { success: true };
        } else {
          set({ status: 'unauthenticated', error: response.error || null });
          return { success: false, error: response.error };
        }
      },

      logout: async () => {
        const state = get();

        const stack = new Error().stack;
        logger.warn('Logout called', {
          hasToken: !!state.token,
          stackTrace: stack?.split('\n').slice(1, 8).join('\n'),
        });

        apiClient.setLoggingOut(true);

        try {
          if (state.token) {
            await authService.logout(state.sessionId ?? undefined).catch(err => {
              logger.error('Backend logout failed', err);
            });
          }

          await clearUserCachesOnLogout();

          set({
            token: null,
            refreshToken: null,
            sessionId: null,
            user: null,
            isAuthenticated: false,
            status: 'unauthenticated',
            error: null,
          });

          await clearLastVisitedTab();
        } finally {
          apiClient.setLoggingOut(false);
        }
      },

      deleteAccount: async () => {
        const state = get();

        if (!state.token) {
          return { success: false, error: 'Not authenticated' };
        }

        const userId = state.user?.id;

        // Set logging out state BEFORE deletion to suppress 401 errors from in-flight requests
        apiClient.setLoggingOut(true);

        try {
          const response = await authService.deleteAccount();

          if (response.success) {
            set({
              token: null,
              refreshToken: null,
              sessionId: null,
              user: null,
              isAuthenticated: false,
              status: 'unauthenticated',
              error: null,
            });

            // Now cancel pending queries and clear query cache
            // New queries started after this point will have no auth token
            await queryClient.cancelQueries();
            queryClient.clear();

            // Clear local data (non-critical, can run in background)
            if (userId) {
              clearOnboardingForUser(userId).catch(err => {
                logger.error('Onboarding cleanup failed after account deletion', err);
              });
            }

            logger.info('Account deleted successfully');
            return { success: true };
          }

          return { success: false, error: response.error };
        } finally {
          apiClient.setLoggingOut(false);
        }
      },

      sendSmsCode: async data => {
        const response = await authService.sendSmsCode(data);

        if (!response.success) {
          return { success: false, error: response.error };
        }

        return { success: true };
      },

      verifySmsCode: async data => {
        const response = await authService.verifySmsCode(data);

        if (!response.success) {
          return { success: false, error: response.error };
        }

        return { success: true, userId: response.userId };
      },

      setUser: user => {
        set({ user });
      },

      refreshUser: async () => {
        const state = get();

        if (!state.token) {
          logger.debug('refreshUser: No token - skipping');
          return;
        }

        const applyUser = (user: User | null) => {
          if (user) {
            logger.debug('refreshUser: Setting user with fresh role', {
              userId: user.id,
              role: user.role,
              isGuest: user.isGuest,
            });
            set({
              user: { ...user, isGuest: user.isGuest ?? false },
              isAuthenticated: true,
              status: 'authenticated',
              roleVerified: true,
            });
          } else {
            logger.debug('refreshUser: No user returned - logging out');
            get().logout();
          }
        };

        try {
          const user = await authService.fetchUser();
          applyUser(user);
        } catch (err) {
          // For timeout/network errors (no HTTP status), retry once after a short
          // delay before falling back to preserving the existing session.
          interface ErrWithResponse {
            response?: { status?: number };
          }
          const isTransient = !(err as ErrWithResponse)?.response?.status;
          if (isTransient) {
            logger.warn('refreshUser: Transient error on first attempt, retrying in 3s...', { error: err });
            await new Promise<void>(resolve => setTimeout(resolve, 3000));
            try {
              const user = await authService.fetchUser();
              applyUser(user);
              return;
            } catch (retryErr) {
              logger.warn('refreshUser: Retry also failed - preserving existing session', { error: retryErr });
            }
          } else {
            logger.warn('refreshUser: Unexpected error fetching user - preserving existing session', { error: err });
          }
          set({ roleVerified: true });
        }
      },

      loginAsTestUser: async () => {
        logger.debug('DEV MODE: Logging in as test user via guest auth');
        const result = await get().guestAuth();

        if (!result.success) {
          logger.error('DEV MODE: Failed to login as test user', undefined, { error: result.error });
        }
      },
    }),
    {
      name: 'aiponge-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: state => ({
        token: state.token,
        refreshToken: state.refreshToken,
        sessionId: state.sessionId,
        user: state.user
          ? {
              id: state.user.id,
              email: state.user.email,
              username: state.user.username,
              name: state.user.name,
              birthdate: state.user.birthdate,
              avatarUrl: state.user.avatarUrl,
              role: 'user' as const,
              emailVerified: state.user.emailVerified,
              phoneNumber: state.user.phoneNumber,
              phoneE164: state.user.phoneE164,
              phoneVerified: state.user.phoneVerified,
              preferredAuthChannel: state.user.preferredAuthChannel,
              isGuest: state.user.isGuest ?? false,
              isSystemAccount: state.user.isSystemAccount,
              profile: state.user.profile,
            }
          : null,
        isAuthenticated: state.isAuthenticated,
        roleVerified: false,
      }),
      onRehydrateStorage: () => state => {
        logger.debug('Auth hydration starting', {
          hasToken: !!state?.token,
          hasUser: !!state?.user,
        });

        if (state?.token && state?.user && state?.isAuthenticated) {
          logger.debug('Auth hydration: Complete auth state found - role needs verification', {
            userId: state.user.id,
            cachedRole: state.user.role,
            isGuest: state.user.isGuest,
          });
          state.status = 'authenticated';
          state.roleVerified = false;

          if (state.user.isGuest === undefined) {
            state.user = { ...state.user, isGuest: false };
          }

          state.refreshUser();
        } else if (state?.token) {
          logger.debug('Auth hydration: Token exists but user missing');
          state.status = 'loading';
          state.roleVerified = false;
          state.refreshUser();
        } else {
          logger.debug('Auth hydration: No token found');
          if (state) {
            state.status = 'unauthenticated';
            state.roleVerified = false;
          }
        }
      },
    }
  )
);

// Selectors for optimal re-renders
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
export const selectUser = (state: AuthStore) => state.user;
export const selectToken = (state: AuthStore) => state.token;
export const selectAuthStatus = (state: AuthStore) => state.status;
export const selectAuthError = (state: AuthStore) => state.error;
export const selectRoleVerified = (state: AuthStore) => state.roleVerified;
export const selectIsLoading = (state: AuthStore) => state.status === 'loading';
export const selectIsGuest = (state: AuthStore) => state.user?.isGuest ?? false;
export const selectUserRole = (state: AuthStore) => state.user?.role;
export const selectRoleAndVerified = (state: AuthStore) => ({
  role: state.user?.role,
  roleVerified: state.roleVerified,
});
export const selectAuthAndRole = (state: AuthStore) => ({
  isAuthenticated: state.isAuthenticated,
  roleVerified: state.roleVerified,
});
export const selectUserId = (state: AuthStore) => state.user?.id;
export const selectUserAndRole = (state: AuthStore) => ({ user: state.user, roleVerified: state.roleVerified });
export const selectIsAuthReady = (state: AuthStore) => state.status !== 'idle' && state.status !== 'loading';
export const selectLogout = (state: AuthStore) => state.logout;
export const selectLogin = (state: AuthStore) => state.login;
export const selectRegister = (state: AuthStore) => state.register;
export const selectGuestAuth = (state: AuthStore) => state.guestAuth;
export const selectDeleteAccount = (state: AuthStore) => state.deleteAccount;
export const selectSendSmsCode = (state: AuthStore) => state.sendSmsCode;
export const selectVerifySmsCode = (state: AuthStore) => state.verifySmsCode;
