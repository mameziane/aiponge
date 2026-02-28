/**
 * Unified Empty State Component
 * Reusable empty state messaging with icon, title, description, and optional action
 * Consolidated from EmptyTrackState.tsx for consistent UI/UX across screens
 */

import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  action?: {
    label: string;
    onPress: () => void;
    testID?: string;
  };
  testID?: string;
}

export function EmptyState({ icon, title, description, action, testID }: EmptyStateProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={48} color={colors.brand.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          style={styles.actionButton}
          testID={action.testID || 'empty-state-action'}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionButtonText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      paddingHorizontal: 20,
    },
    iconContainer: {
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    description: {
      fontSize: 16,
      color: colors.text.tertiary,
      textAlign: 'center',
      lineHeight: 24,
    },
    actionButton: {
      marginTop: 24,
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
    },
    actionButtonText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
    },
  });
