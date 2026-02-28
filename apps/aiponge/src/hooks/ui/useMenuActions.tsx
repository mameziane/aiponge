import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useAuthStore, selectLogout, selectDeleteAccount } from '../../auth/store';
import { clearOnboardingForUser } from '../../utils/onboarding';
import { logger } from '../../lib/logger';

type NavigationRoute =
  | '/settings'
  | '/credits'
  | '/credits-plan'
  | '/store'
  | '/subscription'
  | '/paywall'
  | '/profile'
  | '/preferences'
  | '/activity-calendar'
  | '/auth'
  | '/language'
  | '/ethics'
  | '/manifesto'
  | '/help'
  | '/consent'
  | '/explicit-content'
  | '/admin'
  | '/(librarian)/music'
  | '/(librarian)/discover'
  | '/(user)/books'
  | '/(settings)/reports'
  | '/(settings)/reminders'
  | '/(commerce)/subscription';

interface UseMenuActionsOptions {
  onClose: () => void;
}

interface MenuActionsReturn {
  isLoggingOut: boolean;
  isDeletingAccount: boolean;
  showDeleteConfirmation: boolean;
  showInsightsReport: boolean;
  setShowDeleteConfirmation: (show: boolean) => void;
  setShowInsightsReport: (show: boolean) => void;
  handleNavigate: (route: NavigationRoute) => void;
  handleLogout: () => Promise<void>;
  handleDeleteAccountPress: () => void;
  performAccountDeletion: () => Promise<void>;
  handleOnboardingReset: () => Promise<void>;
  handleInsightsReportPress: () => void;
}

export function useMenuActions({ onClose }: UseMenuActionsOptions): MenuActionsReturn {
  const { t } = useTranslation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showInsightsReport, setShowInsightsReport] = useState(false);

  const logout = useAuthStore(selectLogout);
  const deleteAccount = useAuthStore(selectDeleteAccount);

  const handleNavigate = useCallback(
    (route: NavigationRoute) => {
      onClose();
      router.push(route as Href);
    },
    [onClose]
  );

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    onClose();

    try {
      await logout();
      router.replace('/(auth)/welcome');
    } catch (error) {
      logger.error('Logout failed', error);
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, onClose, logout]);

  const handleDeleteAccountPress = useCallback(() => {
    onClose();
    setShowDeleteConfirmation(true);
  }, [onClose]);

  const performAccountDeletion = useCallback(async () => {
    if (isDeletingAccount) return;

    setIsDeletingAccount(true);

    try {
      const result = await deleteAccount();

      if (result.success) {
        setShowDeleteConfirmation(false);
        router.replace('/(auth)/welcome');
      } else {
        Alert.alert(t('common.error'), result.error || t('components.accountMenu.deleteAccountFailed'));
      }
    } catch (error) {
      logger.error('Delete account failed', error);
      Alert.alert(t('common.error'), t('components.accountMenu.deleteAccountFailed'));
    } finally {
      setIsDeletingAccount(false);
    }
  }, [isDeletingAccount, deleteAccount, t]);

  const handleOnboardingReset = useCallback(async () => {
    onClose();
    await clearOnboardingForUser();
    router.replace('/');
  }, [onClose]);

  const handleInsightsReportPress = useCallback(() => {
    onClose();
    setShowInsightsReport(true);
  }, [onClose]);

  return {
    isLoggingOut,
    isDeletingAccount,
    showDeleteConfirmation,
    showInsightsReport,
    setShowDeleteConfirmation,
    setShowInsightsReport,
    handleNavigate,
    handleLogout,
    handleDeleteAccountPress,
    performAccountDeletion,
    handleOnboardingReset,
    handleInsightsReportPress,
  };
}

export default useMenuActions;
