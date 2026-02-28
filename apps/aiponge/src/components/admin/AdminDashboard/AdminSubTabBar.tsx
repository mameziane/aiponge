import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';

interface SubTab {
  id: string;
  label: string;
}

interface AdminSubTabBarProps {
  tabs: SubTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function AdminSubTabBar({ tabs, activeTab, onTabChange }: AdminSubTabBarProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const useGrid = tabs.length > 3;

  if (useGrid) {
    const rows: SubTab[][] = [];
    for (let i = 0; i < tabs.length; i += 3) {
      rows.push(tabs.slice(i, i + 3));
    }

    return (
      <View style={styles.container}>
        <View style={styles.gridContainer}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gridRow}>
              {row.map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.gridTab, activeTab === tab.id && styles.tabActive]}
                  onPress={() => onTabChange(tab.id)}
                  testID={`admin-subtab-${tab.id}`}
                >
                  <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
              {row.length < 3 &&
                Array.from({ length: 3 - row.length }).map((_, i) => (
                  <View key={`empty-${i}`} style={styles.gridTabEmpty} />
                ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.rowContainer}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.rowTab, activeTab === tab.id && styles.tabActive]}
            onPress={() => onTabChange(tab.id)}
            testID={`admin-subtab-${tab.id}`}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background.primary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    rowContainer: {
      flexDirection: 'row',
      gap: 8,
    },
    rowTab: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.background.secondary,
      alignItems: 'center',
    },
    gridContainer: {
      gap: 8,
    },
    gridRow: {
      flexDirection: 'row',
      gap: 8,
    },
    gridTab: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.background.secondary,
      alignItems: 'center',
    },
    gridTabEmpty: {
      flex: 1,
    },
    tabActive: {
      backgroundColor: colors.brand.primary,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.tertiary,
    },
    tabTextActive: {
      color: colors.absolute.white,
      fontWeight: '600',
    },
  });
