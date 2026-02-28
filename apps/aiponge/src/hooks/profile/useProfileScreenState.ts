/**
 * useProfileScreenState - Shared profile state and handlers
 *
 * Extracted from MyProfileScreen to be shared between:
 * - ProfileScreen (basics, privacy tabs)
 * - ReflectScreen (insights, wellness, journeys, schedule tabs)
 */

import { useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from '../../i18n';
import { logError } from '../../utils/errorSerialization';
import { logger } from '../../lib/logger';
import type { ProfileData } from '../../types/profile.types';
import { ProfileService } from './ProfileService';
import { useAuthStore, selectUser } from '../../auth/store';
import { useProfile } from '../profile/useProfile';
import { invalidateAuthCaches, forceRefreshExplore } from '../../auth/cacheUtils';

const useToast = () => ({
  toast: ({ title, description, variant }: { title: string; description: string; variant?: string }) => {
    if (variant === 'destructive') {
      Alert.alert(title, description);
    }
  },
});

export function useProfileScreenState() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const user = useAuthStore(selectUser);
  const userId = user?.id;

  const { profileData: sharedProfileData, isLoading, invalidateProfile } = useProfile();

  const [refreshing, setRefreshing] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isSavingBirthdate, setIsSavingBirthdate] = useState(false);

  const profileData: ProfileData | null = useMemo(() => {
    if (!sharedProfileData || !userId) return null;
    return {
      id: userId,
      userId: userId,
      email: sharedProfileData.email,
      profile: {
        name: sharedProfileData.profile?.name,
        bio: sharedProfileData.profile?.bio,
      },
      preferences: {
        notifications: sharedProfileData.preferences?.notifications,
        visibility: sharedProfileData.preferences?.visibility as 'private' | 'public',
        theme: sharedProfileData.preferences?.theme as 'auto' | 'light' | 'dark',
      },
      stats: {
        totalInsights: sharedProfileData.stats?.totalInsights || 0,
        totalReflections: sharedProfileData.stats?.totalReflections || 0,
        totalEntries: sharedProfileData.stats?.totalEntries || 0,
      },
    };
  }, [sharedProfileData, userId]);

  const profileForm = useMemo(
    () => ({
      name: profileData?.profile.name || '',
    }),
    [profileData]
  );

  const currentAvatarUrl = user?.avatarUrl || null;
  const currentBirthdate = user?.birthdate || null;
  const currentEmail = user?.email || profileData?.email || '';

  const setProfileForm = useCallback(
    (updater: (prev: typeof profileForm) => typeof profileForm) => {
      updater(profileForm);
    },
    [profileForm]
  );

  const handleNameSave = async (name: string) => {
    if (!profileData) return;

    try {
      const result = await ProfileService.updateProfile(profileData.id, {
        name,
      });

      if (result.success) {
        // Update auth store with new display name immediately for local UI
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          useAuthStore.setState({
            user: {
              ...currentUser,
              name,
            },
          });
        }

        // CRITICAL: Force refresh explore FIRST with API Gateway cache bypass
        // This fetches fresh data and sets it in React Query BEFORE any invalidations
        // API Gateway caches explore for 2 minutes - this forces a fresh fetch
        await forceRefreshExplore();

        // Now invalidate other React Query caches - they will fetch fresh from server
        invalidateProfile();
        await invalidateAuthCaches();

        // Refresh user from server to ensure consistency
        useAuthStore
          .getState()
          .refreshUser()
          .catch(err => {
            logger.warn('Failed to refresh user after name change', { error: err });
          });

        logger.info('Display name updated and caches invalidated', { newName: name });
      } else {
        throw new Error('Failed to update name');
      }
    } catch (error) {
      logError(error, 'Failed to save display name');
      toast({
        title: t('common.error'),
        description: t('profileSettings.saveFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleAvatarChange = async (uri: string) => {
    if (!userId) return;

    setIsSavingAvatar(true);
    try {
      logger.info('Auto-saving profile image...');
      const uploadResult = await ProfileService.uploadAvatar(uri, userId);

      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error?.message || 'Failed to upload profile image');
      }

      const avatarUrl = uploadResult.data.url;
      logger.info('Profile image uploaded successfully', { url: avatarUrl });

      const result = await ProfileService.updateProfile(userId, { avatar: avatarUrl });

      if (!result.success) {
        throw new Error(result.error || 'Failed to update profile');
      }

      if (user) {
        useAuthStore.setState({ user: { ...user, avatarUrl } });
      }

      invalidateProfile();
    } catch (error) {
      logError(error, 'Failed to save avatar');
      toast({
        title: t('common.error'),
        description: t('profileSettings.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleBirthdateChange = async (date: Date) => {
    if (!userId) return;

    setIsSavingBirthdate(true);
    try {
      const birthdate = date.toISOString().split('T')[0];
      const result = await ProfileService.updateProfile(userId, { birthdate });

      if (!result.success) {
        throw new Error(result.error || 'Failed to update birthdate');
      }

      if (user) {
        useAuthStore.setState({ user: { ...user, birthdate } });
      }

      invalidateProfile();
    } catch (error) {
      logError(error, 'Failed to save birthdate');
      toast({
        title: t('common.error'),
        description: t('profileSettings.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSavingBirthdate(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    logger.debug('Pull-to-refresh triggered');

    try {
      invalidateProfile();
    } catch (error) {
      logger.error('Pull-to-refresh failed', error);
    } finally {
      setRefreshing(false);
    }
  }, [invalidateProfile]);

  return {
    userId,
    user,
    profileData,
    profileForm,
    setProfileForm,
    isLoading,
    refreshing,
    onRefresh,
    currentAvatarUrl,
    currentBirthdate,
    currentEmail,
    isSavingAvatar,
    isSavingBirthdate,
    handleNameSave,
    handleAvatarChange,
    handleBirthdateChange,
    invalidateProfile,
  };
}
