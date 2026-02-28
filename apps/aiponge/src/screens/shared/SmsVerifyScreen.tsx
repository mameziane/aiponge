import { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore, selectSendSmsCode, selectVerifySmsCode } from '../../auth';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';

export function SmsVerifyScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const phoneE164 = params.phone as string;

  const sendSmsCode = useAuthStore(selectSendSmsCode);
  const verifySmsCode = useAuthStore(selectVerifySmsCode);

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (phoneE164) {
      handleSendCode();
    }
  }, [phoneE164]);

  const handleSendCode = async () => {
    if (!phoneE164) {
      setError(t('auth.smsVerify.phoneMissing'));
      return;
    }

    setResending(true);
    setError('');

    const result = await sendSmsCode({ phoneE164 });

    setResending(false);

    if (!result.success) {
      setError(result.error || t('auth.smsVerify.sendFailed'));
    }
  };

  const handleCodeChange = (value: string, index: number) => {
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && value) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        handleVerify(fullCode);
      }
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode?: string) => {
    const verificationCode = fullCode || code.join('');

    if (verificationCode.length !== 6) {
      setError(t('auth.smsVerify.enterAllDigits'));
      return;
    }

    if (!phoneE164) {
      setError(t('auth.smsVerify.phoneMissing'));
      return;
    }

    setLoading(true);
    setError('');

    const result = await verifySmsCode({
      phoneE164,
      code: verificationCode,
    });

    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        router.replace('/(user)/music' as Href);
      }, 1000);
    } else {
      setError(result.error || t('auth.smsVerify.verificationFailed'));
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="button-back">
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('auth.smsVerify.title')}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="phone-portrait-outline" size={80} color={colors.brand.primary} />
        </View>

        <Text style={styles.title}>{t('auth.smsVerify.enterCode')}</Text>
        <Text style={styles.description}>
          {t('auth.smsVerify.codeSent', { phone: phoneE164 || t('common.yourPhone') })}
        </Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={ref => {
                inputRefs.current[index] = ref;
              }}
              style={[styles.codeInput, digit && styles.codeInputFilled]}
              value={digit}
              onChangeText={value => handleCodeChange(value, index)}
              onKeyPress={e => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              testID={`input-code-${index}`}
            />
          ))}
        </View>

        {success ? (
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={24} color={colors.semantic.success} />
            <Text style={styles.successText}>{t('auth.smsVerify.verified')}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.verifyButton, (loading || success) && styles.verifyButtonDisabled]}
          onPress={() => handleVerify()}
          disabled={loading || success}
          testID="button-verify"
        >
          {loading ? (
            <ActivityIndicator color={colors.absolute.white} />
          ) : (
            <Text style={styles.verifyButtonText}>{t('auth.smsVerify.verify')}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.resendContainer}>
          <Text style={styles.resendText}>{t('auth.smsVerify.didntReceive')} </Text>
          <TouchableOpacity onPress={handleSendCode} disabled={resending} testID="button-resend">
            <Text style={styles.resendLink}>
              {resending ? t('auth.smsVerify.sending') : t('auth.smsVerify.resend')}
            </Text>
          </TouchableOpacity>
        </View>
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
      paddingTop: 40,
      alignItems: 'center',
    },
    iconContainer: {
      marginBottom: 32,
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
      marginBottom: 40,
      lineHeight: 24,
    },
    codeContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      maxWidth: 360,
      marginBottom: 32,
    },
    codeInput: {
      width: 50,
      height: 60,
      backgroundColor: colors.background.secondary,
      borderWidth: 2,
      borderColor: colors.border.primary,
      borderRadius: BORDER_RADIUS.md,
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text.primary,
      textAlign: 'center',
    },
    codeInputFilled: {
      borderColor: colors.brand.primary,
    },
    successContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    successText: {
      fontSize: 16,
      color: colors.semantic.success,
      marginLeft: 8,
      fontWeight: '600',
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 14,
      marginBottom: 16,
      textAlign: 'center',
    },
    verifyButton: {
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      borderRadius: BORDER_RADIUS.md,
      width: '100%',
      maxWidth: 320,
      alignItems: 'center',
      marginBottom: 24,
    },
    verifyButtonDisabled: {
      opacity: 0.6,
    },
    verifyButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.absolute.white,
    },
    resendContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    resendText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    resendLink: {
      fontSize: 14,
      color: colors.brand.primary,
      fontWeight: '600',
    },
  });
