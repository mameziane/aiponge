/**
 * Download User Sync Hook
 * Keeps the download store's currentUserId in sync with the auth store.
 * Must be called once at the app root level (AppProviders).
 */

import { useEffect } from 'react';
import { useAuthStore, selectUserId } from '../auth/store';
import { useDownloadStore } from './store';

export function useDownloadUserSync(): void {
  const userId = useAuthStore(selectUserId);

  useEffect(() => {
    useDownloadStore.getState().setCurrentUser(userId ?? null);
  }, [userId]);
}
