import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';

interface Chapter {
  id: string;
  title: string;
  sortOrder: number;
  entries?: { id: string }[];
}

interface TableOfContentsProps {
  bookTitle: string;
  chapters: Chapter[];
  onSelectChapter: (chapterId: string) => void;
}

export function TableOfContents({ bookTitle, chapters, onSelectChapter }: TableOfContentsProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sortedChapters = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('reader.contents')}</Text>
      <Text style={styles.bookTitle}>{bookTitle}</Text>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {sortedChapters.map((chapter, index) => (
          <TouchableOpacity
            key={chapter.id}
            style={styles.chapterItem}
            onPress={() => onSelectChapter(chapter.id)}
            activeOpacity={0.7}
          >
            <View style={styles.chapterNumber}>
              <Text style={styles.chapterNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.chapterInfo}>
              <Text style={styles.chapterTitle}>{chapter.title}</Text>
              {chapter.entries && (
                <Text style={styles.entryCount}>
                  {chapter.entries.length} {chapter.entries.length === 1 ? t('reader.entry') : t('reader.entries')}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 110,
    },
    header: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: 8,
    },
    bookTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 32,
    },
    scrollView: {
      flex: 1,
    },
    chapterItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    chapterNumber: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.background.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    chapterNumberText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    chapterInfo: {
      flex: 1,
    },
    chapterTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
      marginBottom: 2,
    },
    entryCount: {
      fontSize: 13,
      color: colors.text.tertiary,
    },
  });
