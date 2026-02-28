import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';

interface FormInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?:
    | 'off'
    | 'username'
    | 'password'
    | 'email'
    | 'name'
    | 'tel'
    | 'street-address'
    | 'postal-code'
    | 'cc-number'
    | 'cc-csc'
    | 'cc-exp'
    | 'cc-exp-month'
    | 'cc-exp-year'
    | 'new-password'
    | 'current-password'
    | 'one-time-code'
    | 'sms-otp'
    | (string & {});
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  disabled?: boolean;
  testID?: string;
  maxLength?: number;
}

export function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  autoCapitalize,
  autoComplete,
  secureTextEntry = false,
  showPasswordToggle = false,
  disabled = false,
  testID,
  maxLength,
}: FormInputProps) {
  const [hidePassword, setHidePassword] = useState(true);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isPassword = secureTextEntry || showPasswordToggle;
  const effectiveSecure = secureTextEntry && hidePassword;

  if (isPassword && showPasswordToggle) {
    return (
      <View>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder={placeholder}
            placeholderTextColor={colors.text.tertiary}
            value={value}
            onChangeText={onChangeText}
            secureTextEntry={effectiveSecure}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete as TextInput['props']['autoComplete']}
            editable={!disabled}
            testID={testID}
            maxLength={maxLength}
          />
          <TouchableOpacity
            onPress={() => setHidePassword(!hidePassword)}
            style={styles.eyeButton}
            testID={testID ? `${testID}-toggle` : undefined}
          >
            <Ionicons name={hidePassword ? 'eye' : 'eye-off'} size={22} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete as TextInput['props']['autoComplete']}
        secureTextEntry={effectiveSecure}
        editable={!disabled}
        testID={testID}
        maxLength={maxLength}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
      marginTop: 16,
    },
    input: {
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text.primary,
    },
    passwordContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.primary,
      borderRadius: BORDER_RADIUS.md,
    },
    passwordInput: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text.primary,
    },
    eyeButton: {
      padding: 14,
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 14,
      marginTop: 12,
    },
  });
