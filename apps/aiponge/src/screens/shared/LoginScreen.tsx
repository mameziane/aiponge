import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore, selectLogin } from '../../auth';
import { useThemeColors, type ColorScheme, commonStyles } from '../../theme';
import { getPendingShareContent } from '../../components/system/ShareIntentHandler';
import { FormInput, AuthButton } from '../../components/auth';
import { USER_ROLES } from '@aiponge/shared-contracts';

export function LoginScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const login = useAuthStore(selectLogin);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!identifier || !password) {
      setError(t('loginScreen.enterBothFields'));
      return;
    }

    setLoading(true);
    setError('');

    const result = await login({ identifier, password });

    setLoading(false);

    if (result.success) {
      const currentUser = useAuthStore.getState().user;
      const isAdmin = currentUser?.role === USER_ROLES.ADMIN;
      const isLibrarian = currentUser?.role === USER_ROLES.LIBRARIAN;

      if (isAdmin) {
        router.replace('/(admin)/dashboard' as Href);
      } else if (isLibrarian) {
        router.replace('/(librarian)/discover' as Href);
      } else {
        const pendingContent = await getPendingShareContent();
        if (pendingContent) {
          router.replace({
            pathname: '/(user)/create',
            params: { sharedContent: pendingContent },
          } as Href);
        } else {
          router.replace('/' as Href);
        }
      }
    } else if (result.requiresPhoneVerification) {
      const phone = identifier.startsWith('+') ? identifier : `+${identifier}`;
      router.push(`/(auth)/sms-verify?phone=${encodeURIComponent(phone)}` as Href);
    } else {
      setError(result.error || t('loginScreen.loginFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="button-back">
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('loginScreen.title')}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.form}>
            <FormInput
              label={t('loginScreen.emailOrPhone')}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={t('loginScreen.emailOrPhonePlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              testID="input-identifier"
            />

            <FormInput
              label={t('loginScreen.password')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('loginScreen.passwordPlaceholder')}
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              autoComplete="password"
              testID="input-password"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <AuthButton
              title={t('loginScreen.loginButton')}
              onPress={handleLogin}
              loading={loading}
              testID="button-login-submit"
            />

            <AuthButton
              title={t('loginScreen.forgotPassword')}
              onPress={() => {
                router.push('/(auth)/forgot-password' as Href);
              }}
              variant="text"
              testID="button-forgot-password"
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('loginScreen.noAccount')} </Text>
            <TouchableOpacity
              onPress={() => {
                router.push('/(auth)/register' as Href);
              }}
              testID="button-sign-up-link"
            >
              <Text style={styles.footerLink}>{t('loginScreen.signUp')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    keyboardView: commonStyles.flexOne,
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text.primary,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    form: {
      flex: 1,
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 14,
      marginTop: 12,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingTop: 16,
    },
    footerText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    footerLink: {
      fontSize: 14,
      color: colors.brand.primary,
      fontWeight: '600',
    },
  });
