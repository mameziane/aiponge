/**
 * Source Mode Section
 * Renders the source-to-song generation UI: book title, source text excerpt,
 * reference attribution, and generate button. Shown when the user navigates
 * from a shared library book's passage highlight.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { useTranslation } from '../../../i18n';

export interface SourceModeSectionProps {
  decodedSourceBookTitle: string | null;
  decodedSourceText: string | null;
  decodedSourceReference: string | null;
  canGenerate: boolean;
  isGeneratingSong: boolean;
  onGenerateSong: () => void;
}

export function SourceModeSection({
  decodedSourceBookTitle,
  decodedSourceText,
  decodedSourceReference,
  canGenerate,
  isGeneratingSong,
  onGenerateSong,
}: SourceModeSectionProps) {
  const colors = useThemeColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="book" size={20} color={colors.brand.accent} />
        <Text style={styles.headerText}>{t('create.sourceToSong')}</Text>
      </View>
      {decodedSourceBookTitle ? <Text style={styles.bookTitle}>{decodedSourceBookTitle}</Text> : null}
      <ScrollView style={styles.contentScroll} nestedScrollEnabled>
        <Text style={styles.entryText}>{decodedSourceText}</Text>
        {decodedSourceReference ? <Text style={styles.reference}>— {decodedSourceReference}</Text> : null}
      </ScrollView>
      <Text style={styles.hint}>{t('create.sourceHint')}</Text>

      <TouchableOpacity
        style={[styles.generateButton, (!canGenerate || isGeneratingSong) && styles.generateButtonDisabled]}
        onPress={onGenerateSong}
        disabled={!canGenerate || isGeneratingSong}
        testID="button-generate-from-source"
      >
        {isGeneratingSong ? (
          <ActivityIndicator size="small" color={colors.brand.primary} />
        ) : (
          <>
            <Ionicons name="musical-notes" size={20} color={colors.background.primary} />
            <Text style={styles.generateButtonText}>{t('create.generateFromSource')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginHorizontal: spacing.screenHorizontal,
      marginVertical: spacing.sectionGap,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: spacing.elementPadding,
      borderWidth: 1,
      borderColor: colors.brand.accent + '40',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    headerText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    bookTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.brand.accent,
      marginBottom: 12,
    },
    contentScroll: {
      maxHeight: 200,
      marginBottom: 12,
    },
    entryText: {
      fontSize: 15,
      lineHeight: 24,
      color: colors.text.primary,
      fontStyle: 'italic',
    },
    reference: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginTop: 12,
      textAlign: 'right',
    },
    hint: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginBottom: 16,
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.accent,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.elementPadding,
      gap: 8,
    },
    generateButtonDisabled: {
      opacity: 0.5,
    },
    generateButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.background.primary,
    },
  });
