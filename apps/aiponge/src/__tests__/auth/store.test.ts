import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  mockAuthService,
  mockInvalidateAuthCaches,
  mockClearOnboardingForUser,
  mockClearLastVisitedTab,
  mockApiClient,
  mockQueryClient,
} = vi.hoisted(() => ({
  mockAuthService: {
    login: vi.fn(),
    register: vi.fn(),
    guestAuth: vi.fn(),
    logout: vi.fn(),
    fetchUser: vi.fn(),
    deleteAccount: vi.fn(),
    sendSmsCode: vi.fn(),
    verifySmsCode: vi.fn(),
  },
  mockInvalidateAuthCaches: vi.fn().mockResolvedValue(undefined),
  mockClearOnboardingForUser: vi.fn().mockResolvedValue(undefined),
  mockClearLastVisitedTab: vi.fn().mockResolvedValue(undefined),
  mockApiClient: { setLoggingOut: vi.fn() },
  mockQueryClient: { cancelQueries: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
}));

vi.mock('../../auth/secureStorage', () => ({
  secureStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock('../../auth/service', () => ({
  authService: mockAuthService,
}));

vi.mock('../../auth/cacheUtils', () => ({
  invalidateAuthCaches: () => mockInvalidateAuthCaches(),
  clearUserCachesOnLogout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/onboarding', () => ({
  clearOnboardingForUser: (userId: string) => mockClearOnboardingForUser(userId),
}));

vi.mock('../../stores', () => ({
  clearLastVisitedTab: () => mockClearLastVisitedTab(),
}));

vi.mock('../../stores/lastTabStore', () => ({
  clearLastVisitedTab: () => mockClearLastVisitedTab(),
}));

vi.mock('../../lib/axiosApiClient', () => ({
  apiClient: mockApiClient,
}));

vi.mock('../../lib/reactQueryClient', () => ({
  queryClient: mockQueryClient,
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { useAuthStore } from '../../auth/store';
import type { User } from '../../auth/types';

const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'user',
  emailVerified: true,
  isGuest: false,
};

const mockGuestUser: User = {
  id: 'guest-456',
  email: 'guest@aiponge.com',
  role: 'user',
  emailVerified: false,
  isGuest: true,
};

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      status: 'idle',
      error: null,
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.status).toBe('idle');
      expect(state.error).toBeNull();
    });
  });

  describe('login', () => {
    it('should successfully login and update state', async () => {
      mockAuthService.login.mockResolvedValueOnce({
        success: true,
        token: 'test-token',
        user: mockUser,
      });

      const result = await useAuthStore.getState().login({
        identifier: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.token).toBe('test-token');
      expect(state.user?.id).toBe('user-123');
      expect(state.isAuthenticated).toBe(true);
      expect(state.status).toBe('authenticated');
      expect(mockInvalidateAuthCaches).toHaveBeenCalled();
    });

    it('should handle login failure', async () => {
      mockAuthService.login.mockResolvedValueOnce({
        success: false,
        error: 'Invalid credentials',
      });

      const result = await useAuthStore.getState().login({
        identifier: 'test@example.com',
        password: 'wrongpassword',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.status).toBe('unauthenticated');
    });

    it('should set loading state during login', async () => {
      let loadingStateCaptured = false;

      mockAuthService.login.mockImplementationOnce(async () => {
        loadingStateCaptured = useAuthStore.getState().status === 'loading';
        return { success: true, token: 'token', user: mockUser };
      });

      await useAuthStore.getState().login({
        identifier: 'test@example.com',
        password: 'password123',
      });

      expect(loadingStateCaptured).toBe(true);
    });

    it('should handle phone verification required', async () => {
      mockAuthService.login.mockResolvedValueOnce({
        success: false,
        requiresPhoneVerification: true,
        error: 'Phone verification required',
      });

      const result = await useAuthStore.getState().login({
        identifier: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.requiresPhoneVerification).toBe(true);
    });
  });

  describe('register', () => {
    it('should successfully register and update state', async () => {
      mockAuthService.register.mockResolvedValueOnce({
        success: true,
        token: 'new-user-token',
        user: mockUser,
      });

      const result = await useAuthStore.getState().register({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.token).toBe('new-user-token');
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.isGuest).toBe(false);
    });

    it('should handle registration failure', async () => {
      mockAuthService.register.mockResolvedValueOnce({
        success: false,
        error: 'Email already exists',
      });

      const result = await useAuthStore.getState().register({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
    });
  });

  describe('guestAuth', () => {
    it('should successfully authenticate as guest', async () => {
      mockAuthService.guestAuth.mockResolvedValueOnce({
        success: true,
        token: 'guest-token',
        user: mockGuestUser,
      });

      const result = await useAuthStore.getState().guestAuth();

      expect(result.success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.token).toBe('guest-token');
      expect(state.user?.isGuest).toBe(true);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should handle guest auth failure', async () => {
      mockAuthService.guestAuth.mockResolvedValueOnce({
        success: false,
        error: 'Guest auth unavailable',
      });

      const result = await useAuthStore.getState().guestAuth();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Guest auth unavailable');
    });
  });

  describe('logout', () => {
    beforeEach(() => {
      useAuthStore.setState({
        token: 'existing-token',
        user: mockUser,
        isAuthenticated: true,
        status: 'authenticated',
        error: null,
      });
    });

    it('should clear auth state on logout', async () => {
      mockAuthService.logout.mockResolvedValueOnce({ success: true });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.status).toBe('unauthenticated');
    });

    it('should set logging out flag to suppress 401 errors', async () => {
      mockAuthService.logout.mockResolvedValueOnce({ success: true });

      await useAuthStore.getState().logout();

      expect(mockApiClient.setLoggingOut).toHaveBeenCalledWith(true);
    });

    it('should clear user caches on logout', async () => {
      const { clearUserCachesOnLogout } = await import('../../auth/cacheUtils');
      mockAuthService.logout.mockResolvedValueOnce({ success: true });

      await useAuthStore.getState().logout();

      expect(clearUserCachesOnLogout).toHaveBeenCalled();
    });

    it('should clear last visited tab on logout', async () => {
      mockAuthService.logout.mockResolvedValueOnce({ success: true });

      await useAuthStore.getState().logout();

      expect(mockClearLastVisitedTab).toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    beforeEach(() => {
      useAuthStore.setState({
        token: 'existing-token',
        user: mockUser,
        isAuthenticated: true,
        status: 'authenticated',
        error: null,
      });
    });

    it('should successfully delete account and clear state', async () => {
      mockAuthService.deleteAccount.mockResolvedValueOnce({ success: true });

      const result = await useAuthStore.getState().deleteAccount();

      expect(result.success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should require authentication to delete account', async () => {
      useAuthStore.setState({ token: null });

      const result = await useAuthStore.getState().deleteAccount();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should clear onboarding data after account deletion', async () => {
      mockAuthService.deleteAccount.mockResolvedValueOnce({ success: true });

      await useAuthStore.getState().deleteAccount();

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockClearOnboardingForUser).toHaveBeenCalledWith('user-123');
    });
  });

  describe('refreshUser', () => {
    beforeEach(() => {
      useAuthStore.setState({
        token: 'existing-token',
        user: null,
        isAuthenticated: false,
        status: 'loading',
        error: null,
      });
    });

    it('should update user on refresh', async () => {
      mockAuthService.fetchUser.mockResolvedValueOnce(mockUser);

      await useAuthStore.getState().refreshUser();

      const state = useAuthStore.getState();
      expect(state.user?.id).toBe('user-123');
      expect(state.isAuthenticated).toBe(true);
      expect(state.status).toBe('authenticated');
    });

    it('should logout if refresh returns no user', async () => {
      mockAuthService.fetchUser.mockResolvedValueOnce(null);
      mockAuthService.logout.mockResolvedValueOnce({ success: true });

      await useAuthStore.getState().refreshUser();
    });

    it('should skip refresh if no token', async () => {
      useAuthStore.setState({ token: null });

      await useAuthStore.getState().refreshUser();

      expect(mockAuthService.fetchUser).not.toHaveBeenCalled();
    });
  });

  describe('setUser', () => {
    it('should update user directly', () => {
      useAuthStore.getState().setUser(mockUser);

      const state = useAuthStore.getState();
      expect(state.user?.id).toBe('user-123');
    });

    it('should clear user when set to null', () => {
      useAuthStore.setState({ user: mockUser });
      useAuthStore.getState().setUser(null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
    });
  });

  describe('selectors', () => {
    it('should provide correct selector values', async () => {
      const { selectIsAuthenticated, selectUser, selectToken, selectAuthStatus, selectAuthError } =
        await import('../../auth/store');

      useAuthStore.setState({
        token: 'test-token',
        user: mockUser,
        isAuthenticated: true,
        status: 'authenticated',
        error: null,
      });

      const state = useAuthStore.getState();
      expect(selectIsAuthenticated(state)).toBe(true);
      expect(selectUser(state)?.id).toBe('user-123');
      expect(selectToken(state)).toBe('test-token');
      expect(selectAuthStatus(state)).toBe('authenticated');
      expect(selectAuthError(state)).toBeNull();
    });
  });
});
