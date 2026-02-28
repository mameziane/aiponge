import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles } from '../../theme';
import { authService } from '../../auth/service';
import { FormInput, AuthButton } from '../../components/auth';

type Step = 'email' | 'code' | 'newPassword' | 'success';

export function ForgotPasswordScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState('');

  const handleRequestReset = async () => {
    if (!email) {
      setError(t('forgotPassword.enterEmail'));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('forgotPassword.invalidEmail'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await authService.requestPasswordReset(email);

      if (result.success) {
        setStep('code');
      } else {
        setError(result.error || t('forgotPassword.requestFailed'));
      }
    } catch {
      setError(t('forgotPassword.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      setError(t('forgotPassword.enterValidCode'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await authService.verifyResetCode(email, code);

      if (result.success && result.token) {
        setResetToken(result.token);
        setStep('newPassword');
      } else {
        setError(result.error || t('forgotPassword.invalidCode'));
      }
    } catch {
      setError(t('forgotPassword.verifyFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword) {
      setError(t('forgotPassword.enterNewPassword'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('forgotPassword.passwordMinLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('forgotPassword.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await authService.resetPassword(resetToken, newPassword);

      if (result.success) {
        setStep('success');
      } else {
        setError(result.error || t('forgotPassword.resetFailed'));
      }
    } catch {
      setError(t('forgotPassword.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderEmailStep = () => (
    <>
      <Text style={styles.subtitle}>{t('forgotPassword.emailSubtitle')}</Text>

      <FormInput
        label={t('forgotPassword.email')}
        value={email}
        onChangeText={setEmail}
        placeholder={t('forgotPassword.emailPlaceholder')}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={error || undefined}
        testID="input-email"
      />

      <AuthButton
        title={t('forgotPassword.sendCode')}
        onPress={handleRequestReset}
        loading={loading}
        testID="button-request-reset"
      />
    </>
  );

  const renderCodeStep = () => (
    <>
      <Text style={styles.subtitle}>{t('forgotPassword.codeSubtitle', { email })}</Text>

      <FormInput
        label={t('forgotPassword.verificationCode')}
        value={code}
        onChangeText={setCode}
        placeholder={t('forgotPassword.codePlaceholder')}
        keyboardType="number-pad"
        maxLength={6}
        error={error || undefined}
        testID="input-code"
      />

      <AuthButton
        title={t('forgotPassword.verifyCode')}
        onPress={handleVerifyCode}
        loading={loading}
        testID="button-verify-code"
      />

      <AuthButton
        title={t('forgotPassword.tryDifferentEmail')}
        onPress={() => {
          setStep('email');
          setCode('');
          setError('');
        }}
        variant="secondary"
        testID="button-back-to-email"
      />
    </>
  );

  const renderNewPasswordStep = () => (
    <>
      <Text style={styles.subtitle}>{t('forgotPassword.newPasswordSubtitle')}</Text>

      <FormInput
        label={t('forgotPassword.newPassword')}
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder={t('forgotPassword.newPasswordPlaceholder')}
        secureTextEntry
        showPasswordToggle
        autoCapitalize="none"
        testID="input-new-password"
      />

      <FormInput
        label={t('forgotPassword.confirmPassword')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        error={error || undefined}
        testID="input-confirm-password"
      />

      <AuthButton
        title={t('forgotPassword.resetPassword')}
        onPress={handleResetPassword}
        loading={loading}
        testID="button-reset-password"
      />
    </>
  );

  const renderSuccessStep = () => (
    <>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={80} color={colors.semantic.success} />
      </View>

      <Text style={styles.successTitle}>{t('forgotPassword.successTitle')}</Text>
      <Text style={styles.successSubtitle}>{t('forgotPassword.successSubtitle')}</Text>

      <AuthButton
        title={t('forgotPassword.goToLogin')}
        onPress={() => router.replace('/(auth)/login')}
        testID="button-go-to-login"
      />
    </>
  );

  const getTitle = () => {
    switch (step) {
      case 'email':
        return t('forgotPassword.title');
      case 'code':
        return t('forgotPassword.verifyTitle');
      case 'newPassword':
        return t('forgotPassword.newPasswordTitle');
      case 'success':
        return t('forgotPassword.successTitle');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.header}>
          {step !== 'success' && (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="button-back">
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>{getTitle()}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.form}>
            {step === 'email' && renderEmailStep()}
            {step === 'code' && renderCodeStep()}
            {step === 'newPassword' && renderNewPasswordStep()}
            {step === 'success' && renderSuccessStep()}
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
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    form: {
      flex: 1,
    },
    subtitle: {
      fontSize: 16,
      color: colors.text.secondary,
      marginBottom: 24,
      lineHeight: 24,
    },
    successIcon: {
      alignItems: 'center',
      marginTop: 40,
      marginBottom: 24,
    },
    successTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 12,
    },
    successSubtitle: {
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 32,
    },
  });
