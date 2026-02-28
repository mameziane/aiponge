import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, type ColorScheme } from '../../theme';
import { parseContentBlocks, type BlockWithMeta } from '../book/richTextParser';

interface RichTextProps {
  content: string;
  fontSize?: number;
  lineHeight?: number;
  numberOfLines?: number;
  color?: string;
}

export function RichText({ content, fontSize = 14, lineHeight = 20, numberOfLines, color }: RichTextProps) {
  const colors = useThemeColors();
  const styles = useMemo(
    () => createRichTextStyles(colors, fontSize, lineHeight, color),
    [colors, fontSize, lineHeight, color]
  );
  const blocks = useMemo(() => parseContentBlocks(content || ''), [content]);

  if (!content) return null;

  if (numberOfLines !== undefined) {
    const plainText = blocks.map(b => b.plainText).join(' ');
    return (
      <Text style={styles.plainText} numberOfLines={numberOfLines}>
        {plainText}
      </Text>
    );
  }

  if (blocks.length === 0) return null;

  return (
    <View>
      {blocks.map((block, idx) => (
        <RichBlock key={idx} block={block} styles={styles} fontSize={fontSize} lineHeight={lineHeight} />
      ))}
    </View>
  );
}

function RichBlock({
  block,
  styles,
  fontSize,
  lineHeight,
}: {
  block: BlockWithMeta;
  styles: ReturnType<typeof createRichTextStyles>;
  fontSize: number;
  lineHeight: number;
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

  const textContent = renderBoldText(block.plainText, block.boldRanges, styles);

  return (
    <View style={containerStyle}>
      {block.type === 'quote' && <View style={styles.quoteBorder} />}
      {block.type === 'numbered' && <Text style={[styles.numberLabel, { fontSize, lineHeight }]}>{block.number}.</Text>}
      <View style={block.type === 'numbered' ? styles.numberedContent : undefined}>
        <Text style={[styles.text, block.type === 'quote' && styles.quoteText]}>{textContent}</Text>
      </View>
    </View>
  );
}

function renderBoldText(
  text: string,
  boldRanges: { start: number; end: number }[],
  styles: ReturnType<typeof createRichTextStyles>
): React.ReactNode {
  if (boldRanges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (let i = 0; i < boldRanges.length; i++) {
    const range = boldRanges[i];
    if (range.start > lastIndex) {
      parts.push(text.slice(lastIndex, range.start));
    }
    parts.push(
      <Text key={`bold-${i}`} style={styles.boldText}>
        {text.slice(range.start, range.end)}
      </Text>
    );
    lastIndex = range.end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

const createRichTextStyles = (colors: ColorScheme, fontSize: number, lineHeight: number, color?: string) =>
  StyleSheet.create({
    plainText: {
      fontSize,
      lineHeight,
      color: color || colors.text.primary,
    },
    text: {
      fontSize,
      lineHeight,
      color: color || colors.text.primary,
    },
    boldText: {
      fontWeight: '700',
    },
    quoteText: {
      fontStyle: 'italic',
      opacity: 0.85,
    },
    paragraphBlock: {
      marginBottom: 8,
    },
    quoteBlock: {
      flexDirection: 'row',
      marginBottom: 8,
      marginLeft: 4,
      paddingLeft: 12,
    },
    quoteBorder: {
      position: 'absolute',
      left: 0,
      top: 2,
      bottom: 2,
      width: 3,
      borderRadius: 1.5,
      backgroundColor: colors.brand.primary,
      opacity: 0.5,
    },
    reflectionBlock: {
      marginBottom: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.brand.primary + '10',
      borderRadius: 6,
    },
    pauseBlock: {
      height: 16,
    },
    numberedBlock: {
      flexDirection: 'row',
      marginBottom: 6,
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
  });
