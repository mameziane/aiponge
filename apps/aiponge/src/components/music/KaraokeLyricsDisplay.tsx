import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ViewStyle, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { fontFamilies } from '../../theme/typography';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { useTranslation } from '../../i18n';
import { LiquidGlassCard } from '../ui';

interface SyncedWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

interface SyncedLine {
  startTime: number;
  endTime: number;
  text: string;
  type?: 'line' | 'section' | 'backing' | 'instrumental';
  words?: SyncedWord[];
}

interface KaraokeLyricsDisplayProps {
  syncedLines: SyncedLine[];
  containerStyle?: ViewStyle;
  variant?: 'modal' | 'fullscreen';
  onActiveLineChange?: (lineIndex: number) => void;
  showTimingBadge?: boolean;
  timingMethod?: 'whisper-audio-analysis' | 'estimated' | 'unknown';
}

function getTimeSeconds(time: number | undefined, fallback: number = 0): number {
  if (time === undefined) return fallback;
  if (time > 1000) return time / 1000;
  return time;
}

function isSectionHeader(text: string): boolean {
  return /^\[.*\]$/.test(text.trim());
}

function containsSectionHeader(text: string): boolean {
  return /\[.*?\]/.test(text);
}

function stripBracketedContent(text: string): string {
  return text.replace(/\[.*?\]/g, '').trim();
}

interface CleanedLine {
  startTime: number;
  endTime: number;
  text: string;
  words: SyncedWord[];
}

function cleanLinesPreservingStructure(lines: SyncedLine[]): CleanedLine[] {
  const result: CleanedLine[] = [];

  for (const line of lines) {
    if (line.type === 'section' || line.type === 'instrumental') continue;
    if (isSectionHeader(line.text)) continue;

    if (line.words && line.words.length > 0) {
      const cleanedWords: SyncedWord[] = [];

      for (const word of line.words) {
        const trimmed = word.word.trim();
        if (!trimmed) continue;

        if (isSectionHeader(trimmed)) continue;

        if (containsSectionHeader(trimmed)) {
          const cleaned = stripBracketedContent(trimmed);
          if (cleaned) {
            cleanedWords.push({ ...word, word: cleaned });
          }
          continue;
        }

        cleanedWords.push(word);
      }

      if (cleanedWords.length === 0) continue;

      result.push({
        startTime: cleanedWords[0].startTime,
        endTime: cleanedWords[cleanedWords.length - 1].endTime,
        text: cleanedWords.map(w => w.word.trim()).join(' '),
        words: cleanedWords,
      });
    } else {
      const cleanedText = stripBracketedContent(line.text);
      if (!cleanedText) continue;

      result.push({
        startTime: line.startTime,
        endTime: line.endTime,
        text: cleanedText,
        words: [],
      });
    }
  }

  return result;
}

