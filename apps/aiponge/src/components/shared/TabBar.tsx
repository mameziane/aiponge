/**
 * Shared TabBar Component
 * Reusable horizontal tab navigation used across all screens.
 * Pill-shaped segmented control style with auto-grid layout for >3 tabs.
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';

export interface TabConfig {
  id: string;
  label: string;
  badge?: number;
}

interface TabBarProps {
  tabs: TabConfig[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  testIDPrefix?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, testIDPrefix = 'tab' }: TabBarProps) {
  const colors = useThemeColors();
  const useGrid = tabs.length > 3;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderTab = (tab: TabConfig) => {
    const isActive = activeTab === tab.id;
    return (
      <TouchableOpacity
        key={tab.id}
        style={[styles.tabTrigger, isActive && styles.tabTriggerActive]}
        onPress={() => onTabChange(tab.id)}
        testID={`${testIDPrefix}-${tab.id}`}
      >
        <Text style={[styles.tabTriggerText, isActive && styles.tabTriggerTextActive]} numberOfLines={1}>
          {tab.label}
        </Text>
        {tab.badge != null && tab.badge > 0 && (
          <View style={[styles.badge, isActive && styles.badgeActive]}>
            <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{tab.badge}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (useGrid) {
    const rows: TabConfig[][] = [];
    for (let i = 0; i < tabs.length; i += 3) {
      rows.push(tabs.slice(i, i + 3));
    }

    return (
      <View style={styles.gridContainer}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map(renderTab)}
            {row.length < 3 &&
              Array.from({ length: 3 - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.gridEmpty} />
              ))}
          </View>
        ))}
      </View>
    );
  }

  return <View style={styles.tabsList}>{tabs.map(renderTab)}</View>;
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    tabsList: {
      flexDirection: 'row',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.xl,
      padding: 4,
      marginBottom: 16,
      gap: 8,
    },
    gridContainer: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.xl,
      padding: 4,
      marginBottom: 16,
      gap: 4,
    },
    gridRow: {
      flexDirection: 'row',
      gap: 4,
    },
    gridEmpty: {
      flex: 1,
    },
    tabTrigger: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.xl,
      minWidth: 0,
    },
    tabTriggerActive: {
      backgroundColor: colors.brand.primary,
    },
    tabTriggerText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '500',
      textAlign: 'center',
    },
    tabTriggerTextActive: {
      color: colors.absolute.white,
      fontWeight: '600',
    },
    badge: {
      position: 'absolute',
      top: 2,
      right: 2,
      backgroundColor: colors.brand.primary,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeActive: {
      backgroundColor: colors.absolute.white,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.absolute.white,
    },
    badgeTextActive: {
      color: colors.brand.primary,
    },
  });
