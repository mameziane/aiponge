/**
 * BookReferences Component
 * Collapsible section displaying book sources for entries
 */

import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useTranslation } from '../../i18n';
import type { Source } from '../../types/profile.types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface BookReferencesProps {
  sources: Source[];
}

export function BookReferences({ sources }: BookReferencesProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpanded} testID="book-references-toggle">
        <View style={styles.headerLeft}>
          <Ionicons name="library-outline" size={16} color={colors.social.gold} />
          <Text style={styles.headerText}>{t('books.book.references')}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{sources.length}</Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.secondary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.sourcesList}>
          {sources.map((source, index) => (
            <View key={index} style={styles.sourceItem}>
              <View style={styles.sourceHeader}>
                <Text style={styles.authorText}>{source.author}</Text>
              </View>
              {source.work && <Text style={styles.workText}>{source.work}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginTop: 12,
      backgroundColor: colors.social.gold + '10',
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.social.gold + '30',
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.social.gold,
    },
    countBadge: {
      backgroundColor: colors.social.gold + '30',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    countText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.social.gold,
    },
    sourcesList: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      gap: 10,
    },
    sourceItem: {
      backgroundColor: colors.background.darkCard,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    sourceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    authorText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    workText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontStyle: 'italic',
      marginBottom: 6,
    },
  });