export function KaraokeLyricsDisplay({
  syncedLines,
  containerStyle,
  variant = 'fullscreen',
  onActiveLineChange,
  showTimingBadge = false,
  timingMethod = 'unknown',
}: KaraokeLyricsDisplayProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fullscreenLineStyles = useMemo(() => createFullscreenLineStyles(colors), [colors]);
  const modalLineStyles = useMemo(() => createModalLineStyles(colors), [colors]);
  const { t } = useTranslation();
  const player = useGlobalAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const scrollViewRef = useRef<ScrollView>(null);
  const linePositions = useRef<{ [key: number]: number }>({});
  const lyricsContainerOffset = useRef<number>(0);
  const lastLineIndexRef = useRef<number>(-1);
  const lastWordIndexRef = useRef<number>(-1);

  const hasAnyWordData = useMemo(() => {
    return syncedLines.some(line => line.words && line.words.length > 0);
  }, [syncedLines]);

  const filteredLines = useMemo((): (SyncedLine | CleanedLine)[] => {
    if (hasAnyWordData) {
      const cleaned = cleanLinesPreservingStructure(syncedLines);
      cleaned.sort((a, b) => getTimeSeconds(a.startTime) - getTimeSeconds(b.startTime));
      return cleaned;
    }
    return syncedLines.filter(line => {
      if (line.type === 'section' || line.type === 'instrumental') return false;
      const trimmedText = line.text.trim();
      if (/^\[.*\]$/.test(trimmedText)) return false;
      return stripBracketedContent(trimmedText).length > 0;
    });
  }, [syncedLines, hasAnyWordData]);

  const findActiveLineAndWord = useCallback(
    (currentTime: number): { lineIndex: number; wordIndex: number } => {
      if (!filteredLines || filteredLines.length === 0) {
        return { lineIndex: -1, wordIndex: -1 };
      }

      for (let lineIdx = 0; lineIdx < filteredLines.length; lineIdx++) {
        const line = filteredLines[lineIdx];
        const lineStart = getTimeSeconds(line.startTime);
        const lineEnd = getTimeSeconds(line.endTime);

        if (currentTime >= lineStart && currentTime < lineEnd) {
          if (line.words && line.words.length > 0) {
            for (let wordIdx = 0; wordIdx < line.words.length; wordIdx++) {
              const word = line.words[wordIdx];
              const wordStart = getTimeSeconds(word.startTime);
              const wordEnd = getTimeSeconds(word.endTime);

              if (currentTime >= wordStart && currentTime < wordEnd) {
                return { lineIndex: lineIdx, wordIndex: wordIdx };
              }
            }
            const lastWord = line.words[line.words.length - 1];
            if (currentTime >= getTimeSeconds(lastWord.endTime)) {
              return { lineIndex: lineIdx, wordIndex: line.words.length - 1 };
            }
          }
          return { lineIndex: lineIdx, wordIndex: -1 };
        }
      }

      for (let lineIdx = filteredLines.length - 1; lineIdx >= 0; lineIdx--) {
        const line = filteredLines[lineIdx];
        if (currentTime >= getTimeSeconds(line.endTime)) {
          return { lineIndex: lineIdx, wordIndex: line.words ? line.words.length - 1 : -1 };
        }
      }

      return { lineIndex: -1, wordIndex: -1 };
    },
    [filteredLines]
  );

  const scrollToLine = useCallback(
    (lineIndex: number) => {
      const yPosition = linePositions.current[lineIndex];
      if (lineIndex >= 0 && yPosition !== undefined && scrollViewRef.current) {
        const scrollOffset = variant === 'modal' ? 80 : 120;
        const absoluteY = yPosition + lyricsContainerOffset.current;
        scrollViewRef.current.scrollTo({
          y: Math.max(0, absoluteY - scrollOffset),
          animated: true,
        });
      }
    },
    [variant]
  );

  useEffect(() => {
    linePositions.current = {};
  }, [syncedLines]);

  useEffect(() => {
    if (!filteredLines || filteredLines.length === 0) return;

    let currentTime = playerStatus.currentTime || 0;
    if (currentTime > 1000) {
      currentTime = currentTime / 1000;
    }

    const { lineIndex, wordIndex } = findActiveLineAndWord(currentTime);

    if (lineIndex !== lastLineIndexRef.current) {
      lastLineIndexRef.current = lineIndex;
      setCurrentLineIndex(lineIndex);
      onActiveLineChange?.(lineIndex);
      scrollToLine(lineIndex);
    }

    if (wordIndex !== lastWordIndexRef.current) {
      lastWordIndexRef.current = wordIndex;
      setCurrentWordIndex(wordIndex);
    }
  }, [filteredLines, playerStatus.currentTime, findActiveLineAndWord, scrollToLine, onActiveLineChange]);

  const lineStyles = variant === 'modal' ? modalLineStyles : fullscreenLineStyles;

  const getWordStyle = (lineIndex: number, wordIndex: number, totalWords: number) => {
    const isActiveLine = lineIndex === currentLineIndex;
    const isPastLine = lineIndex < currentLineIndex;
    const isActiveWord = isActiveLine && wordIndex === currentWordIndex;
    const isPastWord = isActiveLine && wordIndex < currentWordIndex;

    if (isActiveWord) {
      return styles.activeWord;
    }
    if (isPastWord || isPastLine) {
      return styles.playedWord;
    }
    if (isActiveLine) {
      return styles.upcomingWordInActiveLine;
    }
    return styles.futureWord;
  };

  return (
    <View style={containerStyle}>
      <LiquidGlassCard intensity="medium" padding={16} style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <Ionicons name="musical-notes" size={18} color={colors.brand.primary} />
          <Text style={styles.cardTitle}>{t('player.lyrics')}</Text>
          {showTimingBadge && timingMethod === 'whisper-audio-analysis' && (
            <View style={styles.karaokeIndicator}>
              <Ionicons name="mic" size={12} color={colors.brand.primary} />
              <Text style={styles.karaokeText}>{t('karaoke.badge')}</Text>
            </View>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {showTimingBadge && timingMethod === 'estimated' && (
            <View style={styles.timingBadge}>
              <Ionicons name="time-outline" size={14} color={colors.text.secondary} />
              <Text style={styles.timingBadgeText}>{t('components.syncedLyrics.estimatedTiming')}</Text>
            </View>
          )}
          <View
            style={styles.lyricsContainer}
            onLayout={e => {
              lyricsContainerOffset.current = e.nativeEvent.layout.y;
            }}
          >
            {filteredLines.map((line, lineIndex) => {
              const isActiveLine = lineIndex === currentLineIndex;
              const hasWordData = line.words && line.words.length > 0;

              return (
                <View
                  key={lineIndex}
                  onLayout={e => {
                    linePositions.current[lineIndex] = e.nativeEvent.layout.y;
                  }}
                  style={[lineStyles.lineContainer, isActiveLine && lineStyles.activeLine]}
                >
                  {hasWordData ? (
                    <Text
                      style={[
                        lineStyles.lineText,
                        isActiveLine && lineStyles.activeLineText,
                        lineIndex < currentLineIndex && lineStyles.playedLineText,
                      ]}
                    >
                      {line.words!.map((word, wordIndex) => (
                        <Text key={wordIndex} style={getWordStyle(lineIndex, wordIndex, line.words!.length)}>
                          {wordIndex > 0 && !word.word.startsWith(' ') ? ' ' : ''}
                          {word.word}
                        </Text>
                      ))}
                    </Text>
                  ) : (
                    <Text
                      style={[
                        lineStyles.lineText,
                        isActiveLine && lineStyles.activeLineText,
                        lineIndex < currentLineIndex && lineStyles.playedLineText,
                      ]}
                    >
                      {line.text.trim()}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </LiquidGlassCard>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    cardContainer: {
      flex: 1,
      marginHorizontal: 0,
      marginTop: 2,
      marginBottom: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    cardTitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
      flex: 1,
    },
    karaokeIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.brand.primary + '20',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.md,
      gap: 4,
    },
    karaokeText: {
      fontSize: 11,
      color: colors.brand.primary,
      fontWeight: '600',
    },
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      paddingVertical: 4,
    },
    timingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: 12,
      gap: 6,
    },
    timingBadgeText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    lyricsContainer: {
      paddingVertical: 4,
    },
    activeWord: {
      color: colors.brand.primary,
      fontWeight: '800',
      textShadowColor: colors.brand.primary + '40',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    },
    playedWord: {
      color: colors.absolute.white,
      opacity: 0.9,
    },
    upcomingWordInActiveLine: {
      color: colors.text.secondary,
      opacity: 0.7,
    },
    futureWord: {
      color: colors.text.tertiary,
      opacity: 0.5,
    },
  });

const createFullscreenLineStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    lineContainer: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginVertical: 2,
    },
    activeLine: {
      transform: [{ scale: 1.02 }],
    },
    lineText: {
      color: colors.text.tertiary,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
      flexWrap: 'wrap',
    },
    activeLineText: {
      color: colors.absolute.white,
      fontWeight: '700',
      fontSize: 18,
      lineHeight: 30,
      textAlign: 'center',
      fontFamily: fontFamilies.body.bold,
    },
    playedLineText: {
      color: colors.absolute.white,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
    },
  });

const createModalLineStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    lineContainer: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginVertical: 1,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: 'transparent',
    },
    activeLine: {
      backgroundColor: colors.brand.primary + '20',
      borderLeftWidth: 3,
      borderLeftColor: colors.brand.primary,
    },
    lineText: {
      color: colors.text.secondary,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
      flexWrap: 'wrap',
    },
    activeLineText: {
      color: colors.text.primary,
      fontWeight: '700',
      fontSize: 18,
      lineHeight: 30,
      textAlign: 'center',
      fontFamily: fontFamilies.body.bold,
    },
    playedLineText: {
      color: colors.text.primary,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
    },
  });
