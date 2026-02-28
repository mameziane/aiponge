import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore, selectIsAuthenticated, selectUser, selectLogout } from '../../auth';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { logger } from '../../lib/logger';

export function AuthScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore(selectUser);
  const logout = useAuthStore(selectLogout);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      await logout();
      router.replace('/(auth)/welcome' as Href);
    } catch (error) {
      logger.error('[AuthScreen] Logout failed', error instanceof Error ? error : undefined, { error });
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isAuthenticated && user) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.content} testID="auth-page-authenticated">
          <View style={styles.iconContainer}>
            <Ionicons name="person-circle" size={80} color={colors.brand.primary} />
          </View>
          <Text style={styles.title}>{t('auth.account')}</Text>
          <Text style={styles.description}>{user.email}</Text>
          {user.phoneNumber && <Text style={styles.description}>{user.phoneNumber}</Text>}

          <TouchableOpacity
            style={[styles.secondaryButton, isLoggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
            testID="button-logout"
          >
            <Text style={[styles.secondaryButtonText, isLoggingOut && styles.buttonTextDisabled]}>
              {isLoggingOut ? t('auth.loggingOut') : t('auth.login')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content} testID="auth-page">
        <View style={styles.iconContainer}>
          <Ionicons name="person-circle" size={80} color={colors.brand.primary} />
        </View>
        <Text style={styles.title}>{t('auth.authentication')}</Text>
        <Text style={styles.description}>{t('auth.authDescription')}</Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => {
            router.push('/(auth)/register' as Href);
          }}
          testID="button-sign-up"
        >
          <Text style={styles.primaryButtonText}>{t('auth.signup')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            router.push('/(auth)/login' as Href);
          }}
          testID="button-login"
        >
          <Text style={styles.secondaryButtonText}>{t('auth.login')}</Text>
        </TouchableOpacity>

        <Text style={styles.guestText}>{t('auth.guestMode')}</Text>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    content: {
      flex: 1,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconContainer: {
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    description: {
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 24,
    },
    primaryButton: {
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      paddingHorizontal: 48,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 16,
      width: '100%',
      maxWidth: 300,
    },
    primaryButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.absolute.white,
      textAlign: 'center',
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      paddingVertical: 16,
      paddingHorizontal: 48,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 2,
      borderColor: colors.brand.primary,
      width: '100%',
      maxWidth: 300,
      marginBottom: 24,
    },
    secondaryButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.brand.primary,
      textAlign: 'center',
    },
    guestText: {
      fontSize: 14,
      color: colors.text.tertiary,
      fontStyle: 'italic',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonTextDisabled: {
      color: colors.text.tertiary,
    },
  });
