/**
 * Shared generation progress view — reused by BookGeneratorModal and BookListScreen.
 * Extracted from BookGeneratorModal to avoid duplication.
 */

import { useMemo } from 'react';
import { View, Text, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { GenerationProgress } from '../../hooks/book/useBookGenerator';

interface GenerationProgressViewProps {
  progress: GenerationProgress;
  typeColor: string;
}

export function GenerationProgressView({ progress, typeColor }: GenerationProgressViewProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const styles = useMemo(() => createProgressStyles(colors), [colors]);
  const completionRatio = progress.totalChapters > 0 ? progress.completedChapters / progress.totalChapters : 0;

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={typeColor} style={styles.spinner} />
      {progress.bookTitle && (
        <Text style={styles.bookTitle} numberOfLines={2}>
          {progress.bookTitle}
        </Text>
      )}
      <Text style={styles.phaseText}>
        {progress.phase === 'outline'
          ? t('books.generator.progress.creatingOutline')
          : t('books.generator.progress.writingChapters')}
      </Text>
      {progress.phase === 'chapters' && progress.totalChapters > 0 && (
        <>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.round(completionRatio * 100)}%`, backgroundColor: typeColor },
              ]}
            />
          </View>
          <Text style={styles.progressCount}>
            {progress.completedChapters} / {progress.totalChapters}
          </Text>
          <ScrollView style={styles.chapterList} showsVerticalScrollIndicator={false}>
            {progress.chapters.map((ch, idx) => (
              <View key={idx} style={styles.chapterRow}>
                <Ionicons
                  name={
                    ch.status === 'completed'
                      ? 'checkmark-circle'
                      : ch.status === 'generating'
                        ? 'sync-circle'
                        : ch.status === 'failed'
                          ? 'close-circle'
                          : 'ellipse-outline'
                  }
                  size={16}
                  color={
                    ch.status === 'completed'
                      ? colors.semantic.success
                      : ch.status === 'generating'
                        ? typeColor
                        : ch.status === 'failed'
                          ? colors.semantic.error
                          : colors.text.tertiary
                  }
                />
                <Text
                  style={[
                    styles.chapterTitle,
                    ch.status === 'completed' && { color: colors.text.secondary },
                    ch.status === 'generating' && { color: typeColor, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {ch.title}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

export const createProgressStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    spinner: {
      marginBottom: 16,
    },
    bookTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    phaseText: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 16,
    },
    progressBarContainer: {
      width: '100%',
      height: 6,
      backgroundColor: colors.background.darkCard,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    progressCount: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginBottom: 12,
    },
    chapterList: {
      width: '100%',
      maxHeight: 200,
    },
    chapterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    chapterTitle: {
      fontSize: 13,
      color: colors.text.primary,
      flex: 1,
    },
  });
