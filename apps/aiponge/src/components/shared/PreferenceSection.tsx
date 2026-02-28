import { useMemo, type ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import type { IconName } from '../../types/ui.types';

interface PreferenceSectionProps {
  icon: IconName;
  title: string;
  hint?: string;
  saving?: boolean;
  savingText?: string;
  children: ReactNode;
}

export function PreferenceSection({
  icon,
  title,
  hint,
  saving = false,
  savingText = 'Saving...',
  children,
}: PreferenceSectionProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name={icon} size={16} color={colors.brand.primary} />
        <Text style={styles.title}>{title}</Text>
        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color={colors.text.tertiary} />
            <Text style={styles.savingText}>{savingText}</Text>
          </View>
        )}
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 6,
    },
    savingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 'auto',
    },
    savingText: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginLeft: 6,
      fontStyle: 'italic',
    },
    hint: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 8,
      lineHeight: 18,
    },
  });

export default PreferenceSection;
