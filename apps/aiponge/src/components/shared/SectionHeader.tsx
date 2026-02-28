/**
 * Unified Section Header Component
 * Consolidates 3 previous implementations into one reusable component:
 * - components/SectionHeader.tsx (title, subtitle, onSeeAllPress)
 * - components/AdminDashboard/shared.tsx SectionHeader (icon)
 * - components/shared/ProfileSelectors.tsx SectionHeader (description, variant)
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onSeeAllPress?: () => void;
  seeAllLabel?: string;
  variant?: 'default' | 'compact' | 'light';
  testID?: string;
}

export function SectionHeader({
  title,
  subtitle,
  description,
  icon,
  onSeeAllPress,
  seeAllLabel,
  variant = 'default',
  testID,
}: SectionHeaderProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isLight = variant === 'light';
  const isCompact = variant === 'compact';

  return (
    <View style={[styles.container, isCompact && styles.containerCompact]} testID={testID}>
      <View style={styles.leftContent}>
        {icon && <Ionicons name={icon} size={isCompact ? 18 : 20} color={colors.brand.primary} style={styles.icon} />}
        <View style={styles.textContainer}>
          <Text style={[styles.title, isCompact && styles.titleCompact, isLight && styles.titleLight]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>{subtitle}</Text>}
          {description && <Text style={[styles.description, isLight && styles.descriptionLight]}>{description}</Text>}
        </View>
      </View>

      {onSeeAllPress && (
        <TouchableOpacity
          style={styles.seeAllButton}
          onPress={onSeeAllPress}
          testID={testID ? `${testID}-see-all` : 'section-header-see-all'}
        >
          <Text style={styles.seeAllText}>{seeAllLabel || t('components.sectionHeader.seeAll')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.brand.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    containerCompact: {
      marginBottom: 12,
    },
    leftContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      marginRight: 8,
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    titleCompact: {
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0,
    },
    titleLight: {
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '400',
      color: colors.text.secondary,
      marginTop: 2,
    },
    subtitleLight: {
      color: colors.text.secondary,
    },
    description: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
      lineHeight: 20,
    },
    descriptionLight: {
      color: colors.text.tertiary,
    },
    seeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    seeAllText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
      marginRight: 2,
    },
  });
