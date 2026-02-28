import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useSegments } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useAuthStore, selectUser } from '../../auth/store';
import { useMenuActions } from '../../hooks/ui/useMenuActions';
import { MenuItem, MenuModal, menuStyles } from '../shared/MenuComponents';
import { DeleteAccountConfirmationModal } from './DeleteAccountConfirmationModal';
import { normalizeMediaUrl } from '../../lib/apiConfig';
import { useIsAdmin, useIsLibrarian } from '../../hooks/admin/useAdminQuery';

interface AccountIconMenuProps {
  onClose?: () => void;
}

export function AccountIconMenu({ onClose }: AccountIconMenuProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);
  const user = useAuthStore(selectUser);
  const isGuest = !user || user.isGuest;
  const isAdmin = useIsAdmin();
  const isLibrarian = useIsLibrarian();
  const isLibrarianOnly = isLibrarian && !isAdmin;
  const isSystemAccount = user?.isSystemAccount === true;
  const segments = useSegments();
  const isInAdminSection = segments[0] === '(admin)';

  const displayName = user?.name || user?.username || user?.email?.split('@')[0] || '';
  const displayEmail = user?.email || '';
  const normalizedAvatarUrl = useMemo(() => normalizeMediaUrl(user?.avatarUrl), [user?.avatarUrl]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  const {
    isLoggingOut,
    isDeletingAccount,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    handleNavigate,
    handleLogout,
    handleDeleteAccountPress,
    performAccountDeletion,
  } = useMenuActions({ onClose: handleClose });

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        testID="header-account-icon"
        accessibilityRole="button"
        accessibilityLabel={t('components.accountIconMenu.account')}
        accessibilityHint={t('components.accountIconMenu.opensAccountMenu')}
      >
        {normalizedAvatarUrl ? (
          <Image source={{ uri: normalizedAvatarUrl }} style={styles.headerAvatar} testID="header-avatar-image" />
        ) : (
          <Ionicons name="person-circle-outline" size={28} color={colors.text.primary} />
        )}
      </TouchableOpacity>

      <MenuModal
        visible={visible}
        onClose={handleClose}
        closeLabel={t('components.accountMenu.closeMenu')}
        position="left"
        minWidth={240}
      >
        {isGuest ? (
          <>
            <MenuItem
              icon="diamond-outline"
              label={t('components.accountIconMenu.upgrade', { defaultValue: 'Upgrade' })}
              onPress={() => handleNavigate('/paywall')}
              testID="menu-upgrade"
            />
            <MenuItem
              icon="person-add-outline"
              label={t('settingsPage.createAccount')}
              onPress={() => {
                handleClose();
                router.push('/(auth)/register');
              }}
              testID="menu-auth"
            />
            <MenuItem
              icon="log-out-outline"
              label={t('components.accountMenu.logout')}
              loadingLabel={t('components.accountMenu.loggingOut')}
              onPress={handleLogout}
              loading={isLoggingOut}
              testID="menu-logout"
              showDivider={false}
            />
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.profileItem}
              onPress={() => {
                handleClose();
                router.push('/(settings)/profile');
              }}
              testID="menu-profile"
              accessibilityRole="menuitem"
              accessibilityLabel={t('components.accountIconMenu.profile')}
            >
              {normalizedAvatarUrl ? (
                <Image
                  source={{ uri: normalizedAvatarUrl }}
                  style={styles.profileAvatarImage}
                  testID="menu-profile-avatar"
                />
              ) : (
                <View style={styles.profileAvatar}>
                  <Ionicons name="person" size={24} color={colors.text.dark} />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {displayEmail}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
            </TouchableOpacity>

            <View style={menuStyles.menuDivider} />

            {isAdmin &&
              (isInAdminSection ? (
                <MenuItem
                  icon="arrow-back"
                  label={t('admin.exitAdminMode')}
                  onPress={() => handleNavigate('/(user)/books')}
                  testID="menu-exit-admin"
                  variant="primary"
                />
              ) : (
                <MenuItem
                  icon="shield-checkmark"
                  label={t('navigation.adminDashboard')}
                  onPress={() => handleNavigate('/admin')}
                  testID="menu-admin-dashboard"
                  variant="primary"
                />
              ))}
            {isLibrarianOnly && (
              <MenuItem
                icon="library"
                label={t('librarian.title')}
                onPress={() => handleNavigate('/(librarian)/discover')}
                testID="menu-librarian-dashboard"
                variant="primary"
              />
            )}
            {(!isAdmin || isInAdminSection) && !isLibrarianOnly && (
              <MenuItem
                icon="wallet-outline"
                label={t('components.accountIconMenu.creditsAndPlan')}
                onPress={() => handleNavigate('/credits-plan')}
                testID="menu-credits-plan"
              />
            )}
            <MenuItem
              icon="analytics-outline"
              label={t('settingsPage.reports', { defaultValue: 'Reports' })}
              onPress={() => handleNavigate('/(settings)/reports')}
              testID="menu-reports"
            />
            <MenuItem
              icon="log-out-outline"
              label={t('components.accountMenu.logout')}
              loadingLabel={t('components.accountMenu.loggingOut')}
              onPress={handleLogout}
              loading={isLoggingOut}
              testID="menu-logout"
              showDivider={!isSystemAccount}
            />
            {!isSystemAccount && (
              <MenuItem
                icon="trash-outline"
                label={t('components.accountMenu.deleteAccount')}
                loadingLabel={t('components.accountMenu.deletingAccount')}
                onPress={handleDeleteAccountPress}
                loading={isDeletingAccount}
                variant="danger"
                showDivider={false}
                testID="menu-delete-account"
              />
            )}
          </>
        )}
      </MenuModal>

      <DeleteAccountConfirmationModal
        visible={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={performAccountDeletion}
        isDeleting={isDeletingAccount}
      />
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    headerAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    profileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    profileAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileAvatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.dark,
    },
    profileEmail: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginTop: 2,
    },
  });
