/**
 * Collapsible Section Component
 *
 * A section wrapper with animated expand/collapse functionality.
 * Header shows a chevron icon that toggles content visibility.
 */

import { View, Text, TouchableOpacity, StyleSheet, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { ANIMATION } from '../../theme/constants';
import { useTranslation } from '../../i18n';
import { useRef, useEffect, useMemo, type ReactNode } from 'react';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  isExpanded: boolean;
  onToggle: () => void;
  onSeeAllPress?: () => void;
  seeAllLabel?: string;
  children: ReactNode;
  testID?: string;
}

export function CollapsibleSection({
  title,
  subtitle,
  icon,
  isExpanded,
  onToggle,
  onSeeAllPress,
  seeAllLabel,
  children,
  testID,
}: CollapsibleSectionProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: ANIMATION.fast,
      useNativeDriver: true,
    }).start();
  }, [isExpanded, rotateAnim]);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={handleToggle}
          activeOpacity={0.7}
          testID={testID ? `${testID}-toggle` : 'collapsible-toggle'}
        >
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </Animated.View>
          {icon && <Ionicons name={icon} size={20} color={colors.brand.primary} style={styles.icon} />}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </TouchableOpacity>

        {onSeeAllPress && isExpanded && (
          <TouchableOpacity
            style={styles.seeAllButton}
            onPress={onSeeAllPress}
            testID={testID ? `${testID}-see-all` : 'collapsible-see-all'}
          >
            <Text style={styles.seeAllText}>{seeAllLabel || t('components.sectionHeader.seeAll')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.brand.primary} />
          </TouchableOpacity>
        )}
      </View>

      {isExpanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginBottom: 24,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      marginLeft: 8,
      marginRight: 8,
    },
    textContainer: {
      flex: 1,
      marginLeft: 8,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '400',
      color: colors.text.secondary,
      marginTop: 2,
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
    content: {
      overflow: 'hidden',
    },
  });
