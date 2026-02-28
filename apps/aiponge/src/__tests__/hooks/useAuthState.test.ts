import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockSelectUser, mockSelectAuthStatus } = vi.hoisted(() => ({
  mockSelectUser: vi.fn(),
  mockSelectAuthStatus: vi.fn(),
}));

vi.mock('../../auth/store', () => ({
  useAuthStore: vi.fn((selector: Function) =>
    selector({
      user: mockSelectUser(),
      status: mockSelectAuthStatus(),
    })
  ),
  selectUser: (state: any) => state.user,
  selectAuthStatus: (state: any) => state.status,
}));

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { authStateSelectors } from '../../hooks/auth/useAuthState';

describe('authStateSelectors', () => {
  describe('isAuthenticated', () => {
    it('returns true when user exists and isGuest is false', () => {
      const state = { user: { isGuest: false } };
      expect(authStateSelectors.isAuthenticated(state)).toBe(true);
    });

    it('returns true when user exists and isGuest is undefined', () => {
      const state = { user: {} };
      expect(authStateSelectors.isAuthenticated(state)).toBe(true);
    });

    it('returns false when user is null', () => {
      const state = { user: null };
      expect(authStateSelectors.isAuthenticated(state)).toBe(false);
    });

    it('returns false when user exists and isGuest is true', () => {
      const state = { user: { isGuest: true } };
      expect(authStateSelectors.isAuthenticated(state)).toBe(false);
    });
  });

  describe('isGuest', () => {
    it('returns true when user exists and isGuest is true', () => {
      const state = { user: { isGuest: true } };
      expect(authStateSelectors.isGuest(state)).toBe(true);
    });

    it('returns false when user is null', () => {
      const state = { user: null };
      expect(authStateSelectors.isGuest(state)).toBe(false);
    });

    it('returns false when user exists and isGuest is false', () => {
      const state = { user: { isGuest: false } };
      expect(authStateSelectors.isGuest(state)).toBe(false);
    });

    it('returns false when user exists and isGuest is undefined', () => {
      const state = { user: {} };
      expect(authStateSelectors.isGuest(state)).toBe(false);
    });
  });

  describe('hasSession', () => {
    it('returns true when user is not null', () => {
      const state = { user: { id: 'user-1' } };
      expect(authStateSelectors.hasSession(state)).toBe(true);
    });

    it('returns true for a guest user object', () => {
      const state = { user: { id: 'guest-1', isGuest: true } };
      expect(authStateSelectors.hasSession(state)).toBe(true);
    });

    it('returns false when user is null', () => {
      const state = { user: null };
      expect(authStateSelectors.hasSession(state)).toBe(false);
    });
  });
});

describe('useAuthState hook logic', () => {
  function computeAuthState(user: any, status: string) {
    const hasSession = user !== null;
    const isGuest = hasSession && user.isGuest === true;
    const isAuthenticated = hasSession && !isGuest;
    const isLoggedOut = !hasSession;
    const isLoading = status === 'loading';
    return { user, isAuthenticated, isGuest, isLoggedOut, hasSession, userId: user?.id, status, isLoading };
  }

  it('computes correct state for an authenticated user', () => {
    const user = { id: 'user-123', email: 'test@example.com', isGuest: false };
    const result = computeAuthState(user, 'authenticated');

    expect(result.isAuthenticated).toBe(true);
    expect(result.isGuest).toBe(false);
    expect(result.isLoggedOut).toBe(false);
    expect(result.hasSession).toBe(true);
    expect(result.userId).toBe('user-123');
    expect(result.isLoading).toBe(false);
    expect(result.status).toBe('authenticated');
  });

  it('computes correct state for a guest user', () => {
    const user = { id: 'guest-456', email: '', isGuest: true };
    const result = computeAuthState(user, 'authenticated');

    expect(result.isAuthenticated).toBe(false);
    expect(result.isGuest).toBe(true);
    expect(result.isLoggedOut).toBe(false);
    expect(result.hasSession).toBe(true);
    expect(result.userId).toBe('guest-456');
    expect(result.isLoading).toBe(false);
  });

  it('computes correct state when no user is logged in', () => {
    const result = computeAuthState(null, 'unauthenticated');

    expect(result.isAuthenticated).toBe(false);
    expect(result.isGuest).toBe(false);
    expect(result.isLoggedOut).toBe(true);
    expect(result.hasSession).toBe(false);
    expect(result.userId).toBeUndefined();
    expect(result.isLoading).toBe(false);
    expect(result.status).toBe('unauthenticated');
  });

  it('sets isLoading to true when status is loading', () => {
    const result = computeAuthState(null, 'loading');
    expect(result.isLoading).toBe(true);
  });

  it('sets isLoading to false when status is authenticated', () => {
    const user = { id: 'user-1', isGuest: false };
    const result = computeAuthState(user, 'authenticated');
    expect(result.isLoading).toBe(false);
  });

  it('sets isLoading to false when status is idle', () => {
    const result = computeAuthState(null, 'idle');
    expect(result.isLoading).toBe(false);
  });

  it('returns the user object as-is', () => {
    const user = { id: 'u1', email: 'a@b.com', isGuest: false, role: 'user' };
    const result = computeAuthState(user, 'authenticated');
    expect(result.user).toBe(user);
  });
});

describe('useAuthState via mocked store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns authenticated state from store', async () => {
    const user = { id: 'user-abc', email: 'test@test.com', isGuest: false };
    mockSelectUser.mockReturnValue(user);
    mockSelectAuthStatus.mockReturnValue('authenticated');

    const { useAuthState } = await import('../../hooks/auth/useAuthState');
    const result = useAuthState();

    expect(result.user).toEqual(user);
    expect(result.isAuthenticated).toBe(true);
    expect(result.isGuest).toBe(false);
    expect(result.hasSession).toBe(true);
    expect(result.isLoggedOut).toBe(false);
    expect(result.userId).toBe('user-abc');
    expect(result.status).toBe('authenticated');
    expect(result.isLoading).toBe(false);
  });

  it('returns guest state from store', async () => {
    const user = { id: 'guest-xyz', email: '', isGuest: true };
    mockSelectUser.mockReturnValue(user);
    mockSelectAuthStatus.mockReturnValue('authenticated');

    const { useAuthState } = await import('../../hooks/auth/useAuthState');
    const result = useAuthState();

    expect(result.isAuthenticated).toBe(false);
    expect(result.isGuest).toBe(true);
    expect(result.hasSession).toBe(true);
    expect(result.isLoggedOut).toBe(false);
  });

  it('returns logged out state from store', async () => {
    mockSelectUser.mockReturnValue(null);
    mockSelectAuthStatus.mockReturnValue('unauthenticated');

    const { useAuthState } = await import('../../hooks/auth/useAuthState');
    const result = useAuthState();

    expect(result.user).toBeNull();
    expect(result.isAuthenticated).toBe(false);
    expect(result.isGuest).toBe(false);
    expect(result.hasSession).toBe(false);
    expect(result.isLoggedOut).toBe(true);
    expect(result.userId).toBeUndefined();
  });

  it('returns loading state from store', async () => {
    mockSelectUser.mockReturnValue(null);
    mockSelectAuthStatus.mockReturnValue('loading');

    const { useAuthState } = await import('../../hooks/auth/useAuthState');
    const result = useAuthState();

    expect(result.isLoading).toBe(true);
    expect(result.status).toBe('loading');
  });
});
