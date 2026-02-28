import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  fullScreen?: boolean;
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
  retryLabel = 'Try Again',
  fullScreen = true,
}: ErrorStateProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const content = (
    <>
      <Ionicons name="alert-circle-outline" size={48} color={colors.semantic.error} />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  if (fullScreen) {
    return <View style={styles.fullScreen}>{content}</View>;
  }

  return <View style={styles.inline}>{content}</View>;
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    fullScreen: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      padding: 20,
    },
    inline: {
      padding: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    message: {
      marginTop: 12,
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 24,
      paddingVertical: 10,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
    },
    retryText: {
      color: colors.absolute.white,
      fontSize: 14,
      fontWeight: '600',
    },
  });
