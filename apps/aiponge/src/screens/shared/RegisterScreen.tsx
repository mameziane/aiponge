import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore, selectRegister, selectUser } from '../../auth';
import { useThemeColors, type ColorScheme, commonStyles } from '../../theme';
import { getPendingShareContent } from '../../components/system/ShareIntentHandler';
import { FormInput, AuthButton } from '../../components/auth';

export function RegisterScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const register = useAuthStore(selectRegister);
  const currentUser = useAuthStore(selectUser);
  const params = useLocalSearchParams<{ returnTo?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!email || !password) {
      setError(t('registerScreen.enterEmailAndPassword'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('registerScreen.passwordsDoNotMatch'));
      return;
    }

    if (password.length < 8) {
      setError(t('registerScreen.passwordMinLength'));
      return;
    }

    setLoading(true);
    setError('');

    const result = await register({
      email,
      password,
      phoneNumber: phoneNumber || undefined,
      guestUserId: currentUser?.isGuest ? currentUser.id : undefined,
    });

    setLoading(false);

    if (result.success) {
      if (params.returnTo) {
        router.replace(params.returnTo as Href);
        return;
      }

      const pendingContent = await getPendingShareContent();
      if (pendingContent) {
        router.replace({
          pathname: '/(user)/create',
          params: { sharedContent: pendingContent },
        } as Href);
      } else {
        router.replace('/' as Href);
      }
    } else {
      setError(result.error || t('registerScreen.registrationFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="button-back">
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('registerScreen.title')}</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <FormInput
              label={t('registerScreen.email')}
              value={email}
              onChangeText={setEmail}
              placeholder={t('registerScreen.emailPlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              testID="input-email"
            />

            <FormInput
              label={t('registerScreen.phoneNumber')}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder={t('registerScreen.phonePlaceholder')}
              keyboardType="phone-pad"
              autoComplete="tel"
              testID="input-phone"
            />

            <FormInput
              label={t('registerScreen.password')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('registerScreen.passwordPlaceholder')}
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              autoComplete="new-password"
              testID="input-password"
            />

            <FormInput
              label={t('registerScreen.confirmPassword')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('registerScreen.confirmPasswordPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              testID="input-confirm-password"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <AuthButton
              title={t('registerScreen.createAccount')}
              onPress={handleRegister}
              loading={loading}
              testID="button-register-submit"
            />

            <Text style={styles.termsText}>{t('registerScreen.termsText')}</Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('registerScreen.alreadyHaveAccount')} </Text>
            <TouchableOpacity
              onPress={() => {
                router.push('/(auth)/login' as Href);
              }}
              testID="button-login-link"
            >
              <Text style={styles.footerLink}>{t('registerScreen.login')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
    scrollView: {
      flex: 1,
    },
    scrollContent: {
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
    termsText: {
      fontSize: 12,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 18,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingTop: 24,
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
