import { View, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useMemo } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { useAuthStore, selectUser, selectLogout } from '../../auth/store';

export default function AdminProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore(selectUser);
  const logout = useAuthStore(selectLogout);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = async () => {
    await logout();
  };

  const handleExitAdmin = () => {
    router.replace('/(user)/books' as Href);
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={colors.text.primary} />
          </View>
          <Text style={styles.name}>{user?.name || t('admin.adminUser')}</Text>
          <Text style={styles.email}>{user?.email || ''}</Text>
          <Text style={styles.role}>{t('admin.administrator')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('admin.adminActions')}</Text>

          <TouchableOpacity style={styles.menuItem} onPress={handleExitAdmin}>
            <Ionicons name="exit-outline" size={22} color={colors.text.secondary} />
            <Text style={styles.menuItemText}>{t('admin.exitAdminMode')}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(settings)/profile')}>
            <Ionicons name="person-outline" size={22} color={colors.text.secondary} />
            <Text style={styles.menuItemText}>{t('admin.editProfile')}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={[styles.menuItem, styles.logoutButton]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color={colors.semantic.error} />
            <Text style={[styles.menuItemText, styles.logoutText]}>{t('admin.logout')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    content: commonStyles.flexOne,
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
    },
    profileCard: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: 24,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.background.tertiary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    name: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    email: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    role: {
      fontSize: 12,
      color: colors.brand.primary,
      fontWeight: '500',
      paddingHorizontal: 12,
      paddingVertical: 4,
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.tertiary,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
      gap: 12,
    },
    menuItemText: {
      flex: 1,
      fontSize: 16,
      color: colors.text.primary,
    },
    logoutButton: {
      marginTop: 8,
    },
    logoutText: {
      color: colors.semantic.error,
    },
  });
