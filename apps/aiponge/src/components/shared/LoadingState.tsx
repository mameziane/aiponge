import { useMemo } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useThemeColors, type ColorScheme } from '../../theme';

interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'large';
  fullScreen?: boolean;
}

export function LoadingState({ message, size = 'large', fullScreen = true }: LoadingStateProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const content = (
    <>
      <ActivityIndicator size={size} color={colors.brand.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
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
    },
    inline: {
      padding: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    message: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.secondary,
    },
  });
