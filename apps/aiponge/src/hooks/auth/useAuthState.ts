/**
 * useAuthState - Centralized authentication state hook
 *
 * Provides consistent authentication checks across the app.
 * Use this instead of directly accessing useAuthStore for auth state checks.
 *
 * This prevents bugs where code checks `!isGuest` but forgets to check
 * if the user exists at all (null user case).
 */

import { useAuthStore, selectUser, selectAuthStatus } from '../../auth/store';
import type { User, AuthState } from '../../auth/types';

export interface AuthStateResult {
  /** The current user object, or null if not logged in */
  user: User | null;

  /** True if user exists and is NOT a guest (fully authenticated) */
  isAuthenticated: boolean;

  /** True if user exists and IS a guest */
  isGuest: boolean;

  /** True if no user session exists at all */
  isLoggedOut: boolean;

  /** True if user exists (either guest or authenticated) */
  hasSession: boolean;

  /** The user's ID if logged in, undefined otherwise */
  userId: string | undefined;

  /** Current auth status from store */
  status: AuthState['status'];

  /** True if auth is currently loading */
  isLoading: boolean;
}

/**
 * Hook to get authentication state with clear, consistent checks.
 *
 * @example
 * // For protected API calls that require full authentication:
 * const { isAuthenticated } = useAuthState();
 * useQuery({ enabled: isAuthenticated, ... });
 *
 * @example
 * // For features available to guests:
 * const { hasSession } = useAuthState();
 * useQuery({ enabled: hasSession, ... });
 *
 * @example
 * // For showing login prompts:
 * const { isLoggedOut, isGuest } = useAuthState();
 * if (isLoggedOut || isGuest) showLoginPrompt();
 */
export function useAuthState(): AuthStateResult {
  const user = useAuthStore(selectUser);
  const status = useAuthStore(selectAuthStatus);

  const hasSession = user !== null;
  const isGuest = hasSession && user.isGuest === true;
  const isAuthenticated = hasSession && !isGuest;
  const isLoggedOut = !hasSession;
  const isLoading = status === 'loading';

  return {
    user,
    isAuthenticated,
    isGuest,
    isLoggedOut,
    hasSession,
    userId: user?.id,
    status,
    isLoading,
  };
}

/**
 * Selector for use directly with useAuthStore if needed.
 * Prefer using the useAuthState hook instead.
 */
export const authStateSelectors = {
  isAuthenticated: (state: { user: { isGuest?: boolean } | null }) =>
    state.user !== null && state.user.isGuest !== true,
  isGuest: (state: { user: { isGuest?: boolean } | null }) => state.user !== null && state.user.isGuest === true,
  hasSession: (state: { user: unknown }) => state.user !== null,
};
