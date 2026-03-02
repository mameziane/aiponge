/**
 * Shared TabBar Component
 * Reusable horizontal tab navigation for screens like ProfileEditor and AdminDashboard
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';

export interface TabConfig {
  id: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface TabBarProps {
  tabs: TabConfig[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  testIDPrefix?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, testIDPrefix = 'tab' }: TabBarProps) {
  const colors = useThemeColors();
  const hasIcons = tabs.some(tab => tab.icon);
  const styles = useMemo(() => createStyles(colors, hasIcons), [colors, hasIcons]);

  return (
    <View style={styles.tabsList}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabTrigger, isActive && styles.tabTriggerActive]}
            onPress={() => onTabChange(tab.id)}
            testID={`${testIDPrefix}-${tab.id}`}
            data-testid={`${testIDPrefix}-${tab.id}`}
          >
            {tab.icon && (
              <Ionicons name={tab.icon} size={16} color={isActive ? colors.absolute.white : colors.text.secondary} />
            )}
            <Text style={[styles.tabTriggerText, isActive && styles.tabTriggerTextActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ColorScheme, hasIcons: boolean) =>
  StyleSheet.create({
    tabsList: {
      flexDirection: 'row',
      backgroundColor: colors.background.secondary,
      borderRadius: hasIcons ? BORDER_RADIUS.sm : BORDER_RADIUS.xl,
      padding: 4,
      marginBottom: 16,
      gap: hasIcons ? 2 : 8,
    },
    tabTrigger: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: hasIcons ? 4 : 12,
      borderRadius: hasIcons ? 6 : BORDER_RADIUS.xl,
      gap: hasIcons ? 4 : 0,
      minWidth: 0,
    },
    tabTriggerActive: {
      backgroundColor: colors.brand.primary,
    },
    tabTriggerText: {
      fontSize: hasIcons ? 11 : 13,
      color: colors.text.secondary,
      fontWeight: '500',
      textAlign: 'center',
    },
    tabTriggerTextActive: {
      color: colors.absolute.white,
      fontWeight: '600',
    },
  });
