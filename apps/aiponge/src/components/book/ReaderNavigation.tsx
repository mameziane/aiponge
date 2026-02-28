import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';

interface ReaderNavigationProps {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onToc: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}

export function ReaderNavigation({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  onToc,
  canGoPrev,
  canGoNext,
}: ReaderNavigationProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.navButton, !canGoPrev && styles.navButtonDisabled]}
        onPress={onPrev}
        disabled={!canGoPrev}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={canGoPrev ? colors.text.primary : colors.text.tertiary} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.centerButton} onPress={onToc} activeOpacity={0.7}>
        <Ionicons name="list" size={20} color={colors.text.secondary} />
        <Text style={styles.pageIndicator}>
          {currentPage + 1} / {totalPages}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}
        onPress={onNext}
        disabled={!canGoNext}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-forward" size={24} color={canGoNext ? colors.text.primary : colors.text.tertiary} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.background.darkCard,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    navButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.state.hover,
    },
    navButtonDisabled: {
      backgroundColor: colors.background.darkElevated,
    },
    centerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.state.hover,
    },
    pageIndicator: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '500',
    },
  });
