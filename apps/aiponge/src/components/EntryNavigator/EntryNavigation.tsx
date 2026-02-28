import { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';
import { createStyles } from './styles';

interface EntryNavigationProps {
  currentIndex: number;
  totalEntries: number;
  entriesLength: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => Promise<void>;
  onLast: () => void;
}

export const EntryNavigation = memo(function EntryNavigation({
  currentIndex,
  totalEntries,
  entriesLength,
  hasMore,
  isLoadingMore,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: EntryNavigationProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAtStart = currentIndex === 0 || entriesLength === 0;
  const isAtEnd = (currentIndex >= entriesLength - 1 && !hasMore) || entriesLength === 0;

  return (
    <View style={styles.navigationBar}>
      <View style={styles.navButtonsLeft}>
        <TouchableOpacity
          style={[styles.navButton, isAtStart && styles.navButtonDisabled]}
          onPress={onFirst}
          disabled={isAtStart}
          testID="button-first-entry"
        >
          <Ionicons name="play-skip-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, isAtStart && styles.navButtonDisabled]}
          onPress={onPrev}
          disabled={isAtStart}
          testID="button-prev-entry"
        >
          <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.counter}>
        <Text style={styles.counterText}>{totalEntries > 0 ? `${currentIndex + 1}/${totalEntries}` : '0/0'}</Text>
      </View>

      <View style={styles.navButtonsRight}>
        <TouchableOpacity
          style={[styles.navButton, isAtEnd && styles.navButtonDisabled]}
          onPress={onNext}
          disabled={isAtEnd}
          testID="button-next-entry"
        >
          {isLoadingMore ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={20} color={colors.text.primary} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, isAtEnd && styles.navButtonDisabled]}
          onPress={onLast}
          disabled={isAtEnd}
          testID="button-last-entry"
        >
          <Ionicons name="play-skip-forward" size={20} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
});
