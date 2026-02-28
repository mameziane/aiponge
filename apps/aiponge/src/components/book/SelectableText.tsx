import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import type { CharRange } from './richTextParser';

interface Word {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
}

interface SelectableTextProps {
  text: string;
  fontSize: number;
  lineHeight: number;
  boldRanges?: CharRange[];
  isQuote?: boolean;
  onSelectionComplete?: (selectedText: string, position: { x: number; y: number }) => void;
  onSelectionStart?: () => void;
  onClearSelection?: () => void;
  clearSelectionTrigger?: number;
}

export function SelectableText({
  text,
  fontSize,
  lineHeight,
  boldRanges,
  isQuote,
  onSelectionComplete,
  onSelectionStart,
  onClearSelection,
  clearSelectionTrigger,
}: SelectableTextProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isExtendMode, setIsExtendMode] = useState(false);

  const lastTapTime = useRef<number>(0);

  useEffect(() => {
    if (clearSelectionTrigger !== undefined && clearSelectionTrigger > 0) {
      setSelectionStart(null);
      setSelectionEnd(null);
      setIsExtendMode(false);
    }
  }, [clearSelectionTrigger]);
  const lastTapIndex = useRef<number | null>(null);

  const hasSelection = selectionStart !== null && selectionEnd !== null;

  const isWordBold = useCallback(
    (startChar: number, endChar: number): boolean => {
      if (!boldRanges || boldRanges.length === 0) return false;
      return boldRanges.some(range => startChar >= range.start && endChar <= range.end);
    },
    [boldRanges]
  );

  const words: Word[] = useMemo(() => {
    const result: Word[] = [];
    const regex = /\S+/g;
    let match;
    let index = 0;
    while ((match = regex.exec(text)) !== null) {
      result.push({
        text: match[0],
        index,
        startChar: match.index,
        endChar: match.index + match[0].length,
      });
      index++;
    }
    return result;
  }, [text]);

  const getSelectedText = useCallback((): string => {
    if (selectionStart === null || selectionEnd === null) return '';
    const min = Math.min(selectionStart, selectionEnd);
    const max = Math.max(selectionStart, selectionEnd);
    const firstWord = words[min];
    const lastWord = words[max];
    if (!firstWord || !lastWord) return '';
    return text.slice(firstWord.startChar, lastWord.endChar);
  }, [selectionStart, selectionEnd, words, text]);

  const handleWordTap = useCallback(
    (wordIndex: number, event: GestureResponderEvent) => {
      const now = Date.now();
      const tapX = event.nativeEvent.pageX;
      const tapY = event.nativeEvent.pageY;

      if (isExtendMode && hasSelection) {
        setSelectionEnd(wordIndex);
        setIsExtendMode(false);
        return;
      }

      if (hasSelection && !isExtendMode) {
        const minSel = Math.min(selectionStart!, selectionEnd!);
        const maxSel = Math.max(selectionStart!, selectionEnd!);

        if (wordIndex >= minSel && wordIndex <= maxSel) {
          const selectedText = getSelectedText();
          onSelectionComplete?.(selectedText, { x: tapX, y: tapY });
          return;
        } else {
          setSelectionStart(null);
          setSelectionEnd(null);
          setIsExtendMode(false);
          onClearSelection?.();
          return;
        }
      }

      if (now - lastTapTime.current < 350 && lastTapIndex.current === wordIndex) {
        setSelectionStart(wordIndex);
        setSelectionEnd(wordIndex);
        setIsExtendMode(true);
        onSelectionStart?.();
        lastTapTime.current = 0;
        lastTapIndex.current = null;
      } else {
        lastTapTime.current = now;
        lastTapIndex.current = wordIndex;
      }
    },
    [
      hasSelection,
      isExtendMode,
      selectionStart,
      selectionEnd,
      getSelectedText,
      onSelectionComplete,
      onClearSelection,
      onSelectionStart,
    ]
  );

  const isWordSelected = useCallback(
    (index: number): boolean => {
      if (selectionStart === null || selectionEnd === null) return false;
      const min = Math.min(selectionStart, selectionEnd);
      const max = Math.max(selectionStart, selectionEnd);
      return index >= min && index <= max;
    },
    [selectionStart, selectionEnd]
  );

  const renderContent = () => {
    const elements: React.ReactElement[] = [];
    let lastEnd = 0;

    words.forEach((word, idx) => {
      const selected = isWordSelected(word.index);
      const nextWord = words[idx + 1];
      const prevWordSelected = idx > 0 && isWordSelected(words[idx - 1].index);
      const isExtendTarget = isExtendMode && hasSelection && !selected;

      if (word.startChar > lastEnd) {
        const whitespace = text.slice(lastEnd, word.startChar);
        const whitespaceSelected = prevWordSelected && selected;
        elements.push(
          <Text
            key={`ws-${idx}`}
            style={[styles.word, { fontSize, lineHeight }, whitespaceSelected && styles.selectedWord]}
          >
            {whitespace}
          </Text>
        );
      }

      const trailingSpace = nextWord ? text.slice(word.endChar, nextWord.startChar) : '';
      const nextWordSelected = nextWord && isWordSelected(nextWord.index);
      const includeTrailingSpace = selected && nextWordSelected;

      const bold = isWordBold(word.startChar, word.endChar);

      elements.push(
        <Text
          key={`word-${word.index}`}
          style={[
            styles.word,
            { fontSize, lineHeight },
            isQuote && styles.quoteWord,
            bold && styles.boldWord,
            selected && styles.selectedWord,
            isExtendTarget && styles.extendableWord,
          ]}
          onPress={e => handleWordTap(word.index, e)}
          suppressHighlighting
        >
          {word.text}
          {includeTrailingSpace ? trailingSpace : ''}
        </Text>
      );

      lastEnd = includeTrailingSpace ? nextWord.startChar : word.endChar;
    });

    if (lastEnd < text.length) {
      elements.push(
        <Text key="trailing" style={[styles.word, { fontSize, lineHeight }]}>
          {text.slice(lastEnd)}
        </Text>
      );
    }

    return elements;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.textWrapper}>{renderContent()}</Text>
      {isExtendMode && hasSelection && <Text style={styles.hint}>{t('reader.selectionHint')}</Text>}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'column',
    },
    textWrapper: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      textAlign: 'justify',
    },
    word: {
      color: colors.text.primary,
    },
    boldWord: {
      fontWeight: '700',
    },
    quoteWord: {
      fontStyle: 'italic',
      color: colors.text.secondary,
    },
    selectedWord: {
      backgroundColor: colors.social.gold,
      color: colors.brand.purple[800],
      borderRadius: 2,
    },
    extendableWord: {
      textDecorationLine: 'underline',
      textDecorationColor: colors.social.gold + '80',
    },
    hint: {
      fontSize: 12,
      color: colors.social.gold,
      marginTop: 8,
      fontStyle: 'italic',
    },
  });
