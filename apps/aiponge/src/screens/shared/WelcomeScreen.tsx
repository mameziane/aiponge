import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, selectGuestAuth } from '../../auth';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { clearOnboardingForUser } from '../../utils/onboarding';
import { DevResetModal } from '../../components/admin/DevResetModal';

const appIcon = require('../../../assets/logo.png');

export function WelcomeScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDevResetModal, setShowDevResetModal] = useState(false);
  const guestAuth = useAuthStore(selectGuestAuth);

  const handleContinueAsGuest = async () => {
    setLoading(true);
    setError(null);

    const result = await guestAuth();

    setLoading(false);

    if (result.success) {
      router.replace('/');
    } else {
      setError(result.error || t('welcome.authFailed'));
    }
  };

  const handleResetForTesting = async () => {
    await clearOnboardingForUser();
    const logout = useAuthStore.getState().logout;
    await logout();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Image source={appIcon} style={styles.appIcon} />
        </View>

        <Text style={styles.title}>{t('welcome.title')}</Text>
        <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(auth)/register')}
          testID="button-sign-up"
        >
          <Text style={styles.primaryButtonText}>{t('welcome.register')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(auth)/login')}
          testID="button-login"
        >
          <Text style={styles.secondaryButtonText}>{t('welcome.login')}</Text>
        </TouchableOpacity>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.guestButton}
          onPress={handleContinueAsGuest}
          disabled={loading}
          testID="button-guest"
        >
          {loading ? (
            <ActivityIndicator color={colors.text.tertiary} />
          ) : (
            <Text style={styles.guestText}>{t('welcome.continueAsGuest')}</Text>
          )}
        </TouchableOpacity>

        {__DEV__ && (
          <View style={styles.devButtonsContainer}>
            <TouchableOpacity style={styles.resetButton} onPress={handleResetForTesting} testID="button-reset-dev">
              <Ionicons name="refresh-outline" size={16} color={colors.text.tertiary} />
              <Text style={styles.resetText}>{t('welcome.resetAppState')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.devDataResetButton}
              onPress={() => setShowDevResetModal(true)}
              testID="button-dev-data-reset"
            >
              <Ionicons name="trash-outline" size={16} color={colors.semantic.error} />
              <Text style={styles.devDataResetText}>{t('welcome.deleteTestData')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <DevResetModal
          visible={showDevResetModal}
          onClose={() => setShowDevResetModal(false)}
          onResetComplete={() => {
            setShowDevResetModal(false);
            router.replace('/');
          }}
        />
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
      paddingHorizontal: 32,
      paddingTop: 60,
      paddingBottom: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconContainer: {
      marginBottom: 32,
      overflow: 'visible',
    },
    appIcon: {
      width: 240,
      height: 240,
      resizeMode: 'contain',
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 48,
      lineHeight: 24,
      paddingHorizontal: 16,
    },
    primaryButton: {
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      paddingHorizontal: 48,
      borderRadius: BORDER_RADIUS.md,
      width: '100%',
      maxWidth: 320,
      marginBottom: 16,
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
      maxWidth: 320,
      marginBottom: 32,
    },
    secondaryButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.brand.primary,
      textAlign: 'center',
    },
    guestButton: {
      paddingVertical: 16,
      paddingHorizontal: 32,
      marginTop: 16,
    },
    guestText: {
      fontSize: 14,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
    errorContainer: {
      backgroundColor: colors.semantic.errorLight,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      marginTop: 16,
      borderWidth: 1,
      borderColor: colors.semantic.error,
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 14,
      textAlign: 'center',
    },
    devButtonsContainer: {
      flexDirection: 'column',
      gap: 12,
      marginTop: 24,
      alignItems: 'center',
    },
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.text.tertiary,
      opacity: 0.6,
    },
    resetText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    devDataResetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.semantic.error,
      opacity: 0.6,
    },
    devDataResetText: {
      fontSize: 12,
      color: colors.semantic.error,
    },
  });
