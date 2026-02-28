import { useMemo } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'text';
  testID?: string;
}

export function AuthButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  testID,
}: AuthButtonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;

  const buttonStyle = [
    variant === 'primary' && styles.primaryButton,
    variant === 'secondary' && styles.secondaryButton,
    variant === 'text' && styles.textButton,
    isDisabled && variant === 'primary' && styles.buttonDisabled,
  ];

  const textStyle = [
    variant === 'primary' && styles.primaryButtonText,
    variant === 'secondary' && styles.secondaryButtonText,
    variant === 'text' && styles.textButtonText,
  ];

  return (
    <TouchableOpacity style={buttonStyle} onPress={onPress} disabled={isDisabled} testID={testID}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.absolute.white : colors.brand.primary} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    primaryButton: {
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      borderRadius: BORDER_RADIUS.md,
      marginTop: 32,
      alignItems: 'center',
    },
    secondaryButton: {
      alignItems: 'center',
      marginTop: 16,
      paddingVertical: 12,
    },
    textButton: {
      alignItems: 'center',
      marginTop: 16,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.absolute.white,
    },
    secondaryButtonText: {
      fontSize: 14,
      color: colors.brand.primary,
    },
    textButtonText: {
      fontSize: 14,
      color: colors.brand.primary,
    },
  });
