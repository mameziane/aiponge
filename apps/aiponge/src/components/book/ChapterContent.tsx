import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import { SelectableText } from './SelectableText';
import { parseContentBlocks, type BlockWithMeta } from './richTextParser';
import type { ReaderPage } from '../../hooks/book';

interface ChapterContentProps {
  page: ReaderPage;
  fontSize: number;
  lineHeight: number;
  onTextSelected?: (entryId: string, selectedText: string, position: { x: number; y: number }) => void;
  onSelectionStart?: () => void;
  onSelectionCleared?: () => void;
  clearSelectionTrigger?: number;
}

export function ChapterContent({
  page,
  fontSize,
  lineHeight,
  onTextSelected,
  onSelectionStart,
  onSelectionCleared,
  clearSelectionTrigger,
}: ChapterContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors, fontSize), [colors, fontSize]);

  if (page.type === 'chapter-start') {
    return (
      <View style={styles.chapterStartContainer}>
        <Text style={styles.chapterLabel}>
          {t('reader.chapter')} {page.chapterNumber}
        </Text>
        <Text style={styles.chapterTitle}>{page.chapterTitle}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {page.chapterTitle && <Text style={styles.chapterHeader}>{page.chapterTitle}</Text>}

      {page.entries?.map((entry, index) => (
        <View key={entry.id} style={styles.entryContainer}>
          <EntryContent
            text={entry.text}
            entryId={entry.id}
            fontSize={fontSize}
            lineHeight={lineHeight}
            styles={styles}
            onTextSelected={onTextSelected}
            onSelectionStart={onSelectionStart}
            onSelectionCleared={onSelectionCleared}
            clearSelectionTrigger={clearSelectionTrigger}
          />
          {entry.reference && <Text style={styles.reference}>— {entry.reference}</Text>}
          {index < (page.entries?.length || 0) - 1 && <View style={styles.separator} />}
        </View>
      ))}
    </ScrollView>
  );
}

function EntryContent({
  text,
  entryId,
  fontSize,
  lineHeight,
  styles,
  onTextSelected,
  onSelectionStart,
  onSelectionCleared,
  clearSelectionTrigger,
}: {
  text: string;
  entryId: string;
  fontSize: number;
  lineHeight: number;
  styles: ReturnType<typeof createStyles>;
  onTextSelected?: (entryId: string, selectedText: string, position: { x: number; y: number }) => void;
  onSelectionStart?: () => void;
  onSelectionCleared?: () => void;
  clearSelectionTrigger?: number;
}) {
  const blocks = useMemo(() => parseContentBlocks(text), [text]);

  return (
    <View>
      {blocks.map((block, blockIdx) => (
        <BlockRenderer
          key={blockIdx}
          block={block}
          entryId={entryId}
          blockIdx={blockIdx}
          fontSize={fontSize}
          lineHeight={lineHeight}
          styles={styles}
          onTextSelected={onTextSelected}
          onSelectionStart={onSelectionStart}
          onSelectionCleared={onSelectionCleared}
          clearSelectionTrigger={clearSelectionTrigger}
        />
      ))}
    </View>
  );
}

function BlockRenderer({
  block,
  entryId,
  blockIdx,
  fontSize,
  lineHeight,
  styles,
  onTextSelected,
  onSelectionStart,
  onSelectionCleared,
  clearSelectionTrigger,
}: {
  block: BlockWithMeta;
  entryId: string;
  blockIdx: number;
  fontSize: number;
  lineHeight: number;
  styles: ReturnType<typeof createStyles>;
  onTextSelected?: (entryId: string, selectedText: string, position: { x: number; y: number }) => void;
  onSelectionStart?: () => void;
  onSelectionCleared?: () => void;
  clearSelectionTrigger?: number;
}) {
  if (block.type === 'pause') {
    return <View style={styles.pauseBlock} />;
  }

  const containerStyle =
    block.type === 'quote'
      ? styles.quoteBlock
      : block.type === 'reflection'
        ? styles.reflectionBlock
        : block.type === 'numbered'
          ? styles.numberedBlock
          : styles.paragraphBlock;

  return (
    <View style={containerStyle}>
      {block.type === 'quote' && <View style={styles.quoteBorder} />}
      {block.type === 'numbered' && (
        <Text style={[styles.numberLabel, { fontSize, lineHeight: fontSize * lineHeight }]}>{block.number}.</Text>
      )}
      <View style={block.type === 'numbered' ? styles.numberedContent : undefined}>
        <SelectableText
          text={block.plainText}
          fontSize={fontSize}
          lineHeight={lineHeight}
          boldRanges={block.boldRanges}
          isQuote={block.type === 'quote'}
          onSelectionComplete={(selectedText, position) => {
            onTextSelected?.(entryId, selectedText, position);
          }}
          onSelectionStart={onSelectionStart}
          onClearSelection={onSelectionCleared}
          clearSelectionTrigger={clearSelectionTrigger}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme, fontSize: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    contentContainer: {
      paddingHorizontal: 24,
      paddingTop: 110,
      paddingBottom: 100,
    },
    chapterStartContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingTop: 90,
    },
    chapterLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 16,
    },
    chapterTitle: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
    },
    chapterHeader: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 24,
    },
    entryContainer: {
      marginBottom: 24,
    },
    paragraphBlock: {
      marginBottom: 14,
    },
    quoteBlock: {
      flexDirection: 'row',
      marginBottom: 14,
      marginLeft: 4,
      paddingLeft: 16,
    },
    quoteBorder: {
      position: 'absolute',
      left: 0,
      top: 4,
      bottom: 4,
      width: 3,
      borderRadius: 1.5,
      backgroundColor: colors.brand.primary,
      opacity: 0.5,
    },
    reflectionBlock: {
      marginBottom: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.brand.primary + '10',
      borderRadius: 8,
    },
    pauseBlock: {
      height: 32,
    },
    numberedBlock: {
      flexDirection: 'row',
      marginBottom: 10,
      paddingLeft: 4,
    },
    numberLabel: {
      color: colors.text.tertiary,
      fontWeight: '600',
      width: fontSize * 2,
    },
    numberedContent: {
      flex: 1,
    },
    reference: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginTop: 12,
      textAlign: 'right',
    },
    separator: {
      height: 1,
      backgroundColor: colors.border.primary,
      marginTop: 24,
    },
  });
