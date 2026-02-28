/**
 * Authentication Initialization
 * Wires up auth store with API client
 */

import { apiClient } from '../lib/axiosApiClient';
import { useAuthStore, selectToken } from './store';
import { logger } from '../lib/logger';

let initialized = false;

export function initAuth() {
  if (initialized) {
    return;
  }

  apiClient.setAuthTokenRetriever(() => {
    return selectToken(useAuthStore.getState());
  });

  apiClient.setRefreshTokenRetriever(() => {
    const state = useAuthStore.getState();
    return {
      refreshToken: state.refreshToken,
      sessionId: state.sessionId,
    };
  });

  apiClient.setTokenUpdater(tokens => {
    useAuthStore.setState({
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.sessionId,
    });
  });

  apiClient.setLogoutHandler(async () => {
    const state = useAuthStore.getState();
    const isGuest = state.user?.isGuest ?? false;
    if (isGuest) {
      logger.debug('Guest session expired - creating new session');
    } else {
      logger.warn('Token refresh failed - forcing logout');
    }
    await state.logout();
  });

  initialized = true;
}
